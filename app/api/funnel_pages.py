"""Customer-behaviour (funnel) page of the marketing section."""

from __future__ import annotations

from collections.abc import Callable

from fastapi import Depends, FastAPI
from fastapi.responses import RedirectResponse, Response

from app.api.spa_pages import spa_response
from app.services.funnel_access import funnel_shop_scope

FUNNEL_PATH = "/funnel"


def register_funnel_pages(
    app: FastAPI, *, render: Callable, require_staff: Callable, get_db: Callable,
) -> None:
    @app.get(FUNNEL_PATH)
    async def funnel_page(staff: dict = Depends(require_staff)) -> Response:
        try:
            funnel_shop_scope(staff)
        except PermissionError:
            return RedirectResponse("/home", status_code=303)
        return spa_response("funnel")
