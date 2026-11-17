"""JSON data endpoints of the React web panel: Plans, categories, add-ons, catalog discounts, gift codes and message variables.

Read endpoints only; actions keep posting the existing form handlers (see app/api/panel_fetch.py).
Every endpoint repeats the permission and shop-scope checks of the page it feeds.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.id_params import DbId
from app.services.staff_audit import parse_before_id
from app.api.catalog_discounts import authorized_scope
from app.db.models import ResellerPlan
from app.services.panel_catalog_extras import discounts_payload, gift_codes_payload, message_variables_payload
from app.services.panel_catalog_plans import plan_edit_data, plans_overview, reseller_plan_edit_data
from app.services.plans_catalog import get_owned_plan

NO_STORE = {"Cache-Control": "no-store"}
PLAN_NOT_FOUND = "پلن یافت نشد"
BAD_PAGE = "صفحه نامعتبر است"
NO_GIFT_CODE_ACCESS = "دسترسی مدیریت کد هدیه ندارید"


def _json(payload: dict[str, Any]) -> JSONResponse:
    return JSONResponse(payload, headers=NO_STORE)


def register_panel_catalog_api(
    app: FastAPI,
    *,
    require_staff: Callable[..., Any],
    require_admin: Callable[..., Any],
    require_perm: Callable[[str], Callable[..., Any]],
    require_pg_perm: Callable[[str], Callable[..., Any]],
    get_db: Callable[..., Any],
) -> None:
    """Register this domain's ``/api/panel/...`` endpoints."""
    require_plans = require_perm("plans")
    require_shop_settings = require_perm("shop_settings")

    @app.get("/api/panel/plans")
    async def panel_plans(staff: dict = Depends(require_plans), session: AsyncSession = Depends(get_db)) -> JSONResponse:
        return _json(await plans_overview(session, staff))

    @app.get("/api/panel/plans/reseller/{plan_id}")
    async def panel_reseller_plan(
        plan_id: DbId, staff: dict = Depends(require_admin), session: AsyncSession = Depends(get_db)
    ) -> JSONResponse:
        plan = await session.get(ResellerPlan, plan_id)
        if not plan:
            raise HTTPException(404, PLAN_NOT_FOUND)
        return _json(await reseller_plan_edit_data(session, staff, plan))

    @app.get("/api/panel/plans/{plan_id}")
    async def panel_plan(
        plan_id: DbId, staff: dict = Depends(require_plans), session: AsyncSession = Depends(get_db)
    ) -> JSONResponse:
        plan = await get_owned_plan(session, plan_id, staff)
        if not plan:
            raise HTTPException(404, PLAN_NOT_FOUND)
        return _json(await plan_edit_data(session, staff, plan))

    @app.get("/api/panel/catalog-discounts")
    async def panel_catalog_discounts(
        request: Request, staff: dict = Depends(require_staff), session: AsyncSession = Depends(get_db)
    ) -> JSONResponse:
        authorized_scope(staff)
        raw = request.query_params.get("before")
        before = parse_before_id(raw)
        if raw and before is None:
            raise HTTPException(400, BAD_PAGE)
        try:
            return _json(await discounts_payload(session, staff, before=before))
        except ValueError:
            raise HTTPException(400, BAD_PAGE) from None

    @app.get("/api/panel/gift-codes")
    async def panel_gift_codes(staff: dict = Depends(require_staff), session: AsyncSession = Depends(get_db)) -> JSONResponse:
        try:
            return _json(await gift_codes_payload(session, staff))
        except PermissionError:
            raise HTTPException(403, NO_GIFT_CODE_ACCESS) from None

    @app.get("/api/panel/message-variables")
    async def panel_message_variables(staff: dict = Depends(require_shop_settings)) -> JSONResponse:
        return _json(message_variables_payload(staff))
