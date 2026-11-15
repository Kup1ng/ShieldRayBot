"""«اشتراک من»: a shop owner's own package in the web panel (renew, move package, extras).

Thin routes over ``app.services.reseller_package`` and ``app.services.reseller_capacity``,
the same rules the bot uses. Only the shop owner's session (role ``reseller``) reaches
it; the shop comes from that session, never from the form. Everything is paid from the
owner's wallet.
"""

from __future__ import annotations

import logging
from urllib.parse import quote

from fastapi import Depends, Form, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.spa_pages import spa_response
from app.db.models import BotUser, ResellerPlan, ResellerProfile
from app.services.db_safe import rollback_quiet
from app.services.redact import user_safe_error
from app.services.reseller_capacity import buy_extra_gb, buy_extra_users
from app.services.reseller_package import renew_package
from app.services.reseller_panel_subscription import owner_shop_context

logger = logging.getLogger(__name__)

PAGE = "/my-subscription"
_ID_MAX = 2**31 - 1


def _back(*, ok: str = "", err: str = "") -> RedirectResponse:
    query = f"ok={quote(ok)}" if ok else f"err={quote(err)}"
    return RedirectResponse(f"{PAGE}?{query}", status_code=303)


async def _owner_context(session: AsyncSession, staff: dict) -> tuple[BotUser, ResellerProfile]:
    """The shop owner's account and profile; staff sessions and other roles get a 403."""
    try:
        return await owner_shop_context(session, staff)
    except PermissionError as exc:
        raise HTTPException(403, str(exc)) from None


def _valid_id(value: int) -> int:
    if not 0 < int(value) <= _ID_MAX:
        raise ValueError("بسته نامعتبر است")
    return int(value)


def register_reseller_subscription_pages(app, *, render, require_staff, get_db) -> None:
    @app.get(PAGE, response_class=HTMLResponse)
    async def my_subscription(staff: dict = Depends(require_staff), session: AsyncSession = Depends(get_db)):
        await _owner_context(session, staff)
        return spa_response("my-subscription")

    @app.post(f"{PAGE}/renew")
    async def my_subscription_renew(
        plan_id: int = Form(...),
        generation: int = Form(...),
        staff: dict = Depends(require_staff),
        session: AsyncSession = Depends(get_db),
    ):
        owner, profile = await _owner_context(session, staff)
        try:
            result = await renew_package(
                session, owner=owner, profile=profile, plan_id=_valid_id(plan_id), generation=int(generation),
            )
        except ValueError as exc:
            await rollback_quiet(session)
            return _back(err=user_safe_error(exc, fallback="تمدید ناموفق بود"))
        moved = f" — بستهٔ جدید: {result['plan_name']}" if result.get("changed") else ""
        return _back(ok=f"تمدید انجام شد{moved}")

    @app.post(f"{PAGE}/extra")
    async def my_subscription_extra(
        kind: str = Form(...),
        amount: int = Form(...),
        staff: dict = Depends(require_staff),
        session: AsyncSession = Depends(get_db),
    ):
        owner, profile = await _owner_context(session, staff)
        current = await session.get(ResellerPlan, int(profile.plan_id)) if profile.plan_id else None
        if kind not in {"gb", "users"} or current is None:
            return _back(err="درخواست نامعتبر است")
        try:
            if kind == "gb":
                await buy_extra_gb(session, user=owner, profile=profile, plan=current, gb=int(amount))
            else:
                await buy_extra_users(session, user=owner, profile=profile, plan=current, count=int(amount))
        except ValueError as exc:
            await rollback_quiet(session)
            return _back(err=user_safe_error(exc, fallback="خرید ناموفق بود"))
        return _back(ok="ظرفیت اضافه شد")
