"""Data of the first-run setup wizard for the React panel.

The wizard's forms still post ``/setup/admin``, ``/setup/bot``, ``/setup/other`` and ``/setup/finish``.
The saved bot token, PasarGuard password and API key are never sent back: the page only learns
whether each one is saved, so re-running the wizard does not require re-typing them.
"""

from __future__ import annotations

import logging
from typing import Any

from app.services.security_policy import is_placeholder_bot_token
from app.services.setup_wizard import (
    begin_setup,
    current_setup_values,
    setup_finish_login_url,
    setup_pg_access_audit,
    wizard_panel_url_hint,
)
from app.services.ssl_certs import https_is_active

logger = logging.getLogger(__name__)

LAST_STEP = 4
FIELD_KEYS = {
    "username": "username",
    "bot_username": "BOT_USERNAME",
    "admin_ids": "ADMIN_IDS",
    "pg_base_url": "PG_BASE_URL",
    "pg_subscription_path": "PG_SUBSCRIPTION_PATH",
    "pg_username": "PG_USERNAME",
    "web_port": "WEB_PORT",
    "public_base_url": "PUBLIC_BASE_URL",
    "currency": "CURRENCY",
}


def clamp_step(raw: str | None) -> int:
    try:
        step = int(raw or "0")
    except ValueError:
        return 0
    return min(max(step, 0), LAST_STEP)


def _https_ready() -> bool:
    try:
        return bool(https_is_active())
    except Exception:
        logger.debug("setup https check failed", exc_info=True)
        return False


async def _access_audit() -> dict[str, Any] | None:
    """The display-only access report, reduced to the fields the last step shows."""
    try:
        audit = await setup_pg_access_audit()
    except Exception:
        logger.warning("setup access audit failed", exc_info=True)
        return None
    return {
        "ok": bool(audit.get("ok")),
        "error": str(audit.get("error") or ""),
        "account_label": str(audit.get("account_label") or ""),
        "pg_is_owner": bool(audit.get("pg_is_owner")),
        "username": str(audit.get("username") or ""),
        "role_name": str(audit.get("role_name") or ""),
        "features": [str(feature.get("label") or "") for feature in audit.get("features") or []],
        "limits": [{"label": str(row.get("label") or ""), "value": str(row.get("value") or "")} for row in audit.get("limits") or []],
        "can_manage_representatives": bool(audit.get("can_manage_representatives")),
    }


async def setup_payload(step: int) -> dict[str, Any]:
    """Saved non-secret values, which secrets exist, and (on the last step) the PasarGuard access report."""
    begin_setup()
    values = current_setup_values()
    token = (values.get("BOT_TOKEN") or "").strip()
    return {
        "step": step,
        "values": {field: values.get(source) or "" for field, source in FIELD_KEYS.items()},
        "has_bot_token": bool(token) and not is_placeholder_bot_token(token),
        "has_pg_password": bool((values.get("PG_PASSWORD") or "").strip()),
        "has_pg_api_key": bool((values.get("PG_API_KEY") or "").strip()),
        "panel_url": wizard_panel_url_hint(values.get("WEB_PORT", "9000")),
        "finish_login_url": setup_finish_login_url(),
        "https_ready": _https_ready(),
        "bot_username": (values.get("BOT_USERNAME") or "").lstrip("@"),
        "access_audit": await _access_audit() if step >= LAST_STEP else None,
    }
