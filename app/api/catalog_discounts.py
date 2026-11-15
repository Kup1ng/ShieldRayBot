"""Staff management surface for shop price adjustments."""
from __future__ import annotations

from collections.abc import Callable, Mapping

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.customer_features import redirect
from app.api.spa_pages import spa_response
from app.services.catalog_discounts import (
    DiscountInput, create_discount, discount_scope, stop_discount,
)
from app.services.shop_scope import ShopScopeError


def authorized_scope(staff: dict) -> int | None:
    try:
        return discount_scope(staff)
    except (PermissionError, ShopScopeError):
        raise HTTPException(403, "دسترسی ندارید") from None


def parse_form(form: Mapping[str, object]) -> DiscountInput:
    scope = str(form.get("scope", ""))
    mode = str(form.get("mode", ""))
    try:
        return DiscountInput(
            title=str(form.get("title", "")), scope=scope, mode=mode,
            reduction_kind=str(form.get("reduction_kind", "")), reduction_value=int(str(form.get("reduction_value", ""))),
            duration_hours=int(str(form.get("duration_hours", ""))) if mode == "temporary" else None,
            plan_id=int(str(form.get("plan_id", ""))) if scope == "plan" else None,
            category_id=int(str(form.get("category_id", ""))) if scope == "category" else None,
            notify=form.get("notify") == "1", request_key=str(form.get("request_key", "")),
        )
    except (TypeError, ValueError):
        raise ValueError("مقدار، مدت یا هدف تخفیف نامعتبر است") from None


def register_catalog_discounts(
    app: FastAPI, *, render: Callable, require_staff: Callable, get_db: Callable,
) -> None:
    @app.get("/catalog-discounts")
    async def discount_page(staff: dict = Depends(require_staff)) -> Response:
        authorized_scope(staff)
        return spa_response("catalog-discounts")

    @app.post("/catalog-discounts")
    async def discount_create(
        request: Request, staff: dict = Depends(require_staff), session: AsyncSession = Depends(get_db),
    ) -> Response:
        authorized_scope(staff)
        try:
            await create_discount(session, staff, parse_form(await request.form()))
        except ValueError as exc:
            await session.rollback()
            return redirect("/catalog-discounts", str(exc))
        return redirect("/catalog-discounts")

    @app.post("/catalog-discounts/{discount_id}/stop")
    async def discount_stop(
        discount_id: int, staff: dict = Depends(require_staff), session: AsyncSession = Depends(get_db),
    ) -> Response:
        authorized_scope(staff)
        try:
            await stop_discount(session, staff, discount_id)
        except ValueError as exc:
            await session.rollback()
            return redirect("/catalog-discounts", str(exc))
        return redirect("/catalog-discounts")
