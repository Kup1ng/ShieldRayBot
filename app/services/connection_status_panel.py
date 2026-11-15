"""Data of the connection status page (``/connection-status``) for the React panel.

Owner-only: the page configures the private monitoring of the one PasarGuard panel. The reads here are
the same bounded views the server-rendered page used; nothing secret is returned (no token, no config
body), only names, protocol details and health.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.services.authz import authz_from_staff
from app.services.connection_monitor_access import MonitorAccess, require_monitor_owner
from app.services.connection_monitor_admin import monitor_config_choices
from app.services.connection_monitor_errors import monitor_error_message
from app.services.connection_monitor_views import MonitorTargetView, monitor_admin_page
from app.services.connection_status_texts import PLAIN_STATUS_LABELS, REASON_LABELS, connection_check_time
from app.services.db_safe import rollback_quiet
from app.services.pasarguard import PasarGuardError

logger = logging.getLogger(__name__)

EXPECTED_ERRORS = (ValueError, PasarGuardError, httpx.HTTPError, SQLAlchemyError)
STATUS_COLORS = {"healthy": "success", "degraded": "warning", "down": "danger"}
UNKNOWN_REASON = "نتیجهٔ قابل استفاده هنوز ثبت نشده است."
ISSUE_FALLBACK = "این کانفیگ فعلاً قابل تست نیست."


async def owner_monitor_access(session: AsyncSession, staff: dict) -> MonitorAccess:
    """The staff member's monitoring rights; ValueError unless they are the explicit Owner."""
    access = MonitorAccess(authz_from_staff(staff), True)
    await require_monitor_owner(session, access)
    await session.commit()
    return access


def _target_payload(target: MonitorTargetView) -> dict[str, Any]:
    health = target.health
    status = str(health.status.value)
    return {
        "id": int(target.id),
        "public_name": target.public_name or "",
        "config_name": target.config_name or "",
        "display_order": int(target.display_order),
        "test_enabled": bool(target.test_enabled),
        "is_public": bool(target.is_public),
        "manual_pending": bool(target.manual_pending),
        # Only a stopped config can be switched back on; the key is not a secret (a hash of the config).
        "config_key": None if target.test_enabled else target.config_key,
        "status": status,
        "status_label": PLAIN_STATUS_LABELS[health.status],
        "status_color": STATUS_COLORS.get(status, "default"),
        "delay_ms": health.delay_ms,
        "checked_text": connection_check_time(health.checked_at),
        "covered": int(health.covered),
        "expected": int(health.expected),
        "reason_text": REASON_LABELS.get(target.reason, UNKNOWN_REASON) if target.reason else "",
    }


async def status_payload(session: AsyncSession, access: MonitorAccess, *, after_id: int) -> dict[str, Any]:
    page = await monitor_admin_page(session, access, now=datetime.now(timezone.utc), after_id=after_id)
    deployment = get_settings()
    return {
        "settings": {"has_account": bool(page.settings.has_account), "username": page.settings.username or "", "enabled": bool(page.settings.enabled)},
        "binary_configured": bool(deployment.connection_monitor_xray_path and deployment.connection_monitor_xray_sha256),
        "targets": [_target_payload(target) for target in page.targets],
        "next_id": page.next_id,
    }


async def hosts_payload(session: AsyncSession, access: MonitorAccess, *, offset: int) -> dict[str, Any]:
    """The subscription's configs (one PasarGuard read); a failure is a safe message, not a broken page."""
    try:
        page = await monitor_config_choices(session, access, offset=offset)
    except EXPECTED_ERRORS as exc:
        await rollback_quiet(session)
        logger.warning("Connection host list failed type=%s reason=%s", type(exc).__name__, getattr(exc, "code", "catalog_failed"))
        return {"choices": [], "total_count": 0, "next_offset": None, "error": monitor_error_message(exc)}
    return {
        "choices": [
            {
                "config_key": host.config_key,
                "name": host.name,
                "position": int(host.position),
                "protocol": host.details.protocol,
                "transport": host.details.transport,
                "security": host.details.security or "",
                "port": host.details.port,
                "issue": REASON_LABELS.get(host.issue, ISSUE_FALLBACK) if host.issue else "",
            }
            for host in page.choices
        ],
        "total_count": int(page.total_count),
        "next_offset": page.next_offset,
        "error": "",
    }
