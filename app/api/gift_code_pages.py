"""Staff page for gift and discount codes; the React page reads /api/panel/gift-codes and posts the existing routes."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from urllib.parse import urlencode

from fastapi import Depends, FastAPI
from fastapi.responses import RedirectResponse, Response

from app.api.spa_pages import spa_response
from app.services.gift_codes import gift_code_scope

GIFT_CODES_PATH = "/gift-codes"


def legacy_gift_modal_redirect(query: Mapping[str, str]) -> str | None:
    """Target for the old ``/plans?gifts=1`` modal link, keeping only the flash params."""
    if query.get("gifts") not in {"1", "true", "yes"}:
        return None
    flash = {key: query[key] for key in ("ok", "err") if query.get(key)}
    return GIFT_CODES_PATH + ("?" + urlencode(flash) if flash else "")


def register_gift_code_pages(
    app: FastAPI, *, render: Callable, require_staff: Callable, get_db: Callable,
) -> None:
    @app.get(GIFT_CODES_PATH)
    async def gift_codes_page(staff: dict = Depends(require_staff)) -> Response:
        try:
            gift_code_scope(staff)
        except PermissionError:
            return RedirectResponse("/home", status_code=303)
        return spa_response("gift-codes")
