"""JSON data endpoints of the React web panel: Finance: orders, payments, receipts, settlements, cancellations, stuck orders, purge.

Read endpoints only; actions keep posting the existing form handlers (see app/api/panel_fetch.py).
Every endpoint repeats the permission and shop-scope checks of the page it feeds.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import finance_panel
from app.services.finance_panel import FinanceAccess, FinanceScopeError
from app.services.finance_settings_panel import settings_payload

NO_ACCESS = "دسترسی ندارید"
NO_STORE = {"Cache-Control": "private, no-store"}


def _json(payload: dict[str, Any]) -> JSONResponse:
    return JSONResponse(payload, headers=NO_STORE)


def _refuse(message: str = NO_ACCESS) -> HTTPException:
    return HTTPException(status_code=403, detail=message)


async def _answer(load: Awaitable[dict[str, Any]]) -> JSONResponse:
    """The JSON of one loaded payload; a staff member without a shop is refused, never shown platform data."""
    try:
        return _json(await load)
    except (FinanceScopeError, PermissionError) as exc:
        raise _refuse(str(exc)) from None


def _access(staff: dict, *, orders: bool = False, payments: bool = False, any_list: bool = False, settings: bool = False) -> FinanceAccess:
    """The staff member's finance rights; 403 unless they hold the one this endpoint needs."""
    access = finance_panel.finance_access(staff)
    allowed = (
        (orders and access.can_orders)
        or (payments and access.can_payments)
        or (any_list and access.any_list)
        or (settings and access.can_settings)
    )
    if not allowed:
        raise _refuse()
    return access


def register_panel_finance_api(
    app: FastAPI,
    *,
    require_staff: Callable[..., Any],
    require_admin: Callable[..., Any],
    require_perm: Callable[[str], Callable[..., Any]],
    require_pg_perm: Callable[[str], Callable[..., Any]],
    get_db: Callable[..., Any],
) -> None:
    """Register this domain's ``/api/panel/...`` endpoints."""

    @app.get("/api/panel/finance")
    async def finance_overview(staff: dict = Depends(require_staff)) -> JSONResponse:
        access = _access(staff, any_list=True)
        return _json(
            {
                "tabs": access.tabs,
                "can_orders": access.can_orders,
                "can_payments": access.can_payments,
                "can_settings": access.can_settings,
                "can_void_payment": access.can_void_payment,
            }
        )

    @app.get("/api/panel/finance/reports")
    async def finance_reports(
        period: str | None = None,
        staff: dict = Depends(require_staff),
        session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        _access(staff, any_list=True)
        return await _answer(finance_panel.reports_payload(session, staff, period=period))

    @app.get("/api/panel/finance/orders")
    async def finance_orders(
        q: str | None = None,
        page: str | None = None,
        staff: dict = Depends(require_staff),
        session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        _access(staff, orders=True)
        return await _answer(finance_panel.orders_page(session, staff, q=q, page=page))

    @app.get("/api/panel/finance/payments")
    async def finance_payments(
        q: str | None = None,
        page: str | None = None,
        staff: dict = Depends(require_staff),
        session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        access = _access(staff, payments=True)
        return await _answer(finance_panel.payments_page(session, staff, access, q=q, page=page))

    @app.get("/api/panel/finance/delivery")
    async def finance_delivery(
        staff: dict = Depends(require_staff),
        session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        _access(staff, orders=True)
        return await _answer(finance_panel.delivery_queue(session, staff))

    @app.get("/api/panel/finance/cancellations")
    async def finance_cancellations(
        before: str | None = None,
        staff: dict = Depends(require_staff),
        session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        access = _access(staff, orders=True)
        return await _answer(finance_panel.cancellations_page(session, staff, access, before=before))

    @app.get("/api/panel/finance/automation")
    async def finance_automation(
        after: str | None = None,
        staff: dict = Depends(require_staff),
        session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        _access(staff, orders=True)
        return await _answer(finance_panel.automation_page(session, staff, after=after))

    @app.get("/api/panel/finance/settings")
    async def finance_settings(
        staff: dict = Depends(require_staff),
        session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        access = _access(staff, settings=True)
        return await _answer(settings_payload(session, staff, access))
