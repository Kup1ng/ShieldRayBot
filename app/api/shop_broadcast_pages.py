"""Shop staff pages for group messages to that shop's customers only.

The page is the React panel's (``frontend/src/panel/pages/marketing/ShopBroadcastPage.tsx``); it reads
``/api/panel/shop-broadcast`` and posts the form handlers below, which keep the scope checks.
"""

from __future__ import annotations

from collections.abc import Callable
from urllib.parse import quote

from fastapi import Depends, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.spa_pages import spa_response
from app.db.models import BroadcastLog
from app.services.authz import authz_from_staff, can_shop
from app.services.broadcast import clear_broadcast_history, delete_broadcast_log, list_broadcast_history
from app.services.broadcast_queue import ACTIVE_STATUSES, STATUS_LABELS, cancel_broadcast
from app.services.marketing_panel import BROADCAST_HISTORY_LIMIT, BROADCAST_SNIPPET_LENGTH, marketing_tabs
from app.services.shop_broadcast import (
    MAX_SHOP_TEXT_UTF16,
    SHOP_AUDIENCE_LABELS,
    new_shop_request_key,
    queue_shop_broadcast,
)
from app.services.shop_scope import ShopScopeError, resolve_shop_scope_id

SHOP_BROADCAST_PATH = "/shop-broadcast"
SHOP_BROADCAST_API_PATH = "/api/panel/shop-broadcast"


def shop_broadcast_scope(staff: dict) -> int:
    """Same rule as the marketing tab: ``broadcast`` permission plus a concrete shop id."""
    if not can_shop(authz_from_staff(staff), "broadcast"):
        raise HTTPException(403)
    try:
        scope = resolve_shop_scope_id(staff)
    except ShopScopeError as exc:
        raise HTTPException(403) from exc
    if scope is None:
        raise HTTPException(403)
    return int(scope)


def _redirect(*, ok: str = "", err: str = "") -> RedirectResponse:
    params: list[str] = []
    if ok:
        params.append("ok=" + quote(ok, safe=""))
    if err:
        params.append("err=" + quote(err, safe=""))
    suffix = ("?" + "&".join(params)) if params else ""
    return RedirectResponse(SHOP_BROADCAST_PATH + suffix, status_code=303)


def _actor(staff: dict) -> str:
    return str(
        staff.get("username") or staff.get("bot_user_id") or staff.get("org_principal_id") or "shop"
    )[:128]


def history_row(row: BroadcastLog) -> dict[str, object]:
    text = row.text or ""
    return {
        "id": int(row.id),
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "audience_label": SHOP_AUDIENCE_LABELS.get(row.audience, row.audience),
        "text_snippet": text[:BROADCAST_SNIPPET_LENGTH],
        "text_truncated": len(text) > BROADCAST_SNIPPET_LENGTH,
        "total": int(row.total or 0),
        "ok_count": int(row.ok_count or 0),
        "fail_count": int(row.fail_count or 0),
        "review_count": int(row.review_count or 0),
        "status": row.status,
        "status_label": STATUS_LABELS.get(row.status, row.status),
        "created_by": row.created_by or "",
        "is_active": row.status in ACTIVE_STATUSES,
    }


def register_shop_broadcast_pages(
    app,
    *,
    require_staff: Callable,
    get_db: Callable,
) -> None:
    @app.get(SHOP_BROADCAST_PATH)
    async def shop_broadcast_page(staff: dict = Depends(require_staff)) -> Response:
        shop_broadcast_scope(staff)
        return spa_response("shop-broadcast")

    @app.get(SHOP_BROADCAST_API_PATH)
    async def shop_broadcast_data(
        staff: dict = Depends(require_staff),
        session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        scope = shop_broadcast_scope(staff)
        history = await list_broadcast_history(session, limit=BROADCAST_HISTORY_LIMIT, shop_id=scope)
        return JSONResponse(
            {
                "sections": marketing_tabs(staff),
                "history": [history_row(row) for row in history],
                "audiences": [{"value": key, "label": label} for key, label in SHOP_AUDIENCE_LABELS.items()],
                "max_text": MAX_SHOP_TEXT_UTF16,
                # A fresh key per read: a resent form reuses its key, so it cannot queue twice.
                "request_key": new_shop_request_key(),
            },
            headers={"Cache-Control": "no-store"},
        )

    @app.post(SHOP_BROADCAST_PATH)
    async def shop_broadcast_send(
        request: Request,
        staff: dict = Depends(require_staff),
        session: AsyncSession = Depends(get_db),
    ) -> Response:
        scope = shop_broadcast_scope(staff)
        form = await request.form()
        try:
            log = await queue_shop_broadcast(
                session,
                shop_id=scope,
                text=form.get("text"),
                created_by=_actor(staff),
                request_key=form.get("request_key"),
            )
        except ValueError as exc:
            await session.rollback()
            return _redirect(err=str(exc))
        return _redirect(ok=f"در صف ارسال قرار گرفت: {log.total} مخاطب. پیشرفت را در تاریخچه ببینید.")

    @app.post(f"{SHOP_BROADCAST_PATH}/history/clear")
    async def shop_broadcast_history_clear(
        staff: dict = Depends(require_staff),
        session: AsyncSession = Depends(get_db),
    ) -> Response:
        scope = shop_broadcast_scope(staff)
        n = await clear_broadcast_history(session, shop_id=scope)
        return _redirect(ok=f"{n} رکورد تاریخچه حذف شد")

    @app.post(f"{SHOP_BROADCAST_PATH}/history/{{log_id}}/delete")
    async def shop_broadcast_history_delete(
        log_id: int,
        staff: dict = Depends(require_staff),
        session: AsyncSession = Depends(get_db),
    ) -> Response:
        scope = shop_broadcast_scope(staff)
        if not await delete_broadcast_log(session, log_id, shop_id=scope):
            return _redirect(err="رکورد یافت نشد")
        return _redirect(ok="رکورد حذف شد")

    @app.post(f"{SHOP_BROADCAST_PATH}/history/{{log_id}}/cancel")
    async def shop_broadcast_history_cancel(
        log_id: int,
        staff: dict = Depends(require_staff),
        session: AsyncSession = Depends(get_db),
    ) -> Response:
        scope = shop_broadcast_scope(staff)
        if await cancel_broadcast(session, log_id, shop_id=scope):
            return _redirect(ok="ارسال متوقف شد؛ پیام‌های فرستاده‌شده برنمی‌گردند")
        return _redirect(err="این ارسال دیگر فعال نیست")
