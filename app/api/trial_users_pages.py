"""Marketing page listing the customers who took the free trial and whether they bought."""

from __future__ import annotations

from collections.abc import Callable

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import RedirectResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.spa_pages import spa_response
from app.services.authz import authz_from_staff, can_shop
from app.services.shop_scope import ShopScopeError, resolve_shop_scope_id
from app.services.table_bulk import parse_bulk_ids, redirect_bulk, sanitize_return_to
from app.services.trial_user_actions import block_trial_users, message_trial_users

TRIAL_USERS_PATH = "/trial-users"
VIEW_PERMISSION = "trial_users"
MANAGE_PERMISSION = "trial_users_manage"
SETTINGS_PERMISSION = "shop_settings"
OWNER_SETTINGS_HREF = "/settings?tab=limits"
SHOP_SETTINGS_HREF = "/shop-settings?tab=limits"


def trial_users_scope(staff: dict, permission: str = VIEW_PERMISSION) -> int | None:
    """The shop whose trial takers this staff member may handle; 403 when none."""
    if not can_shop(authz_from_staff(staff), permission):
        raise HTTPException(403)
    try:
        return resolve_shop_scope_id(staff)
    except ShopScopeError:
        raise HTTPException(403) from None


BULK_ACTIONS = frozenset({"block", "unblock", "message"})
NO_SELECTION = "هیچ کاربری انتخاب نشده"


def trial_settings_href(staff: dict) -> str | None:
    """Where the trial settings (the «اکانت تست» group of «محدودیت») live for this staff member."""
    if staff.get("role") == "admin":
        return OWNER_SETTINGS_HREF
    return SHOP_SETTINGS_HREF if can_shop(authz_from_staff(staff), SETTINGS_PERMISSION) else None


def parse_cursor(raw: str | None) -> int | None:
    text = str(raw or "").strip()
    return int(text) if text.isascii() and text.isdigit() and len(text) <= 12 else None


def register_trial_users_pages(
    app: FastAPI, *, render: Callable | None = None, require_staff: Callable, get_db: Callable,
) -> None:
    # ``render`` is no longer used (the page is the React export); the parameter keeps the
    # registration call unchanged.
    @app.get(TRIAL_USERS_PATH)
    async def trial_users_page(staff: dict = Depends(require_staff)) -> Response:
        # The screen is a React page fed by /api/panel/trial-users; the shell is served only
        # to staff who may open it.
        trial_users_scope(staff)
        return spa_response("trial-users")

    @app.post(f"{TRIAL_USERS_PATH}/bulk-action")
    async def trial_users_action(
        request: Request,
        staff: dict = Depends(require_staff),
        session: AsyncSession = Depends(get_db),
    ) -> Response:
        shop_id = trial_users_scope(staff, MANAGE_PERMISSION)
        form = await request.form()
        action = str(form.get("action") or "").strip()
        return_to = sanitize_return_to(str(form.get("return_to") or TRIAL_USERS_PATH), default=TRIAL_USERS_PATH)
        ids = parse_bulk_ids(form.getlist("ids"))
        if action not in BULK_ACTIONS:
            return redirect_bulk(return_to, err="عملیات نامعتبر")
        if not ids:
            return redirect_bulk(return_to, err=NO_SELECTION)
        try:
            return await _run_action(session, staff, shop_id, action, ids, form, return_to)
        except ValueError as exc:
            await session.rollback()
            return redirect_bulk(return_to, err=str(exc))


async def _run_action(
    session: AsyncSession, staff: dict, shop_id: int | None, action: str, ids: list[int], form, return_to: str,
) -> RedirectResponse:
    if action == "message":
        text = str(form.get("reason") or form.get("confirm_reason") or "")
        campaign = await message_trial_users(session, staff=staff, shop_id=shop_id, user_ids=ids, text=text)
        return redirect_bulk(return_to, ok=f"پیام در صف ارسال قرار گرفت (کمپین #{campaign.id})")
    result = await block_trial_users(session, staff=staff, shop_id=shop_id, user_ids=ids, block=action == "block")
    if not result.changed:
        return redirect_bulk(return_to, err="هیچ موردی انجام نشد")
    done = "کاربر مسدود شد" if action == "block" else "مسدودی برداشته شد"
    suffix = f" · {result.refused} رد شد" if result.refused else ""
    return redirect_bulk(return_to, ok=f"{result.changed} {done}{suffix}")
