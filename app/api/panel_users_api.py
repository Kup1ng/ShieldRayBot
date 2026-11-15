"""JSON data endpoints of the React web panel: Customers: list, card, edit, trial users.

Read endpoints only; actions keep posting the existing form handlers (see app/api/panel_fetch.py).
Every endpoint repeats the permission and shop-scope checks of the page it feeds.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.id_params import DbId
from app.api.trial_users_pages import MANAGE_PERMISSION, parse_cursor, trial_settings_href, trial_users_scope
from app.db.models import BotUser
from app.services.authz import authz_from_staff, can_shop
from app.services.db_safe import recover_session
from app.services.marketing_nav import marketing_sections
from app.services.panel_users_payload import trial_users_payload, user_card_payload, user_edit_payload, users_list_payload
from app.services.pg_access import staff_user_actions
from app.services.platform_identity import is_explicit_owner_staff
from app.services.shop_membership import assert_customer_in_staff_scope
from app.services.shop_scope import ShopScopeError, resolve_shop_scope_id
from app.services.trial_users import list_trial_users, normalize_filter, trial_summary
from app.services.user_card import build_user_card
from app.services.user_edit_view import load_user_edit_view
from app.services.users_list_view import load_users_list

NO_STORE = {"Cache-Control": "no-store"}
USER_NOT_FOUND = "کاربر یافت نشد"
PAGE_PERMISSION = "dashboard"


def _json(payload: dict[str, Any]) -> JSONResponse:
    return JSONResponse(payload, headers=NO_STORE)


async def _scoped_user(session: AsyncSession, staff: dict, user_id: int) -> BotUser:
    """The customer, when the staff member's shop may work with them; 404 / 403 otherwise."""
    user = await session.get(BotUser, int(user_id))
    if user is None:
        raise HTTPException(404, USER_NOT_FOUND)
    try:
        await assert_customer_in_staff_scope(session, staff, user)
    except ShopScopeError as exc:
        raise HTTPException(403, exc.message) from None
    return user


def _shop_scope(staff: dict) -> int | None:
    try:
        return resolve_shop_scope_id(staff)
    except ShopScopeError as exc:
        raise HTTPException(403, exc.message) from None


def register_panel_users_api(
    app: FastAPI,
    *,
    require_staff: Callable[..., Any],
    require_admin: Callable[..., Any],
    require_perm: Callable[[str], Callable[..., Any]],
    require_pg_perm: Callable[[str], Callable[..., Any]],
    get_db: Callable[..., Any],
) -> None:
    """Register this domain's ``/api/panel/...`` endpoints."""
    require_ops = require_perm(PAGE_PERMISSION)

    @app.get("/api/panel/users")
    async def panel_users_list(
        request: Request,
        staff: dict = Depends(require_ops),
        session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        params = request.query_params
        try:
            view = await load_users_list(
                session,
                staff,
                search=params.get("q"),
                filter_raw=params.get("filter"),
                uid_raw=params.get("uid"),
                color_raw=params.get("color"),
            )
        except ShopScopeError as exc:
            raise HTTPException(403, exc.message) from None
        return _json(users_list_payload(view))

    @app.get("/api/panel/users/{user_id}/card")
    async def panel_user_card(
        user_id: DbId,
        staff: dict = Depends(require_ops),
        session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        user = await _scoped_user(session, staff, user_id)
        shop_id = _shop_scope(staff)
        card = await build_user_card(session, user, shop_id=shop_id, show_private_marks=True)
        in_shop = is_explicit_owner_staff(staff) or shop_id is not None
        pg_acts = staff_user_actions(staff)
        return _json(
            user_card_payload(
                card,
                can_edit=in_shop and any(pg_acts.get(k) for k in ("create", "update", "delete")),
                can_message=not user.is_blocked,
            )
        )

    @app.get("/api/panel/users/{user_id}/edit")
    async def panel_user_edit(
        user_id: DbId,
        staff: dict = Depends(require_ops),
        session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        user = await _scoped_user(session, staff, user_id)
        return _json(user_edit_payload(await load_user_edit_view(session, staff, user)))

    @app.get("/api/panel/trial-users")
    async def panel_trial_users(
        request: Request,
        staff: dict = Depends(require_staff),
        session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        shop_id = trial_users_scope(staff)
        await recover_session(session)
        params = request.query_params
        trial_filter = normalize_filter(params.get("filter"))
        search = (params.get("q") or "").strip()
        page = await list_trial_users(
            session,
            staff=staff,
            shop_id=shop_id,
            trial_filter=trial_filter,
            search=search,
            before=parse_cursor(params.get("before")),
        )
        can_message = can_shop(authz_from_staff(staff), MANAGE_PERMISSION)
        return _json(
            trial_users_payload(
                page,
                await trial_summary(session, shop_id=shop_id),
                trial_filter=trial_filter,
                search=search,
                can_message=can_message,
                can_block=can_message and is_explicit_owner_staff(staff),
                settings_href=trial_settings_href(staff),
                marketing_tabs=marketing_sections(staff),
            )
        )
