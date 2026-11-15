"""JSON data endpoints of the React web panel: Shop settings, tickets, connection status and the setup wizard.

Read endpoints only; actions keep posting the existing form handlers (see app/api/panel_fetch.py).
Every endpoint repeats the permission and shop-scope checks of the page it feeds.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.shop_settings_panel import entry_redirect, normalize_tab, shop_settings_payload
from app.services import connection_status_panel, tickets_panel
from app.services.panel_tickets import can_access_panel_tickets
from app.services.setup_wizard import is_setup_complete
from app.services.setup_wizard_panel import clamp_step, setup_payload

NO_STORE = {"Cache-Control": "private, no-store"}
NO_ACCESS = "دسترسی ندارید"
TICKET_NOT_FOUND = "تیکت یافت نشد"
HOME = "/home"
MAX_ID = 2147483647
MAX_HOST_OFFSET = 100000


def _json(payload: dict[str, Any]) -> JSONResponse:
    return JSONResponse(payload, headers=NO_STORE)


def _redirect(path: str) -> JSONResponse:
    """Staff who do not belong on a page are sent elsewhere, as the server-rendered page did."""
    return _json({"redirect": path})


def _ticket_staff(staff: dict) -> dict:
    if not can_access_panel_tickets(staff):
        raise HTTPException(status_code=403, detail=NO_ACCESS)
    return staff


def _register_ticket_routes(app: FastAPI, *, require_staff: Callable[..., Any], get_db: Callable[..., Any]) -> None:
    @app.get("/api/panel/tickets")
    async def tickets_overview(
        staff: dict = Depends(require_staff),
        session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        if not can_access_panel_tickets(staff):
            return _redirect(HOME)
        return _json(await tickets_panel.overview_payload(session, staff))

    @app.get("/api/panel/tickets/supports")
    async def tickets_supports(
        staff: dict = Depends(require_staff),
        session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        if not tickets_panel.can_manage_supports(_ticket_staff(staff)):
            raise HTTPException(status_code=403, detail=NO_ACCESS)
        return _json(await tickets_panel.supports_payload(session, staff))

    # Declared before the numeric route so "bot" is never read as a ticket id.
    @app.get("/api/panel/tickets/bot/{ticket_id}")
    async def tickets_bot_detail(
        ticket_id: int,
        staff: dict = Depends(require_staff),
        session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        _ticket_staff(staff)
        detail = await tickets_panel.bot_ticket_detail(session, staff, _bounded_id(ticket_id))
        if detail is None:
            raise HTTPException(status_code=404, detail=TICKET_NOT_FOUND)
        return _json(detail)

    @app.get("/api/panel/tickets/{ticket_id}")
    async def tickets_panel_detail(
        ticket_id: int,
        staff: dict = Depends(require_staff),
        session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        _ticket_staff(staff)
        detail = await tickets_panel.panel_ticket_detail(session, staff, _bounded_id(ticket_id))
        if detail is None:
            raise HTTPException(status_code=404, detail=TICKET_NOT_FOUND)
        return _json(detail)


def _register_connection_routes(app: FastAPI, *, require_staff: Callable[..., Any], get_db: Callable[..., Any]) -> None:
    async def monitor_access(staff: dict, session: AsyncSession):
        try:
            return await connection_status_panel.owner_monitor_access(session, staff)
        except ValueError:
            raise HTTPException(status_code=403, detail="دسترسی به تنظیمات اتصال ندارید.") from None

    @app.get("/api/panel/connection-status")
    async def connection_status_data(
        after: int = Query(0, ge=0, le=MAX_ID),
        staff: dict = Depends(require_staff),
        session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        access = await monitor_access(staff, session)
        return _json(await connection_status_panel.status_payload(session, access, after_id=after))

    @app.get("/api/panel/connection-status/hosts")
    async def connection_status_hosts(
        offset: int = Query(0, ge=0, le=MAX_HOST_OFFSET),
        staff: dict = Depends(require_staff),
        session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        access = await monitor_access(staff, session)
        return _json(await connection_status_panel.hosts_payload(session, access, offset=offset))


def register_panel_ops_api(
    app: FastAPI,
    *,
    require_staff: Callable[..., Any],
    require_admin: Callable[..., Any],
    require_perm: Callable[[str], Callable[..., Any]],
    require_pg_perm: Callable[[str], Callable[..., Any]],
    get_db: Callable[..., Any],
) -> None:
    """Register this domain's ``/api/panel/...`` endpoints."""
    require_shop_settings = require_perm("shop_settings")

    @app.get("/api/panel/shop-settings")
    async def shop_settings_data(
        request: Request,
        tab: str | None = None,
        staff: dict = Depends(require_shop_settings),
        session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        name = normalize_tab(tab)
        moved = entry_redirect(staff, name, request.query_params)
        if moved:
            return _redirect(moved)
        return _json(await shop_settings_payload(session, staff, name))

    _register_ticket_routes(app, require_staff=require_staff, get_db=get_db)
    _register_connection_routes(app, require_staff=require_staff, get_db=get_db)

    # The first-run wizard has no staff session: the setup gate middleware guards every /setup/ path.
    @app.get("/setup/data")
    async def setup_wizard_data(step: str | None = None) -> JSONResponse:
        if is_setup_complete():
            return _redirect("/")
        return _json(await setup_payload(clamp_step(step)))


def _bounded_id(value: int) -> int:
    if not 1 <= value <= MAX_ID:
        raise HTTPException(status_code=404, detail=TICKET_NOT_FOUND)
    return value
