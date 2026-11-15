"""``GET /api/panel/session``: who is signed in, and the chrome the React panel draws for them.

Read-only. The navigation is presentation (see ``app/services/panel_nav.py``); every page's data
endpoint and every action keeps its own permission check.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse

from app.services.csrf import CSRF_COOKIE, ensure_csrf_token
from app.services.identity_chrome import hierarchy_identity
from app.services.marketing_nav import marketing_sections
from app.services.panel_brand import DEFAULT_BRAND
from app.services.panel_nav import panel_nav
from app.services.platform_identity import is_explicit_owner_staff

logger = logging.getLogger(__name__)

CSRF_COOKIE_MAX_AGE = 60 * 60 * 12


def _brand_payload(request: Request) -> dict[str, Any]:
    brand = getattr(request.state, "panel_brand", None) or DEFAULT_BRAND
    # The accent is always ShieldRay purple; a saved preset colour is not applied any more.
    return {
        "name": str(getattr(brand, "name", "") or DEFAULT_BRAND.name),
        "logo_url": str(getattr(brand, "logo_url", "") or DEFAULT_BRAND.logo_url),
        "has_custom_logo": bool(getattr(brand, "has_custom_logo", False)),
    }


def _version_payload(staff: dict, *, is_owner: bool) -> dict[str, Any] | None:
    """The software version and update badge are shown to the Owner only."""
    if not is_owner:
        return None
    try:
        from app.services.update_channel import badge_context
        from app.services.updates import local_version, peek_update_cache

        badge = badge_context()
        update = peek_update_cache()
        return {
            "version": local_version(),
            "channel": badge.get("deployed_channel", "main"),
            "channel_label": badge.get("deployed_channel_label", ""),
            "update_available": bool(update and update.get("update_available")),
        }
    except Exception:
        logger.warning("panel session: version badge unavailable", exc_info=True)
        return None


def session_payload(request: Request, staff: dict) -> dict[str, Any]:
    identity = hierarchy_identity(staff) or {}
    is_owner = bool(is_explicit_owner_staff(staff))
    try:
        marketing = marketing_sections(staff)
    except Exception:
        logger.warning("panel session: marketing nav resolution failed", exc_info=True)
        marketing = ()
    return {
        "staff": {
            "username": str(staff.get("display") or staff.get("username") or ""),
            "role": str(staff.get("role") or ""),
            "kind": identity.get("kind"),
            "label": identity.get("label"),
            "pg_role_name": identity.get("pg_role_name") if identity.get("show_pg_role") else None,
            "chips": list(identity.get("chips") or []),
        },
        "is_owner": is_owner,
        "nav": panel_nav(staff, identity=identity, is_owner=is_owner, marketing=marketing),
        "alerts": {
            "tickets": int(getattr(request.state, "panel_tickets_unread", 0) or 0),
            "inbox": bool(getattr(request.state, "panel_inbox_alert", False)),
            "cancellations": bool(getattr(request.state, "panel_cancel_alert", False)),
        },
        "brand": _brand_payload(request),
        "version": _version_payload(staff, is_owner=is_owner),
        "csrf_token": ensure_csrf_token(request),
    }


def register_panel_session(app: FastAPI, *, require_staff: Callable[..., Any], cookie_secure: Callable[[Request], bool]) -> None:
    @app.get("/api/panel/session")
    async def panel_session(request: Request, staff: dict = Depends(require_staff)) -> JSONResponse:
        payload = session_payload(request, staff)
        response = JSONResponse(payload, headers={"Cache-Control": "no-store"})
        if getattr(request.state, "csrf_token_set", False) or CSRF_COOKIE not in request.cookies:
            # Same double-submit cookie the server-rendered pages set (readable by the page).
            response.set_cookie(
                CSRF_COOKIE,
                payload["csrf_token"],
                httponly=False,
                samesite="lax",
                secure=cookie_secure(request),
                max_age=CSRF_COOKIE_MAX_AGE,
                path="/",
            )
        return response
