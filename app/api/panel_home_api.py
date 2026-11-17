"""JSON data endpoints of the React web panel: Dashboard (/home, /dashboard), inbox, security and the staff report.

Read endpoints only; actions keep posting the existing form handlers (see app/api/panel_fetch.py).
Every endpoint repeats the permission and shop-scope checks of the page it feeds.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.bot_overview_pages import local_host, shop_figures
from app.api.home_pages import degraded_home_context, home_dashboard_context, home_shell_context, kpi_links
from app.services import bot_overview as overview
from app.services.db_safe import rollback_quiet
from app.services.host_gauges import empty_host_gauges, gauges_json
from app.services.identity_chrome import resolve_staff_home
from app.services.panel_home_payload import (
    connection_notice,
    home_shell_payload,
    home_widgets_payload,
    inbox_payload,
    overview_payload,
    staff_actions_payload,
)
from app.services.platform_identity import identity_help_fa
from app.services.staff_audit import (
    PAGE_SIZE,
    list_staff_actions,
    parse_before_id,
    staff_action_views,
    staff_audit_scope,
)

logger = logging.getLogger(__name__)

NO_STORE = {"Cache-Control": "private, no-store"}
SECURITY_ROLES_WITH_PANEL_TABS = frozenset({"admin"})


def _json(payload: dict[str, Any]) -> JSONResponse:
    return JSONResponse(payload, headers=NO_STORE)


async def _server_gauges() -> dict[str, Any]:
    try:
        return gauges_json(await local_host())
    except Exception:
        logger.warning("bot host gauges unavailable", exc_info=True)
        return gauges_json(empty_host_gauges())


async def _overview_response(staff: dict, session: AsyncSession, period: str) -> dict[str, Any]:
    viewer = overview.viewer_of(staff)
    common = {
        "viewer": viewer,
        "period": period,
        "period_labels": overview.PERIOD_LABELS,
        "compare_label": overview.COMPARE_LABELS[period],
    }
    if viewer.has_shop and await overview.shop_needs_bot(session, viewer):
        return overview_payload(**common, bot_setup_needed=True, figures=None, host=None)
    figures = await shop_figures(session, viewer, period) if viewer.has_shop else None
    host = await _server_gauges() if viewer.has_shop and viewer.shop_id is None else None
    return overview_payload(**common, bot_setup_needed=False, figures=figures, host=host)


def register_panel_home_api(
    app: FastAPI,
    *,
    require_staff: Callable[..., Any],
    require_admin: Callable[..., Any],
    require_perm: Callable[[str], Callable[..., Any]],
    require_pg_perm: Callable[[str], Callable[..., Any]],
    get_db: Callable[..., Any],
) -> None:
    """Register this domain's ``/api/panel/...`` endpoints."""
    del require_admin, require_pg_perm

    @app.get("/api/panel/home")
    async def panel_home(staff: dict = Depends(require_staff), session: AsyncSession = Depends(get_db)):
        """Frame of the dashboard from local data only; the slow widgets follow from /home/widgets."""
        dest_kind, dest_target = resolve_staff_home(staff)
        if dest_kind == "redirect":
            return _json({"redirect": dest_target})
        try:
            result = await home_shell_context(staff, session)
        except Exception:
            logger.exception("home shell failed; serving the degraded shell")
            await rollback_quiet(session)
            result = degraded_home_context(staff)
        if isinstance(result, str):
            return _json({"redirect": result})
        template, ctx = result
        return _json(home_shell_payload(staff, template, ctx, kpi_links(staff)))

    @app.get("/api/panel/home/widgets")
    async def panel_home_widgets(
        request: Request, staff: dict = Depends(require_staff), session: AsyncSession = Depends(get_db)
    ):
        """Every dashboard widget of the signed-in staff, scoped to their shop (or the platform for the Owner)."""
        dest_kind, dest_target = resolve_staff_home(staff)
        if dest_kind == "redirect":
            return _json({"redirect": dest_target})
        try:
            result = await home_dashboard_context(staff, session)
        except Exception:
            logger.exception("home dashboard build failed; serving the degraded shell")
            await rollback_quiet(session)
            result = degraded_home_context(staff)
        if isinstance(result, str):
            return _json({"redirect": result})
        template, ctx = result
        update = _owner_update(request) if template == "home.html" else None
        payload = home_widgets_payload(
            staff, template, ctx, kpi_links(staff), update=update, notice=connection_notice(request.state)
        )
        return _json(payload)

    @app.get("/api/panel/dashboard")
    async def panel_dashboard(
        period: str | None = None,
        staff: dict = Depends(require_perm("dashboard")),
        session: AsyncSession = Depends(get_db),
    ):
        """Bot overview figures of the staff's own shop (the platform shop for the Owner)."""
        return _json(await _overview_response(staff, session, overview.parse_period(period)))

    @app.get("/api/panel/inbox")
    async def panel_inbox(
        request: Request, staff: dict = Depends(require_staff), session: AsyncSession = Depends(get_db)
    ):
        from app.services.panel_inbox import build_inbox_context

        return _json(inbox_payload(await build_inbox_context(session, request, staff)))

    @app.get("/api/panel/security")
    async def panel_security(staff: dict = Depends(require_staff)):
        role = str(staff.get("role") or "")
        return _json(
            {
                "username": str(staff.get("username") or ""),
                "role": role,
                "show_panel_tabs": role in SECURITY_ROLES_WITH_PANEL_TABS,
                "identity_help": identity_help_fa(role),
            }
        )

    @app.get("/api/panel/staff-actions")
    async def panel_staff_actions(
        before: str | None = None, staff: dict = Depends(require_staff), session: AsyncSession = Depends(get_db)
    ):
        try:
            shop_id = staff_audit_scope(staff)
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from None
        rows = await list_staff_actions(session, shop_id=shop_id, before_id=parse_before_id(before))
        next_before = rows[-1].id if len(rows) == PAGE_SIZE else None
        return _json(staff_actions_payload(staff_action_views(rows), next_before))


def _owner_update(request: Request) -> Any:
    """The cached new-version notice (no network call); the caller shows it to the Owner only."""
    update = getattr(request.state, "panel_update", None)
    if update is not None:
        return update
    try:
        from app.services.updates import peek_update_cache

        return peek_update_cache()
    except Exception:
        logger.warning("update cache unavailable", exc_info=True)
        return None
