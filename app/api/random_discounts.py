"""Staff pages for configuring shop-scoped random checkout discounts.

The page is the React panel's (``frontend/src/panel/pages/marketing/RandomDiscountsPage.tsx``); it reads
``/api/panel/random-discounts`` and posts the form handlers below, which keep the scope checks.
"""
from __future__ import annotations

import secrets
from collections.abc import Callable, Mapping
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.customer_features import redirect
from app.api.spa_pages import spa_response
from app.db.models import RandomDiscount
from app.services.marketing_panel import marketing_tabs
from app.services.random_discounts import (
    RandomDiscountInput,
    create_random_discount,
    random_discount_dashboard,
    random_discount_scope,
    stop_random_discount,
)
from app.services.shop_scope import ShopScopeError

PAGE = "/random-discounts"
API_PATH = "/api/panel/random-discounts"
BAD_PAGE = "صفحه نامعتبر است"


def authorized_scope(staff: dict) -> int | None:
    try:
        return random_discount_scope(staff)
    except (PermissionError, ShopScopeError):
        raise HTTPException(403, "دسترسی ندارید") from None


def parse_form(form: Mapping[str, object]) -> RandomDiscountInput:
    mode = str(form.get("mode", ""))
    try:
        return RandomDiscountInput(
            title=str(form.get("title", "")), mode=mode,
            reduction_kind=str(form.get("reduction_kind", "")),
            minimum=int(str(form.get("minimum", ""))),
            maximum=int(str(form.get("maximum", ""))),
            step=int(str(form.get("step", ""))),
            window_minutes=int(str(form.get("window_minutes", ""))),
            code=str(form.get("code", "")) if mode == "code" else None,
            request_key=str(form.get("request_key", "")),
        )
    except (TypeError, ValueError):
        raise ValueError("بازه، گام یا مدت جلوگیری از تکرار نامعتبر است") from None


def _before(request: Request) -> int | None:
    raw = request.query_params.get("before")
    try:
        return int(raw) if raw else None
    except ValueError:
        raise HTTPException(400, BAD_PAGE) from None


def discount_row(row: RandomDiscount) -> dict[str, Any]:
    return {
        "id": int(row.id),
        "title": row.title,
        "mode": row.mode,
        "reduction_kind": row.reduction_kind,
        "minimum": int(row.minimum),
        "maximum": int(row.maximum),
        "step": int(row.step),
        "window_minutes": int(row.window_minutes),
        "code": row.code or "",
        "is_active": bool(row.is_active),
    }


def register_random_discounts(app: FastAPI, *, require_staff: Callable, get_db: Callable) -> None:
    @app.get(PAGE)
    async def random_discount_page(staff: dict = Depends(require_staff)) -> Response:
        authorized_scope(staff)
        return spa_response("random-discounts")

    @app.get(API_PATH)
    async def random_discount_data(
        request: Request, staff: dict = Depends(require_staff), session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        authorized_scope(staff)
        try:
            data = await random_discount_dashboard(session, staff, before=_before(request))
        except ValueError:
            raise HTTPException(400, BAD_PAGE) from None
        return JSONResponse(
            {
                "sections": marketing_tabs(staff),
                "discounts": [discount_row(row) for row in data.discounts],
                "next_before": data.next_before,
                # A fresh key per read: a resent form reuses its key, so it cannot create the rule twice.
                "request_key": secrets.token_hex(16),
            },
            headers={"Cache-Control": "no-store"},
        )

    @app.post(PAGE)
    async def random_discount_create(
        request: Request, staff: dict = Depends(require_staff), session: AsyncSession = Depends(get_db),
    ) -> Response:
        authorized_scope(staff)
        try:
            await create_random_discount(session, staff, parse_form(await request.form()))
        except ValueError as exc:
            await session.rollback()
            return redirect(PAGE, str(exc))
        return redirect(PAGE)

    @app.post(PAGE + "/{discount_id}/stop")
    async def random_discount_stop(
        discount_id: int, staff: dict = Depends(require_staff), session: AsyncSession = Depends(get_db),
    ) -> Response:
        authorized_scope(staff)
        try:
            await stop_random_discount(session, staff, discount_id)
        except ValueError as exc:
            await session.rollback()
            return redirect(PAGE, str(exc))
        return redirect(PAGE)
