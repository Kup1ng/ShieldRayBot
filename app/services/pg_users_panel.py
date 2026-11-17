"""Data of the PasarGuard users page in the React panel: one bounded page of the staff member's own users.

Subscription links and tokens never travel in this list; the page asks for one link on demand
(``GET /pg/users/{id}/link``) exactly where the old page offered it.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, TypedDict

import httpx

from app.services.formatting import STATUS_FA_PLAIN, data_limit_to_gb, format_bytes, format_bytes_ratio, pg_expire_fields
from app.services.list_query import (
    DEFAULT_LIST_PAGE_SIZE,
    build_list_pager,
    extract_list_total,
    filter_by_search,
    list_offset,
    normalize_search_q,
    parse_list_page,
)
from app.services.db_safe import rollback_quiet
from app.services.pasarguard import PasarGuardError, as_list, user_group_ids
from app.services.pg_access import staff_user_actions
from app.services.pg_read import PgReadDenied, staff_pg_read_client
from app.services.payg_gate import shop_rate_summary
from app.services.pg_user_scope import filter_pg_users_for_staff
from app.services.plans_catalog import filter_groups_for_staff, filter_templates_for_staff
from app.services.pg_panel_errors import safe_pg_error
from app.services.provision_gate import reseller_id_from_staff

logger = logging.getLogger(__name__)

# PasarGuard is slow when it is busy; the page answers with what it has instead of hanging.
PG_READ_TIMEOUT_SEC = 12.0
PG_LIST_ERROR = "دریافت فهرست کاربران از پاسارگارد ممکن نشد؛ چند لحظهٔ دیگر دوباره تلاش کنید."
PG_TIMEOUT_ERROR = "پاسخ پاسارگارد دیر رسید؛ چند لحظهٔ دیگر دوباره تلاش کنید."
SEARCH_MAX_LENGTH = 100
LAST_PAGE = 100_000

# Operations a row accepts in the bulk bar, keyed by the staff action that allows them.
BULK_OP_ACTIONS: tuple[tuple[str, str], ...] = (
    ("disable", "disable"),
    ("enable", "enable"),
    ("reset", "reset_usage"),
    ("revoke", "revoke_sub"),
    ("delete", "delete"),
)


class UserRow(TypedDict):
    id: int | None
    username: str
    status: str
    status_label: str
    disabled: bool
    on_hold: bool
    used_traffic: int | None
    data_limit: int | None
    traffic_text: str
    traffic_percent: int | None
    data_gb: float | None
    days_left: int | None
    expire_text: str
    owner: str
    hwid_limit: int | None
    group_ids: list[int]
    ops: list[str]


def is_pg_owner_principal(staff: dict) -> bool:
    return bool(staff.get("pg_is_owner"))


def _is_admin(staff: dict) -> bool:
    return staff.get("role") == "admin"


def _pg_owner_name(staff: dict) -> str:
    return str(staff.get("pg_admin_username") or "").strip()


def _int_or_none(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _is_disabled(user: dict) -> bool:
    return bool(user.get("status") == "disabled" or user.get("is_disabled") or user.get("disabled"))


def _owner_name(user: dict) -> str:
    admin = user.get("admin")
    if isinstance(admin, dict):
        return str(admin.get("username") or "")
    return str(admin or user.get("owner_username") or "")


def _search_parts(user: dict) -> tuple[Any, ...]:
    return (
        user.get("username"),
        user.get("note"),
        user.get("id"),
        user.get("status"),
        _owner_name(user),
        user.get("owner_username"),
    )


def _allowed_ops(actions: dict[str, bool], *, has_id: bool, disabled: bool) -> list[str]:
    if not has_id:
        return []
    ops = []
    for op, action in BULK_OP_ACTIONS:
        if not actions.get(action):
            continue
        if op == "disable" and disabled:
            continue
        if op == "enable" and not disabled:
            continue
        ops.append(op)
    return ops


def _traffic_text(used: int | None, limit: int | None) -> str:
    if limit:
        return format_bytes_ratio(used or 0, limit)
    return format_bytes(used) if used is not None else "—"


def _traffic_percent(used: int | None, limit: int | None) -> int | None:
    if not limit:
        return None
    return max(0, min(100, round((used or 0) * 100 / limit)))


def serialize_user(user: dict, *, actions: dict[str, bool], show_owner: bool) -> UserRow:
    """The fields the users table shows; no link, token or note."""
    uid = _int_or_none(user.get("id"))
    disabled = _is_disabled(user)
    status = str(user.get("status") or "")
    expire = pg_expire_fields(user)
    used = _int_or_none(user.get("used_traffic"))
    limit = _int_or_none(user.get("data_limit")) or None
    return {
        "id": uid,
        "username": str(user.get("username") or ""),
        "status": status,
        "status_label": STATUS_FA_PLAIN.get(status, status) if status else "فعال",
        "disabled": disabled,
        "on_hold": status == "on_hold",
        "used_traffic": used,
        "data_limit": limit,
        "traffic_text": _traffic_text(used, limit),
        "traffic_percent": _traffic_percent(used, limit),
        "data_gb": data_limit_to_gb(user.get("data_limit")),
        "days_left": expire["days_left"],
        "expire_text": str(expire["expire_text"] or ""),
        "owner": _owner_name(user) if show_owner else "",
        "hwid_limit": _int_or_none(user.get("hwid_limit")),
        "group_ids": user_group_ids(user),
        "ops": _allowed_ops(actions, has_id=uid is not None, disabled=disabled),
    }


def _option_rows(items: list[dict]) -> list[dict[str, Any]]:
    rows = []
    for item in items:
        item_id = _int_or_none(item.get("id"))
        if item_id is not None:
            rows.append({"id": item_id, "name": str(item.get("name") or "")})
    return rows


def _templates_from(raw: Any) -> list[dict]:
    if isinstance(raw, list):
        return [t for t in raw if isinstance(t, dict)]
    if isinstance(raw, dict):
        return as_list(raw, "templates") or []
    return []


def _groups_from(raw: Any) -> list[dict]:
    if isinstance(raw, list):
        return [g for g in raw if isinstance(g, dict)]
    if isinstance(raw, dict):
        return as_list(raw, "groups") or []
    return []


def capabilities(staff: dict, *, has_groups: bool, has_templates: bool) -> dict[str, bool]:
    """What this staff member may do on the page; the buttons shown are exactly these."""
    actions = staff_user_actions(staff)
    access = staff.get("pg_access") or {}
    require_template = bool(access.get("require_template")) and not is_pg_owner_principal(staff)
    can_custom = bool(actions["create"]) and not require_template and has_groups
    can_template = bool(actions["create"]) and has_templates
    return {
        "create": bool(actions["create"]),
        "custom_create": can_custom,
        "template_create": can_template,
        "require_template": require_template,
        "modify": bool(actions["update"]),
        "delete": bool(actions["delete"]),
        "reset": bool(actions["reset_usage"]),
        "revoke": bool(actions["revoke_sub"]),
        "disable": bool(actions["disable"]),
        "enable": bool(actions["enable"]),
        "bulk": any(actions[action] for _op, action in BULK_OP_ACTIONS),
    }


async def _fetch_users(pg: Any, staff: dict, params: dict[str, Any], search_q: str) -> tuple[list[dict], int | None, int]:
    """One page of users scoped to the staff member: (rows, remote total, raw page length)."""
    data = await pg.get_users(**params)
    users: list[dict] = []
    total: int | None = None
    if isinstance(data, dict):
        users = as_list(data, "users") or []
        total = extract_list_total(data)
    elif isinstance(data, list):
        users = data
    fetched = len(users)
    users = filter_pg_users_for_staff(users, staff)
    if not search_q:
        return users, total, fetched
    matched = filter_by_search(users, search_q, _search_parts)
    if matched:
        return matched, total, fetched
    # The panel may match exact, case-sensitive names only: widen the page, then filter here.
    try:
        wide = await pg.get_users(**{k: v for k, v in params.items() if k != "username"})
    except (PasarGuardError, httpx.HTTPError, TimeoutError):
        logger.warning("pg users widened search failed", exc_info=True)
        return [], total, 0
    wide_users: list[dict] = []
    wide_total: int | None = None
    if isinstance(wide, dict):
        wide_users = as_list(wide, "users") or []
        wide_total = extract_list_total(wide)
    elif isinstance(wide, list):
        wide_users = wide
    fetched = len(wide_users)
    scoped = filter_pg_users_for_staff(wide_users, staff)
    return filter_by_search(scoped, search_q, _search_parts), wide_total, fetched


async def _load_users_page(session: Any, staff: dict, *, q: str, page: int) -> dict[str, Any]:
    search_q = normalize_search_q(q)
    pg = await staff_pg_read_client(session, staff)
    params: dict[str, Any] = {"offset": list_offset(page, DEFAULT_LIST_PAGE_SIZE), "limit": DEFAULT_LIST_PAGE_SIZE}
    if search_q:
        params["username"] = search_q
    owner = _pg_owner_name(staff)
    if not _is_admin(staff) and owner:
        params["admin"] = owner
    users_result, templates_raw, groups_raw = await asyncio.gather(
        _fetch_users(pg, staff, params, search_q),
        pg.get_user_templates(),
        pg.get_groups_simple(),
        return_exceptions=True,
    )
    if isinstance(users_result, BaseException):
        raise users_result
    users, total, fetched = users_result
    templates = [] if isinstance(templates_raw, BaseException) else filter_templates_for_staff(_templates_from(templates_raw), staff)
    groups = [] if isinstance(groups_raw, BaseException) else filter_groups_for_staff(_groups_from(groups_raw), staff)
    return {
        "users": users,
        "templates": templates,
        "groups": groups,
        "pager": build_list_pager(page=page, page_size=DEFAULT_LIST_PAGE_SIZE, fetched=fetched, total=total, scoped_len=len(users)),
    }


async def _payg_rates(session: Any, staff: dict) -> dict[str, Any] | None:
    """The shop's own PAYG prices, shown before staff create, edit or reset a user; ``None`` when nothing is charged."""
    try:
        summary = await shop_rate_summary(session, reseller_id_from_staff(staff))
    except Exception:
        # Display only: the list must still render when the prices cannot be read.
        logger.warning("pg users payg rates failed", exc_info=True)
        await rollback_quiet(session)
        return None
    if summary is None:
        return None
    return {"lines": list(summary.lines), "reset_note": summary.reset_note}


