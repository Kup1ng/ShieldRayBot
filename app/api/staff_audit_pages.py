"""The staff action log page (rows come from /api/panel/staff-actions): one shop's records, newest first."""

from __future__ import annotations

from collections.abc import Callable

from fastapi import Depends, FastAPI
from fastapi.responses import RedirectResponse, Response

from app.api.spa_pages import spa_response
from app.services.staff_audit import staff_audit_scope

STAFF_AUDIT_PATH = "/staff-actions"


def register_staff_audit_pages(
    app: FastAPI, *, render: Callable, require_staff: Callable, get_db: Callable,
) -> None:
    # ``render`` and ``get_db`` stay in the signature shared by every page registration; the React page
    # reads its rows from /api/panel/staff-actions.
    del render, get_db

    @app.get(STAFF_AUDIT_PATH)
    async def staff_actions_page(staff: dict = Depends(require_staff)) -> Response:
        try:
            staff_audit_scope(staff)
        except PermissionError:
            return RedirectResponse("/home", status_code=303)
        return spa_response("staff-actions")
