"""JSON data endpoints of the React web panel: Marketing: loyalty club, campaigns, funnel, broadcast.

Read endpoints only; actions keep posting the existing form handlers (see app/api/panel_fetch.py).
Every endpoint repeats the permission and shop-scope checks of the page it feeds.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.customer_features import feature_scope
from app.services.db_safe import recover_session
from app.services.funnel_access import funnel_shop_scope
from app.services.loyalty_panel import loyalty_overview, loyalty_settings, loyalty_transactions
from app.services.marketing_panel import (
    DEFAULT_AUDIENCE,
    DEFAULT_DAYS,
    FUNNEL_DAYS,
    broadcast_history,
    campaigns_page,
    funnel_counts,
    marketing_tabs,
)
from app.services.shop_scope import ShopScopeError, resolve_shop_scope_id

API_PREFIX = "/api/panel/marketing"
BAD_AUDIENCE = "گروه یا بازهٔ مخاطبان نامعتبر است"
NO_SHOP = "محدودهٔ فروشگاه مشخص نیست"


def _json(payload: dict[str, Any]) -> JSONResponse:
    return JSONResponse(payload, headers={"Cache-Control": "no-store"})


def _loyalty_scope(staff: dict) -> int | None:
    """The shop whose club the staff member manages; a missing shop is refused, never the platform's."""
    try:
        return resolve_shop_scope_id(staff)
    except ShopScopeError:
        raise HTTPException(403, NO_SHOP) from None


def _funnel_scope(staff: dict) -> int | None:
    try:
        return funnel_shop_scope(staff)
    except PermissionError as exc:
        raise HTTPException(403, str(exc)) from None


def _campaign_filters(request: Request) -> tuple[str, int]:
    audience = request.query_params.get("audience", DEFAULT_AUDIENCE)
    try:
        days = int(request.query_params.get("days", str(DEFAULT_DAYS)))
    except ValueError:
        raise HTTPException(400, BAD_AUDIENCE) from None
    return audience, days


def register_panel_marketing_api(
    app: FastAPI,
    *,
    require_staff: Callable[..., Any],
    require_admin: Callable[..., Any],
    require_perm: Callable[[str], Callable[..., Any]],
    require_pg_perm: Callable[[str], Callable[..., Any]],
    get_db: Callable[..., Any],
) -> None:
    """Register this domain's ``/api/panel/...`` endpoints."""
    require_loyalty = require_perm("loyalty")

    @app.get(f"{API_PREFIX}/loyalty")
    async def loyalty_data(
        staff: dict = Depends(require_loyalty), session: AsyncSession = Depends(get_db)
    ) -> JSONResponse:
        scope = _loyalty_scope(staff)
        payload = await loyalty_overview(session, staff, scope)
        return _json({"sections": marketing_tabs(staff), **payload})

    @app.get(f"{API_PREFIX}/loyalty/transactions")
    async def loyalty_transactions_data(
        staff: dict = Depends(require_loyalty), session: AsyncSession = Depends(get_db)
    ) -> JSONResponse:
        scope = _loyalty_scope(staff)
        return _json({"transactions": await loyalty_transactions(session, scope)})

    @app.get(f"{API_PREFIX}/loyalty/settings")
    async def loyalty_settings_data(
        staff: dict = Depends(require_loyalty), session: AsyncSession = Depends(get_db)
    ) -> JSONResponse:
        scope = _loyalty_scope(staff)
        payload = await loyalty_settings(session, staff, scope)
        # Tiers are platform-wide: shop staff read them, only the Owner edits them.
        return _json({**payload, "is_platform_admin": staff.get("role") == "admin"})

    @app.get(f"{API_PREFIX}/campaigns")
    async def campaigns_data(
        request: Request, staff: dict = Depends(require_staff), session: AsyncSession = Depends(get_db)
    ) -> JSONResponse:
        scope = feature_scope(staff, "campaigns")
        audience, days = _campaign_filters(request)
        try:
            payload = await campaigns_page(session, scope=scope, audience=audience, days=days)
        except ValueError:
            raise HTTPException(400, BAD_AUDIENCE) from None
        return _json({"sections": marketing_tabs(staff), **payload})

    @app.get(f"{API_PREFIX}/funnel")
    async def funnel_data(
        staff: dict = Depends(require_staff), session: AsyncSession = Depends(get_db)
    ) -> JSONResponse:
        scope = _funnel_scope(staff)
        await recover_session(session)
        return _json(
            {
                "sections": marketing_tabs(staff),
                "days": FUNNEL_DAYS,
                "counts": await funnel_counts(session, scope=scope),
            }
        )

    @app.get(f"{API_PREFIX}/broadcast")
    async def broadcast_data(
        staff: dict = Depends(require_admin), session: AsyncSession = Depends(get_db)
    ) -> JSONResponse:
        return _json({"sections": marketing_tabs(staff), "history": await broadcast_history(session)})
