"""JSON data endpoints of the React web panel: the panel-system settings tabs (general, backup, PWA, SSL, update).

Read endpoints only; actions keep posting the existing form handlers (see app/api/panel_fetch.py).
Every endpoint is Owner-only like the settings page it feeds, and never returns a secret.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import panel_system

logger = logging.getLogger(__name__)

NO_STORE = {"Cache-Control": "private, no-store"}
LOAD_FAILED = "بارگذاری این بخش انجام نشد؛ دوباره تلاش کنید."


def _json(payload: dict[str, Any]) -> JSONResponse:
    return JSONResponse(payload, headers=NO_STORE)


async def _answer(name: str, load: Awaitable[dict[str, Any]]) -> JSONResponse:
    """One tab's payload; a failure is logged here and the Owner sees a safe message."""
    try:
        return _json(await load)
    except Exception:
        logger.exception("panel system tab %s failed to load", name)
        raise HTTPException(status_code=500, detail=LOAD_FAILED) from None


def register_panel_system_api(
    app: FastAPI,
    *,
    require_staff: Callable[..., Any],
    require_admin: Callable[..., Any],
    require_perm: Callable[[str], Callable[..., Any]],
    require_pg_perm: Callable[[str], Callable[..., Any]],
    get_db: Callable[..., Any],
) -> None:
    """Register this domain's ``/api/panel/...`` endpoints."""

    @app.get("/api/panel/system/general")
    async def system_general(staff: dict = Depends(require_admin)) -> JSONResponse:
        return await _answer("general", asyncio.to_thread(panel_system.general_payload))

    @app.get("/api/panel/system/pwa")
    async def system_pwa(
        staff: dict = Depends(require_admin),
        session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        return await _answer("pwa", panel_system.pwa_payload(session))

    @app.get("/api/panel/system/backup")
    async def system_backup(
        staff: dict = Depends(require_admin),
        session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        return await _answer("backup", panel_system.backup_payload(session))

    @app.get("/api/panel/system/ssl")
    async def system_ssl(staff: dict = Depends(require_admin)) -> JSONResponse:
        return await _answer("ssl", asyncio.to_thread(panel_system.ssl_payload))

    @app.get("/api/panel/system/update")
    async def system_update(force: bool = False, staff: dict = Depends(require_admin)) -> JSONResponse:
        return await _answer("update", panel_system.update_payload(force=force))
