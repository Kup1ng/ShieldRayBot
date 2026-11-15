"""JSON data endpoints of the React web panel: Resellers and shops: list, edit, applications, subscription, shop review, principals.

Read endpoints only; actions keep posting the existing form handlers (see app/api/panel_fetch.py).
Every endpoint repeats the permission and shop-scope checks of the page it feeds.

The principal actions (``/principals/...``) have no screen of their own: the old ``/principals``
page only redirected to ``/resellers`` and those handlers keep answering the forms they always did.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any
from urllib.parse import quote

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.id_params import DbId
from app.api.reseller_pages import MINIAPP_STATUS_TEXT
from app.services.platform_identity import is_explicit_owner_staff
from app.services.representative_unification import (
    RepresentativeUnifyError,
    assert_live_parent_for_child,
    assert_staff_can_manage_representatives,
)
from app.services.reseller_panel_edit import edit_payload
from app.services.reseller_panel_list import (
    SHOP_FORBIDDEN,
    SHOP_OK,
    ListQuery,
    applications_payload,
    color_tag_payload,
    create_options_payload,
    list_payload,
    load_scoped_shop,
    panel_settings_payload,
)
from app.services.reseller_panel_subscription import subscription_payload
from app.services.service_shop_review import review_payload

NO_ACCESS = "دسترسی ندارید"
MISSING_SHOP = "نماینده یافت نشد"
NO_STORE = {"Cache-Control": "private, no-store"}
LIST_PATH = "/resellers"


def _json(payload: dict[str, Any]) -> JSONResponse:
    return JSONResponse(payload, headers=NO_STORE)


def _refuse() -> HTTPException:
    return HTTPException(status_code=403, detail=NO_ACCESS)


def _back_to_list_with_error(message: str) -> JSONResponse:
    """The data endpoints' form of the old redirect: the page follows it to the list."""
    return _json({"redirect": f"{LIST_PATH}?err={quote(message, safe='')}"})


def _require_rep_mgmt(staff: dict) -> None:
    """Hybrid Owner or a representative without the live panel ``admins.create`` right is refused."""
    try:
        assert_staff_can_manage_representatives(staff)
    except RepresentativeUnifyError:
        raise _refuse() from None


async def _require_live_parent(session: AsyncSession, staff: dict) -> None:
    """The gate of the reseller list: a representative whose own account is off sees nothing."""
    try:
        await assert_live_parent_for_child(session, staff)
    except RepresentativeUnifyError:
        raise _refuse() from None


def register_panel_resellers_api(
    app: FastAPI,
    *,
    require_staff: Callable[..., Any],
    require_admin: Callable[..., Any],
    require_perm: Callable[[str], Callable[..., Any]],
    require_pg_perm: Callable[[str], Callable[..., Any]],
    get_db: Callable[..., Any],
) -> None:
    """Register this domain's ``/api/panel/...`` endpoints."""

    @app.get("/api/panel/resellers")
    async def resellers_list(
        color: str | None = None,
        q: str | None = None,
        page: str | None = None,
        staff: dict = Depends(require_staff),
        session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        await _require_live_parent(session, staff)
        return _json(await list_payload(session, staff, ListQuery.parse(color, q, page)))

    @app.get("/api/panel/resellers/create-options")
    async def reseller_create_options(
        staff: dict = Depends(require_staff),
        session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        await _require_live_parent(session, staff)
        return _json(await create_options_payload(session, staff))

    @app.get("/api/panel/resellers/settings")
    async def reseller_panel_settings(
        staff: dict = Depends(require_admin),
        session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        return _json(await panel_settings_payload(session))

    @app.get("/api/panel/resellers/applications")
    async def reseller_applications(
        staff: dict = Depends(require_admin),
        session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        _require_rep_mgmt(staff)
        return _json(await applications_payload(session))

    @app.get("/api/panel/resellers/{user_id}/edit")
    async def reseller_edit(
        user_id: DbId,
        staff: dict = Depends(require_admin),
        session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        payload = await edit_payload(
            session,
            staff,
            user_id,
            owner_can_toggle_oversell=is_explicit_owner_staff(staff),
            miniapp_status_text=MINIAPP_STATUS_TEXT,
        )
        return _back_to_list_with_error(MISSING_SHOP) if payload is None else _json(payload)

    @app.get("/api/panel/resellers/{user_id}/color-tag")
    async def reseller_color_tag(
        user_id: DbId,
        staff: dict = Depends(require_staff),
        session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        await _require_live_parent(session, staff)
        user, _profile, status = await load_scoped_shop(session, staff, user_id)
        if status == SHOP_FORBIDDEN:
            raise _refuse()
        if status != SHOP_OK or user is None:
            return _back_to_list_with_error(MISSING_SHOP)
        return _json(await color_tag_payload(user))

    @app.get("/api/panel/my-subscription")
    async def my_subscription(
        staff: dict = Depends(require_staff),
        session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        try:
            return _json(await subscription_payload(session, staff))
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from None

    @app.get("/api/panel/service-shop-review")
    async def service_shop_review(
        staff: dict = Depends(require_admin),
        session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        return _json(await review_payload(session))
