"""PasarGuard admins list for the React panel (owner only): usage, web access and the plans to grant.

The list merges the panel's admins with how each one reaches the web panel (reseller, secondary
admin, owner or not at all). Rows are whitelisted: no passwords, API keys or password hashes.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Iterable
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ResellerPlan
from app.services.db_safe import rollback_quiet
from app.services.formatting import pg_user_status_fa
from app.services.pasarguard import get_pg
from app.services.pg_overview import admin_usage_snapshot
from app.services.pg_panel_errors import safe_pg_error
from app.services.pg_staff_access import purge_orphaned_staff_access, web_access_status_map
from app.services.platform_identity import is_explicit_owner_staff
from app.services.resellers import FEATURE_PERMS, ensure_current_capacity_reseller_plan, list_reseller_plans

logger = logging.getLogger(__name__)

ADMINS_ERROR = "دریافت ادمین‌ها از پاسارگارد ممکن نشد؛ چند لحظهٔ دیگر دوباره تلاش کنید."
MAX_ADMINS = 500
DETAIL_CONCURRENCY = 5
# The simple admin list often omits usage; any of these fields means the row already has it.
USAGE_KEYS = (
    "used_traffic",
    "traffic_used",
    "lifetime_used_traffic",
    "total_users",
    "users_count",
    "data_limit",
    "max_users",
)
WEB_FIELDS = (
    "source",
    "web_username",
    "is_active",
    "setup_complete",
    "reseller_user_id",
    "staff_id",
    "note",
    "detail",
    "credentials_ready",
    "password_ready",
    "api_key_ready",
    "username_aligned",
)
ADDON_KINDS = frozenset({"addon_volume", "addon_users"})
GRANT_KINDS = frozenset({"subscription", "current_capacity"})
CURRENT_CAPACITY = "current_capacity"
SUBSCRIPTION = "subscription"


def feature_perm_options() -> list[dict[str, str]]:
    """The permissions a new reseller can be given, as the create form lists them."""
    return [{"key": key, "label": label} for key, label in FEATURE_PERMS]


def plan_row(plan: ResellerPlan) -> dict[str, Any]:
    return {
        "id": int(plan.id),
        "name": str(plan.name or ""),
        "plan_kind": plan.plan_kind or SUBSCRIPTION,
        "billing_mode": plan.billing_mode or "fixed",
        "price_per_gb": int(plan.price_per_gb or 0),
        "duration_days": int(plan.duration_days or 0),
    }


def plan_options(plans: Iterable[dict[str, Any]]) -> dict[str, Any]:
    """The plans each admin form offers: new reseller, secondary admin with a time limit, grant/convert."""
    rows = list(plans)
    subscriptions = [p for p in rows if p["plan_kind"] == SUBSCRIPTION]
    grant = [p for p in rows if p["plan_kind"] in GRANT_KINDS] or [p for p in rows if p["plan_kind"] not in ADDON_KINDS]
    default = next((p["id"] for p in grant if p["plan_kind"] == CURRENT_CAPACITY), None)
    return {"create": subscriptions, "staff": subscriptions, "grant": grant, "grant_default_id": default}


def _key(admin: dict[str, Any]) -> str:
    """How the web-access and usage maps are keyed: the lowercased PasarGuard username."""
    return str(admin.get("username") or "").strip().lower()


def _role_id(role: dict[str, Any]) -> int | None:
    try:
        return int(role["id"])
    except (KeyError, TypeError, ValueError):
        return None


def _role_of(payload: dict[str, Any], listed: dict[str, Any], roles_by_id: dict[int, dict]) -> dict | None:
    role = payload.get("role")
    if isinstance(role, dict):
        return role
    role_id = payload.get("role_id") or listed.get("role_id")
    try:
        return roles_by_id.get(int(role_id)) if role_id is not None else None
    except (TypeError, ValueError):
        return None


def _has_usage(admin: dict[str, Any]) -> bool:
    return any(admin.get(key) is not None for key in USAGE_KEYS)


async def _usage_rows(pg: Any, admins: list[dict[str, Any]], roles_by_id: dict[int, dict]) -> dict[str, dict[str, Any]]:
    """Usage of every admin; admins the list gave no usage for are read one by one, a few at a time."""
    gate = asyncio.Semaphore(DETAIL_CONCURRENCY)

    async def one(admin: dict[str, Any]) -> tuple[str, dict[str, Any]]:
        name = _key(admin)
        payload = admin
        if not _has_usage(admin):
            async with gate:
                try:
                    full = await pg.get_admin(name)
                except Exception:
                    # One unreadable admin shows «—» for usage; the rest of the list is unaffected.
                    logger.debug("pg admin detail unavailable", exc_info=True)
                    full = None
            if isinstance(full, dict):
                payload = full
        return name, admin_usage_snapshot(payload, _role_of(payload, admin, roles_by_id))

    named = [a for a in admins if _key(a)]
    return dict(await asyncio.gather(*(one(a) for a in named)))


def _web_row(status: dict[str, Any] | None) -> dict[str, Any]:
    status = status or {}
    row = {field: status.get(field) for field in WEB_FIELDS}
    row["source"] = status.get("source") or "none"
    return row


def admin_row(admin: dict[str, Any], status: dict[str, Any] | None, usage: dict[str, Any] | None) -> dict[str, Any]:
    role = admin.get("role") if isinstance(admin.get("role"), dict) else {}
    usage = usage or {}
    return {
        "id": admin.get("id") if isinstance(admin.get("id"), int) else None,
        "username": str(admin.get("username") or ""),
        "role_name": str(role.get("name") or ""),
        "is_sudo": bool(admin.get("is_sudo")),
        "status": str(admin.get("status") or ""),
        # `status` stays the panel's own word; the Persian label is what the table shows.
        "status_label": pg_user_status_fa(admin.get("status")) if admin.get("status") else "",
        "note": str(admin.get("note") or ""),
        "users_text": usage.get("users_text") or "—",
        "traffic_text": usage.get("traffic_text") or "—",
        "lifetime_text": usage.get("lifetime_text"),
        "web": _web_row(status),
    }


async def _prepare(session: AsyncSession, staff: dict) -> None:
    """Housekeeping the page has always done on load; a failure must not hide the list."""
    try:
        # The «current capacity» plan must exist before the grant forms list plans.
        await ensure_current_capacity_reseller_plan(session)
        await session.commit()
    except Exception:
        logger.exception("ensure current_capacity plan failed on the admins page")
        await rollback_quiet(session)
    try:
        # Drop web rows of admins that no longer exist in PasarGuard; only an owner's list is complete proof.
        await purge_orphaned_staff_access(session, sees_every_admin=bool(staff.get("pg_is_owner")))
    except Exception:
        logger.warning("purging orphaned staff access failed on the admins page", exc_info=True)
        await rollback_quiet(session)


async def admins_payload(session: AsyncSession, staff: dict) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "admins": [],
        "roles": [],
        "plans": plan_options([]),
        "feature_perms": feature_perm_options(),
        "can_toggle_oversell": is_explicit_owner_staff(staff),
        "error": None,
    }
    try:
        await _prepare(session, staff)
        pg = get_pg()
        admins = await pg.get_admins() or await pg.get_admins_simple()
        admins = [a for a in admins if isinstance(a, dict)][:MAX_ADMINS]
        roles = [r for r in await pg.get_admin_roles() or [] if isinstance(r, dict)]
        roles_by_id = {rid: r for r in roles if (rid := _role_id(r)) is not None}
        names = [str(a.get("username") or "").strip() for a in admins if a.get("username")]
        status_by_name = await web_access_status_map(session, names)
        plans = [plan_row(p) for p in await list_reseller_plans(session) if p.is_active]
        usage_by_name = await _usage_rows(pg, admins, roles_by_id)
        payload["admins"] = [
            admin_row(a, status_by_name.get(_key(a)), usage_by_name.get(_key(a))) for a in admins
        ]
        payload["roles"] = [
            {"id": rid, "name": str(r.get("name") or rid)} for rid, r in roles_by_id.items() if not r.get("is_owner")
        ]
        payload["plans"] = plan_options(plans)
    except Exception as exc:
        logger.warning("pg admins read failed", exc_info=True)
        payload["error"] = safe_pg_error(exc, fallback=ADMINS_ERROR)
    return payload