async def users_page(session: Any, staff: dict, *, q: str | None, page: str | None) -> dict[str, Any]:
    """The users list payload; a panel that is down or slow yields empty rows and an ``error`` notice."""
    search_q = normalize_search_q(q)[:SEARCH_MAX_LENGTH]
    page_number = min(parse_list_page(page), LAST_PAGE)
    error: str | None = None
    loaded: dict[str, Any] = {
        "users": [],
        "templates": [],
        "groups": [],
        "pager": build_list_pager(page=page_number, page_size=DEFAULT_LIST_PAGE_SIZE, fetched=0, total=None),
    }
    try:
        loaded = await asyncio.wait_for(_load_users_page(session, staff, q=search_q, page=page_number), PG_READ_TIMEOUT_SEC)
    except PgReadDenied as exc:
        error = exc.message
    except TimeoutError:
        error = PG_TIMEOUT_ERROR
    except Exception as exc:
        # The page must still render: the cause is logged, the staff member sees a safe text.
        logger.warning("pg users list failed", exc_info=True)
        error = safe_pg_error(exc, fallback=PG_LIST_ERROR)
    actions = staff_user_actions(staff)
    show_owner = _is_admin(staff)
    templates = _option_rows(loaded["templates"])
    groups = _option_rows(loaded["groups"])
    return {
        "rows": [serialize_user(u, actions=actions, show_owner=show_owner) for u in loaded["users"] if isinstance(u, dict)],
        "q": search_q,
        "pager": loaded["pager"],
        "show_owner": show_owner,
        "templates": templates,
        "groups": groups,
        "can": capabilities(staff, has_groups=bool(groups), has_templates=bool(templates)),
        "payg_rates": await _payg_rates(session, staff),
        "error": error,
    }
