"""JSON data endpoints of the React web panel: PasarGuard users, templates, groups and hosts.

Read endpoints only; actions keep posting the existing form handlers (see app/api/panel_fetch.py).
Every endpoint repeats the permission and shop-scope checks of the page it feeds.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi import Depends, FastAPI
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import pg_resources_panel, pg_users_panel

NO_STORE = {"Cache-Control": "private, no-store"}


def _json(payload: dict[str, Any]) -> JSONResponse:
    return JSONResponse(payload, headers=NO_STORE)


def register_panel_pg_users_api(
    app: FastAPI,
    *,
    require_staff: Callable[..., Any],
    require_admin: Callable[..., Any],
    require_perm: Callable[[str], Callable[..., Any]],
    require_pg_perm: Callable[[str], Callable[..., Any]],
    get_db: Callable[..., Any],
) -> None:
    """Register this domain's ``/api/panel/...`` endpoints."""

    @app.get("/api/panel/pg/users")
    async def pg_users_data(
        q: str | None = None,
        page: str | None = None,
        staff: dict = Depends(require_pg_perm("pg_users")),
        session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        return _json(await pg_users_panel.users_page(session, staff, q=q, page=page))

    @app.get("/api/panel/pg/templates")
    async def pg_templates_data(
        staff: dict = Depends(require_pg_perm("pg_templates")),
        session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        return _json(await pg_resources_panel.templates_page(session, staff))

    @app.get("/api/panel/pg/groups")
    async def pg_groups_data(
        edit: str | None = None,
        staff: dict = Depends(require_pg_perm("pg_groups")),
        session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        return _json(await pg_resources_panel.groups_page(session, staff, edit=edit))

    @app.get("/api/panel/pg/hosts")
    async def pg_hosts_data(
        staff: dict = Depends(require_pg_perm("pg_hosts")),
        session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        return _json(await pg_resources_panel.hosts_page(session, staff))
