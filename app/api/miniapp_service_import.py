"""Mini App «اتصال اشتراک قبلی»: the home offer (with a free trial), hiding it, and adding a service by its link.

Thin routes over ``app.services.service_import`` (every ownership, scope and rate-limit check)
and ``service_import_offer``. The customer comes from initData and the shop from the verified
Mini App scope, never from the request. The subscription link is a bearer secret: it travels in
the POST body only, is never logged, never echoed back and never part of a response.
"""

from __future__ import annotations

import logging

from fastapi import Depends, FastAPI, HTTPException, Request
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.miniapp_pages import _no_store, _require_commerce, _scope_ui
from app.db.models import BotUser
from app.services.db_safe import rollback_quiet
from app.services.miniapp_auth import load_mini_user
from app.services.miniapp_shop import mini_scope
from app.services.reseller_bots import ShopBotUnavailable, open_notify_bot_for_user
from app.services.service_import import (
    INVALID_LINK,
    NOT_ENABLED,
    PENDING_NOTICE,
    ImportOutcome,
    ImportResult,
    Reason,
    ServiceImportError,
    import_existing_service,
)
from app.services.service_import_config import read_settings
from app.services.service_import_notify import announce_import_result
from app.services.service_import_offer import dismiss_offer, home_offer

logger = logging.getLogger(__name__)

# A link is at most MAX_LINK_LENGTH characters; the rest of the body is JSON framing.
BODY_LIMIT_BYTES = 16 * 1024
UNEXPECTED_FAILURE = "افزودن سرویس انجام نشد. کمی بعد دوباره تلاش کنید."

OUTCOME_MESSAGES: dict[ImportOutcome, str] = {
    ImportOutcome.ADDED: "سرویس به لیست شما اضافه شد.",
    ImportOutcome.UPGRADED: "سرویس به لیست شما اضافه شد.",
    ImportOutcome.ALREADY_YOURS: "این سرویس از قبل در لیست شماست.",
    ImportOutcome.PENDING_APPROVAL: PENDING_NOTICE,
}
# Refusals that say nothing about who owns what keep their own status; the rest are one 400.
_STATUS_BY_REASON = {Reason.RATE_LIMITED: 429, Reason.PANEL_ERROR: 503, Reason.IDENTITY_UNKNOWN: 503}


async def _read_link(request: Request) -> str:
    """The pasted link from the JSON body; every malformed shape is the same safe refusal."""
    declared = request.headers.get("content-length") or "0"
    if declared.isdigit() and int(declared) > BODY_LIMIT_BYTES:
        raise HTTPException(400, INVALID_LINK)
    try:
        body = await request.json()
    except ValueError:
        raise HTTPException(400, INVALID_LINK) from None
    link = body.get("link") if isinstance(body, dict) else None
    if not isinstance(link, str) or not link.strip():
        raise HTTPException(400, INVALID_LINK)
    return link.strip()


async def _announce_pending(session: AsyncSession, user: BotUser, result: ImportResult, shop_id: int | None) -> None:
    """Alert the admins of a new request through the bot the customer belongs to (best effort)."""
    if not result.new_request:
        return
    try:
        bot, should_close = await open_notify_bot_for_user(session, user, shop_id=shop_id)
    except ShopBotUnavailable:
        # The request is stored and listed in the settings tab; only the alert is lost.
        logger.warning("mini app import alert: shop bot unavailable shop=%s", shop_id, exc_info=True)
        return
    try:
        await announce_import_result(bot, session, user=user, result=result, shop_id=shop_id)
    finally:
        if should_close:
            await bot.session.close()


def _refusal(exc: ServiceImportError) -> HTTPException:
    return HTTPException(_STATUS_BY_REASON.get(exc.reason, 400), str(exc))


def register_miniapp_service_import(app: FastAPI, *, get_db) -> None:
    @app.get("/api/mini/service-import/offer")
    async def mini_import_offer(request: Request, session: AsyncSession = Depends(get_db)):
        user = await load_mini_user(session, request)
        _require_commerce(user)
        ui = await _scope_ui(session, request)
        offer = await home_offer(session, user_id=int(user.id), shop_id=mini_scope(request).shop_id, ui=ui)
        return _no_store({"show": offer.show, "import_enabled": offer.import_enabled, "trial_available": offer.trial_available})

    @app.post("/api/mini/service-import/dismiss")
    async def mini_import_dismiss(request: Request, session: AsyncSession = Depends(get_db)):
        user = await load_mini_user(session, request)
        _require_commerce(user)
        await dismiss_offer(session, int(user.id), mini_scope(request).shop_id)
        return _no_store({"dismissed": True})

    @app.post("/api/mini/service-import")
    async def mini_import_service(request: Request, session: AsyncSession = Depends(get_db)):
        user = await load_mini_user(session, request)
        _require_commerce(user)
        shop_id = mini_scope(request).shop_id
        if not read_settings(await _scope_ui(session, request)).enabled:
            raise HTTPException(403, NOT_ENABLED)
        raw_link = await _read_link(request)
        try:
            result = await import_existing_service(session, user=user, raw_link=raw_link, shop_id=shop_id)
        except ServiceImportError as exc:
            raise _refusal(exc) from None
        except SQLAlchemyError as exc:
            # The driver's message carries the bound parameters, which include the link's token.
            logger.warning("mini app service import: database error (%s)", type(exc).__name__)
            await rollback_quiet(session)
            raise HTTPException(503, UNEXPECTED_FAILURE) from None
        await _announce_pending(session, user, result, shop_id)
        return _no_store({
            "outcome": result.outcome.value,
            "message": OUTCOME_MESSAGES[result.outcome],
            "service_id": int(result.service.id) if result.service is not None else None,
        })

