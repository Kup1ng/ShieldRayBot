"""«اشتراک من» › کیف پول، اعتبار و صورت‌حساب، هزینه‌ها: the shop owner's own money in the web panel.

The pages are the React panel's (``frontend/src/panel/pages/resellers/My*Page.tsx``); they read the
``/api/panel/my-subscription/*`` endpoints below and post the handlers here. Thin routes over the
services the bot and the Mini App already use (``wallet_topup``, ``payment_settlement``,
``shop_credit``, ``credit_statements``, ``payg_charges``). The owner comes from the session
(``shop_owner_context``), never from a request field; a top-up goes to the owner's platform purse,
where PAYG charges and credit live, with the platform's own payment methods and reviewers.
"""

from __future__ import annotations

import logging
import secrets
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

from fastapi import Depends, FastAPI, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse, RedirectResponse, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.reseller_subscription_pages import shop_owner_context
from app.api.spa_pages import spa_response
from app.db.models import BotUser, CreditStatement, ResellerCharge
from app.services.billing import is_payg
from app.services.numbers import parse_int
from app.services.payment_settlement import check_psp_payment, claim_psp_check_slot
from app.services.redact import user_safe_error
from app.services.reseller_bots import ShopBotUnavailable, open_notify_bot_for_user
from app.services.shop_credit import CreditOverview, credit_overview
from app.services.users import get_all_settings
from app.services.wallet_topup import (
    PSP_CHECK_MESSAGES,
    RECEIPT_MAX_BYTES,
    TOPUP_REQUEST_KEY,
    TopupError,
    recent_topups,
    start_topup,
    submit_topup_receipt,
    topup_options,
)

logger = logging.getLogger(__name__)

WALLET = "/my-subscription/wallet"
CREDIT = "/my-subscription/credit"
CHARGES = "/my-subscription/charges"
WALLET_API = "/api/panel/my-subscription/wallet"
CREDIT_API = "/api/panel/my-subscription/credit"
CHARGES_API = "/api/panel/my-subscription/charges"
NO_STORE = {"Cache-Control": "private, no-store"}
CHARGES_PAGE_SIZE = 50
STATEMENTS_SHOWN = 24
TOPUP_STARTED = "پرداخت ایجاد شد؛ دستور پرداخت را دنبال کنید"
_ID_MAX = 2**31 - 1


class TopupBody(BaseModel):
    """The wallet form: the owner and the purse come from the session, never from here."""

    model_config = ConfigDict(extra="ignore")

    amount: int | str = ""
    method: str = Field("", max_length=32)
    dest_id: str = Field("", max_length=64)
    request_key: str = Field("", pattern=rf"^{TOPUP_REQUEST_KEY.pattern}$")


def _back(path: str, *, ok: str = "", err: str = "") -> RedirectResponse:
    query = f"err={quote(err)}" if err else f"ok={quote(ok)}"
    return RedirectResponse(f"{path}?{query}", status_code=303)


def _json(payload: dict[str, Any], status_code: int = 200) -> JSONResponse:
    return JSONResponse(payload, status_code=status_code, headers=NO_STORE)


def _refused(message: str) -> JSONResponse:
    return _json({"ok": False, "message": message}, status_code=400)


def _iso(value: datetime | None) -> str | None:
    """UTC ISO text; a value without a time zone is read as UTC."""
    if not isinstance(value, datetime):
        return None
    return (value if value.tzinfo else value.replace(tzinfo=timezone.utc)).isoformat()


def _amount(raw: str) -> int | None:
    try:
        return parse_int(str(raw or "").strip())
    except ValueError:
        return None


def _topup_amount(raw: int | str) -> int | None:
    if isinstance(raw, bool):
        return None
    return raw if isinstance(raw, int) else _amount(raw)


def _positive_id(raw: object) -> int | None:
    try:
        value = int(str(raw))
    except (TypeError, ValueError):
        return None
    return value if 0 < value <= _ID_MAX else None


def _credit_block(credit: CreditOverview) -> dict[str, Any]:
    return {
        "status": credit.status,
        "limit": credit.usage.limit,
        "used": credit.usage.used,
        "available": credit.usage.available,
    }


