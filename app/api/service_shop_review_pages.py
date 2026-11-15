"""Owner page: services whose selling shop is unknown, and the choice that releases each one."""

from __future__ import annotations

from collections.abc import Callable
from urllib.parse import quote

from fastapi import Depends, FastAPI, Form
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.spa_pages import spa_response
from app.services.service_shop_review import assign_service_shop

PAGE_URL = "/service-shop-review"
PLATFORM_CHOICE = "platform"
ASSIGNED_NOTICE = "فروشگاه سرویس تعیین شد"
INVALID_SHOP_NOTICE = "فروشگاه نامعتبر است"


def _redirect(*, ok: str | None = None, err: str | None = None) -> RedirectResponse:
    key, text = ("ok", ok) if ok else ("err", err or "")
    return RedirectResponse(f"{PAGE_URL}?{key}={quote(text)}", status_code=303)


def _parse_choice(raw: str) -> int | None:
    """``platform`` means no shop; anything else must be a positive shop id."""
    if raw == PLATFORM_CHOICE:
        return None
    if not raw.isdigit() or int(raw) <= 0:
        raise ValueError(INVALID_SHOP_NOTICE)
    return int(raw)


def register_service_shop_review_pages(
    app: FastAPI, *, render: Callable, require_admin: Callable, get_db: Callable
) -> None:
    @app.get(PAGE_URL, response_class=HTMLResponse)
    async def service_shop_review_page(staff: dict = Depends(require_admin)):
        return spa_response("service-shop-review")

    @app.post(PAGE_URL + "/{service_id}/assign")
    async def service_shop_review_assign(
        service_id: int,
        staff: dict = Depends(require_admin),
        session: AsyncSession = Depends(get_db),
        shop: str = Form(""),
    ) -> RedirectResponse:
        try:
            await assign_service_shop(session, service_id, _parse_choice(shop.strip()))
        except ValueError as exc:
            return _redirect(err=str(exc))
        return _redirect(ok=ASSIGNED_NOTICE)
