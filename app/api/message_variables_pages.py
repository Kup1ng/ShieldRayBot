"""Message variables catalog page (پنل ربات — قبل از تنظیمات); the data comes from /api/panel/message-variables."""

from __future__ import annotations

from fastapi import Depends
from fastapi.responses import HTMLResponse

from app.api.spa_pages import spa_response


def register_message_variables_pages(
    app,
    *,
    render,
    require_perm,
    require_admin,
    get_db,
):
    """Read-only catalog — no secrets, no writes, shop_settings gated."""

    require_shop = require_perm("shop_settings")

    @app.get("/message-variables", response_class=HTMLResponse)
    async def message_variables_page(staff: dict = Depends(require_shop)):
        _ = staff
        return spa_response("message-variables")