async def _wallet_payload(session: AsyncSession, owner: BotUser, *, is_payg_shop: bool) -> dict[str, Any]:
    balance = int(owner.wallet_balance or 0)
    ui = await get_all_settings(session)
    return {
        "balance": balance,
        "is_payg": is_payg_shop,
        "credit": _credit_block(await credit_overview(session, int(owner.id), balance=balance)),
        "options": topup_options(ui),
        "recent": await recent_topups(session, int(owner.id), shop_id=None),
        # A fresh key per read: a resent form reuses its key, so it cannot start the top-up twice.
        "request_key": secrets.token_hex(16),
    }


async def _credit_payload(session: AsyncSession, owner: BotUser) -> dict[str, Any]:
    balance = int(owner.wallet_balance or 0)
    statements = (await session.scalars(
        select(CreditStatement).where(CreditStatement.shop_id == int(owner.id))
        .order_by(CreditStatement.period_start.desc()).limit(STATEMENTS_SHOWN)
    )).all()
    return {
        "balance": balance,
        "credit": _credit_block(await credit_overview(session, int(owner.id), balance=balance)),
        "statements": [
            {
                "id": int(row.id),
                "period": row.period_start.strftime("%Y-%m"),
                "charges_total": int(row.charges_total or 0),
                "amount_due": int(row.amount_due or 0),
                "due_at": _iso(row.due_at),
                "status": row.status,
            }
            for row in statements
        ],
    }


async def _charges_page(session: AsyncSession, shop_id: int, before: int | None) -> list[ResellerCharge]:
    """Newest first, keyset-paged by id."""
    query = select(ResellerCharge).where(ResellerCharge.shop_id == int(shop_id))
    if before is not None:
        query = query.where(ResellerCharge.id < int(before))
    return list((await session.scalars(query.order_by(ResellerCharge.id.desc()).limit(CHARGES_PAGE_SIZE))).all())


async def _charges_payload(session: AsyncSession, owner: BotUser, *, before: int | None, is_payg_shop: bool) -> dict[str, Any]:
    charges = await _charges_page(session, int(owner.id), before)
    return {
        "balance": int(owner.wallet_balance or 0),
        "is_payg": is_payg_shop,
        "charges": [
            {
                "id": int(row.id),
                "event": row.event,
                "quantity": int(row.quantity or 1),
                "pg_username": row.pg_username or "",
                "created_at": _iso(row.created_at),
                "amount": int(row.amount or 0),
                "status": row.status,
            }
            for row in charges
        ],
        "next_before": int(charges[-1].id) if len(charges) == CHARGES_PAGE_SIZE else None,
    }


async def _begin_topup(session: AsyncSession, owner: BotUser, body: TopupBody) -> JSONResponse:
    try:
        start = await start_topup(
            session, user_id=int(owner.id), shop_id=None, amount=_topup_amount(body.amount),
            method=body.method, dest_id=body.dest_id or None, ui=await get_all_settings(session),
            request_key=body.request_key,
        )
    except TopupError as exc:
        return _refused(str(exc))
    except ValueError as exc:
        logger.warning("web top-up start refused owner=%s", owner.id, exc_info=True)
        return _refused(user_safe_error(exc, fallback="شروع پرداخت ناموفق بود"))
    # The payment instructions are shown once, in this answer; the payment stays in «recent».
    return _json({"ok": True, "message": TOPUP_STARTED, "topup": start.payload()})


async def _submit_receipt(session: AsyncSession, owner: BotUser, payment_id: int | None, image: bytes) -> RedirectResponse:
    if payment_id is None or not image:
        return _back(WALLET, err="رسید نامعتبر است")
    if len(image) > RECEIPT_MAX_BYTES:
        return _back(WALLET, err="حجم تصویر رسید باید کمتر از ۸ مگابایت باشد")
    try:
        bot, should_close = await open_notify_bot_for_user(session, owner, shop_id=None)
    except ShopBotUnavailable:
        logger.warning("web top-up receipt: platform bot unavailable", exc_info=True)
        return _back(WALLET, err="ربات در دسترس نیست؛ کمی بعد دوباره تلاش کنید")
    try:
        result = await submit_topup_receipt(session, bot=bot, user_id=int(owner.id), shop_id=None,
                                            telegram_id=int(owner.telegram_id), payment_id=payment_id, image=image)
    except TopupError as exc:
        return _back(WALLET, err=str(exc))
    finally:
        if should_close:
            await bot.session.close()
    return _back(WALLET, ok=result.message)


