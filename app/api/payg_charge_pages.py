"""Owner review of PAYG charges whose panel outcome was unknown.

The page is the React panel's (``frontend/src/panel/pages/billing/PaygChargesReviewPage.tsx``); it reads
``/api/panel/payg/charges/review`` and posts the settle and refund handlers below.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any
from urllib.parse import quote

from fastapi import Depends, FastAPI
from fastapi.responses import JSONResponse, RedirectResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.spa_pages import spa_response
from app.db.models import BotUser, ResellerCharge
from app.services.payg_charges import list_review_charges, resolve_review_charge

REVIEW_PATH = "/payg/charges/review"
API_PATH = "/api/panel/payg/charges/review"
SETTLED_MESSAGE = "هزینه تأیید شد"
REFUNDED_MESSAGE = "مبلغ به کیف پول نماینده برگشت"
ALREADY_DECIDED_MESSAGE = "این هزینه دیگر در انتظار بازبینی نیست"
TIME_FORMAT = "%Y-%m-%d %H:%M"


def _back(*, ok: str = "", err: str = "") -> RedirectResponse:
    query = f"err={quote(err)}" if err else f"ok={quote(ok)}"
    return RedirectResponse(f"{REVIEW_PATH}?{query}", status_code=303)


def charge_row(charge: ResellerCharge, shop_names: dict[int, str]) -> dict[str, Any]:
    shop_id = int(charge.shop_id)
    return {
        "id": int(charge.id),
        "shop_id": shop_id,
        "shop_name": shop_names.get(shop_id) or f"#{shop_id}",
        "event": str(charge.event or ""),
        "quantity": int(charge.quantity or 1),
        "pg_username": charge.pg_username or "",
        "amount": int(charge.amount or 0),
        "created_at": charge.created_at.strftime(TIME_FORMAT) if charge.created_at else "",
    }


async def _shop_names(session: AsyncSession, shop_ids: set[int]) -> dict[int, str]:
    if not shop_ids:
        return {}
    users = (await session.scalars(select(BotUser).where(BotUser.id.in_(shop_ids)))).all()
    return {int(user.id): (user.full_name or user.username or "") for user in users}


def register_payg_charge_pages(app: FastAPI, *, require_admin: Callable, get_db: Callable) -> None:
    @app.get(REVIEW_PATH)
    async def payg_charges_review_page(staff: dict = Depends(require_admin)) -> Response:
        return spa_response("payg/charges/review")

    @app.get(API_PATH)
    async def payg_charges_review(
        staff: dict = Depends(require_admin), session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        charges = await list_review_charges(session, shop_id=None)
        names = await _shop_names(session, {int(charge.shop_id) for charge in charges})
        return JSONResponse(
            {"charges": [charge_row(charge, names) for charge in charges]},
            headers={"Cache-Control": "no-store"},
        )

    async def _decide(charge_id: int, staff: dict, session: AsyncSession, *, applied: bool) -> RedirectResponse:
        actor = str(staff.get("username") or "owner")
        if not await resolve_review_charge(session, charge_id, applied=applied, actor=actor):
            return _back(err=ALREADY_DECIDED_MESSAGE)
        return _back(ok=SETTLED_MESSAGE if applied else REFUNDED_MESSAGE)

    @app.post("/payg/charges/{charge_id}/settle")
    async def payg_charge_settle(
        charge_id: int,
        staff: dict = Depends(require_admin),
        session: AsyncSession = Depends(get_db),
    ) -> RedirectResponse:
        return await _decide(charge_id, staff, session, applied=True)

    @app.post("/payg/charges/{charge_id}/refund")
    async def payg_charge_refund(
        charge_id: int,
        staff: dict = Depends(require_admin),
        session: AsyncSession = Depends(get_db),
    ) -> RedirectResponse:
        return await _decide(charge_id, staff, session, applied=False)
