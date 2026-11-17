"""JSON data endpoints of the React web panel: PasarGuard overview, nodes, inbounds and admins.

Read endpoints only; actions keep posting the existing form handlers (see app/api/panel_fetch.py).
Every endpoint repeats the permission and shop-scope checks of the page it feeds.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.panel_tickets_pages import panel_ticket_dashboard_alert
from app.services import pg_admins_panel, pg_nodes_panel, pg_overview_panel
from app.services.panel_home_payload import connection_notice
from app.services.pg_read import effective_pg_menu_keys
from app.services.pg_staff_access import access_by_web_username, staff_remediation_flags, staff_username_aligned
from app.services.ux20 import resolve_pg_open_url

NO_STORE = {"Cache-Control": "private, no-store"}
SHOP_ROLES = frozenset({"reseller", "pg_staff", "principal"})


def _json(payload: dict[str, Any]) -> JSONResponse:
    return JSONResponse(payload, headers=NO_STORE)


def _with_notice(request: Request, payload: dict[str, Any]) -> JSONResponse:
    """Adds the «PasarGuard is slow or down» notice, computed after the payload's own reads."""
    return _json({**payload, "notice": connection_notice(request.state)})


async def _ticket_alert(request: Request, staff: dict, session: AsyncSession) -> dict[str, Any] | None:
    if staff.get("role") not in SHOP_ROLES:
        return None
    alert = await panel_ticket_dashboard_alert(session, staff, unread=getattr(request.state, "panel_tickets_unread", None))
    if not alert:
        return None
    return {"title": str(alert["title"]), "detail": str(alert["detail"]), "href": str(alert["href"])}


async def _remediation(session: AsyncSession, staff: dict) -> dict[str, bool] | None:
    """What a secondary admin still has to finish before the data menus work; booleans only."""
    if staff.get("role") != "pg_staff":
        return None
    login = (staff.get("username") or "").strip()
    row = await access_by_web_username(session, login) if login else None
    if row is None:
        return None
    flags = staff_remediation_flags(row)
    if not flags["needs_remediation"]:
        return None
    return {
        "username_aligned": bool(flags.get("username_aligned")),
        "credentials_ready": bool(flags.get("credentials_ready")),
        "can_self_serve": bool(staff_username_aligned(row)),
    }


def register_panel_pg_infra_api(
    app: FastAPI,
    *,
    require_staff: Callable[..., Any],
    require_admin: Callable[..., Any],
    require_perm: Callable[[str], Callable[..., Any]],
    require_pg_perm: Callable[[str], Callable[..., Any]],
    get_db: Callable[..., Any],
) -> None:
    """Register this domain's ``/api/panel/...`` endpoints."""
    del require_staff, require_admin, require_perm

    @app.get("/api/panel/pg")
    async def pg_overview_shell(
        request: Request,
        staff: dict = Depends(require_pg_perm("pg_overview")),
        session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        """The overview frame from local data only; the slow figures follow from /api/panel/pg/widgets."""
        owner = pg_overview_panel.is_pg_owner(staff)
        external_url = await resolve_pg_open_url(session, is_admin=owner)
        return _json(
            {
                "owner": owner,
                "external_url": external_url or None,
                "ticket_alert": await _ticket_alert(request, staff, session),
                "remediation": await _remediation(session, staff),
                "admins_hint": pg_overview_panel.admins_hint(staff),
            }
        )

    @app.get("/api/panel/pg/widgets")
    async def pg_overview_widgets(
        request: Request,
        staff: dict = Depends(require_pg_perm("pg_overview")),
        session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        """The figures of the overview, scoped to the staff member's own PasarGuard account."""
        widgets = await pg_overview_panel.display_widgets(staff, session)
        payload = pg_overview_panel.overview_payload(staff, widgets, effective_pg_menu_keys(staff))
        return _with_notice(request, payload)

    @app.get("/api/panel/pg/nodes")
    async def pg_nodes_data(
        request: Request,
        staff: dict = Depends(require_pg_perm("pg_nodes")),
        session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        return _with_notice(request, await pg_nodes_panel.nodes_payload(session, staff))

    @app.get("/api/panel/pg/inbounds")
    async def pg_inbounds_data(
        request: Request,
        staff: dict = Depends(require_pg_perm("pg_inbounds")),
        session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        return _with_notice(request, await pg_nodes_panel.inbounds_payload(session, staff))

    @app.get("/api/panel/pg/admins")
    async def pg_admins_data(
        request: Request,
        staff: dict = Depends(require_pg_perm("pg_admins")),
        session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        return _with_notice(request, await pg_admins_panel.admins_payload(session, staff))