async def _check_gateway(session: AsyncSession, owner: BotUser, settlement_id: int | None) -> RedirectResponse:
    if settlement_id is None:
        return _back(WALLET, err="پرداخت نامعتبر است")
    if not claim_psp_check_slot(settlement_id, user_id=int(owner.id)):
        return _back(WALLET, err="چند ثانیه بعد دوباره بزنید")
    try:
        outcome = await check_psp_payment(session, settlement_id=settlement_id, user_id=int(owner.id), shop_id=None)
    except ValueError as exc:
        return _back(WALLET, err=user_safe_error(exc, fallback="بررسی پرداخت ناموفق بود"))
    return _back(WALLET, ok=PSP_CHECK_MESSAGES[outcome])


def register_reseller_finance_pages(app: FastAPI, *, require_staff: Callable, get_db: Callable) -> None:
    @app.get(WALLET)
    async def my_wallet(staff: dict = Depends(require_staff), session: AsyncSession = Depends(get_db)) -> Response:
        await shop_owner_context(session, staff)
        return spa_response("my-subscription/wallet")

    @app.get(WALLET_API)
    async def my_wallet_data(staff: dict = Depends(require_staff), session: AsyncSession = Depends(get_db)) -> JSONResponse:
        owner, profile = await shop_owner_context(session, staff)
        return _json(await _wallet_payload(session, owner, is_payg_shop=is_payg(profile)))

    @app.post(f"{WALLET}/topup")
    async def my_wallet_topup(body: TopupBody, staff: dict = Depends(require_staff),
                              session: AsyncSession = Depends(get_db)) -> JSONResponse:
        owner, _profile = await shop_owner_context(session, staff)
        return await _begin_topup(session, owner, body)

    @app.post(WALLET + "/topup/{payment_id}/receipt")
    async def my_wallet_receipt(payment_id: int, receipt: UploadFile = File(...),
                                staff: dict = Depends(require_staff),
                                session: AsyncSession = Depends(get_db)) -> RedirectResponse:
        owner, _profile = await shop_owner_context(session, staff)
        image = await receipt.read(RECEIPT_MAX_BYTES + 1)
        return await _submit_receipt(session, owner, _positive_id(payment_id), image)

    @app.post(f"{WALLET}/check")
    async def my_wallet_check(settlement_id: str = Form(""), staff: dict = Depends(require_staff),
                              session: AsyncSession = Depends(get_db)) -> RedirectResponse:
        owner, _profile = await shop_owner_context(session, staff)
        return await _check_gateway(session, owner, _positive_id(settlement_id))

    @app.get(CREDIT)
    async def my_credit(staff: dict = Depends(require_staff), session: AsyncSession = Depends(get_db)) -> Response:
        await shop_owner_context(session, staff)
        return spa_response("my-subscription/credit")

    @app.get(CREDIT_API)
    async def my_credit_data(staff: dict = Depends(require_staff), session: AsyncSession = Depends(get_db)) -> JSONResponse:
        owner, _profile = await shop_owner_context(session, staff)
        return _json(await _credit_payload(session, owner))

    @app.get(CHARGES)
    async def my_charges(staff: dict = Depends(require_staff), session: AsyncSession = Depends(get_db)) -> Response:
        await shop_owner_context(session, staff)
        return spa_response("my-subscription/charges")

    @app.get(CHARGES_API)
    async def my_charges_data(request: Request, staff: dict = Depends(require_staff),
                              session: AsyncSession = Depends(get_db)) -> JSONResponse:
        owner, profile = await shop_owner_context(session, staff)
        before = _positive_id(request.query_params.get("before"))
        return _json(await _charges_payload(session, owner, before=before, is_payg_shop=is_payg(profile)))
