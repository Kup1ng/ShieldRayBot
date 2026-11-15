"""Data of the PasarGuard templates, groups and hosts pages in the React panel.

Each page reads through the staff member's own PasarGuard client (never the Owner token for a
reseller) and shows only the objects that client may see; a panel that is down or slow yields
empty rows and an ``error`` notice instead of failing the page.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from app.services.formatting import data_limit_to_gb, format_bytes
from app.services.numbers import normalize_number_text, parse_int
from app.services.pasarguard import as_list
from app.services.pg_access import staff_pg_action
from app.services.pg_read import PgReadDenied, staff_pg_read_client
from app.services.plans_catalog import filter_groups_for_staff, filter_templates_for_staff, groups_allowed_for_staff
from app.services.pg_panel_errors import safe_pg_error

logger = logging.getLogger(__name__)

PG_READ_TIMEOUT_SEC = 12.0
PG_TIMEOUT_ERROR = "پاسخ پاسارگارد دیر رسید؛ چند لحظهٔ دیگر دوباره تلاش کنید."
PG_READ_ERROR = "دریافت اطلاعات از پاسارگارد ممکن نشد؛ چند لحظهٔ دیگر دوباره تلاش کنید."
GROUP_OUT_OF_SCOPE = "گروه خارج از دسترسی شماست"
SECONDS_PER_DAY = 86400

Loader = Callable[[Any], Awaitable[dict[str, Any]]]


def _int_or_none(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _id_list(raw: Any) -> list[int]:
    items = raw if isinstance(raw, list) else []
    return [n for n in (_int_or_none(item) for item in items) if n is not None]


def inbound_tag_names(raw: Any) -> list[str]:
    """Inbound tags as plain strings, whatever shape the panel answered in."""
    tags: list[str] = []
    for item in raw or []:
        if isinstance(item, str):
            tags.append(item)
        elif isinstance(item, dict):
            tags.append(str(item.get("tag") or item.get("name") or item.get("id") or ""))
    return [tag for tag in tags if tag]


def _text_list(raw: Any) -> list[str]:
    if isinstance(raw, str):
        return [raw] if raw else []
    if isinstance(raw, (list, tuple)):
        return [str(item) for item in raw if item not in (None, "")]
    return []


def _list_or_wrapped(raw: Any, key: str) -> list[dict]:
    if isinstance(raw, list):
        return [item for item in raw if isinstance(item, dict)]
    if isinstance(raw, dict):
        return as_list(raw, key)
    return []


def serialize_template(template: dict) -> dict[str, Any]:
    duration = template.get("expire_duration")
    days = round(duration / SECONDS_PER_DAY) if isinstance(duration, (int, float)) and duration else None
    return {
        "id": _int_or_none(template.get("id")),
        "name": str(template.get("name") or ""),
        "data_limit": _int_or_none(template.get("data_limit")) or None,
        "limit_text": format_bytes(template["data_limit"]) if template.get("data_limit") else "نامحدود",
        "data_gb": data_limit_to_gb(template.get("data_limit")),
        "expire_days": days,
        "group_ids": _id_list(template.get("group_ids")),
    }


def serialize_group(group: dict) -> dict[str, Any]:
    return {
        "id": _int_or_none(group.get("id")),
        "name": str(group.get("name") or ""),
        "inbound_tags": _text_list(group.get("inbound_tags")),
        "total_users": _int_or_none(group.get("total_users")),
        "is_disabled": bool(group.get("is_disabled")),
    }


def serialize_host(host: dict) -> dict[str, Any]:
    return {
        "id": _int_or_none(host.get("id")),
        "remark": str(host.get("remark") or host.get("name") or ""),
        "address": _text_list(host.get("address")),
        "port": _int_or_none(host.get("port")),
        "inbound_tag": str(host.get("inbound_tag") or ""),
        "priority": _int_or_none(host.get("priority")) or 0,
        "is_disabled": bool(host.get("is_disabled")),
    }


def _can(staff: dict, resource: str) -> dict[str, bool]:
    return {
        "create": staff_pg_action(staff, resource, "create"),
        "update": staff_pg_action(staff, resource, "update"),
        "delete": staff_pg_action(staff, resource, "delete"),
    }


async def _read(session: Any, staff: dict, loader: Loader) -> dict[str, Any]:
    """Run one page loader under the read timeout; a failure leaves the loader's defaults and an error text."""
    result: dict[str, Any] = {"error": None}
    try:
        client = await staff_pg_read_client(session, staff)
        result.update(await asyncio.wait_for(loader(client), PG_READ_TIMEOUT_SEC))
    except PgReadDenied as exc:
        result["error"] = exc.message
    except TimeoutError:
        result["error"] = PG_TIMEOUT_ERROR
    except Exception as exc:
        # The page must still render: the cause is logged, the staff member sees a safe text.
        logger.warning("pg resource list failed", exc_info=True)
        result["error"] = safe_pg_error(exc, fallback=PG_READ_ERROR)
    return result


async def templates_page(session: Any, staff: dict) -> dict[str, Any]:
    async def load(pg: Any) -> dict[str, Any]:
        templates_raw, groups_raw = await asyncio.gather(pg.get_user_templates(), pg.get_groups_simple(), return_exceptions=True)
        if isinstance(templates_raw, BaseException):
            raise templates_raw
        groups = [] if isinstance(groups_raw, BaseException) else filter_groups_for_staff(_list_or_wrapped(groups_raw, "groups"), staff)
        templates = filter_templates_for_staff(_list_or_wrapped(templates_raw, "templates"), staff)
        return {
            "rows": [serialize_template(t) for t in templates],
            "groups": [{"id": g["id"], "name": g["name"]} for g in map(serialize_group, groups) if g["id"] is not None],
        }

    loaded = await _read(session, staff, load)
    return {"rows": [], "groups": [], **loaded, "can": _can(staff, "templates")}


async def groups_page(session: Any, staff: dict, *, edit: str | None) -> dict[str, Any]:
    async def load(pg: Any) -> dict[str, Any]:
        full, inbounds = await asyncio.gather(pg.get_groups(), pg.get_inbounds(), return_exceptions=True)
        if isinstance(full, BaseException):
            raise full
        groups = _list_or_wrapped(full, "groups") or await pg.get_groups_simple()
        groups = filter_groups_for_staff([g for g in groups if isinstance(g, dict)], staff)
        out: dict[str, Any] = {"rows": [serialize_group(g) for g in groups], "inbound_tags": []}
        if isinstance(inbounds, BaseException):
            logger.warning("pg inbounds read failed", exc_info=inbounds)
            out["error"] = PG_READ_ERROR
        else:
            out["inbound_tags"] = inbound_tag_names(inbounds)
        edit_digits = normalize_number_text(str(edit or ""))
        if edit_digits.isdigit():
            edit_id = parse_int(edit_digits)
            if groups_allowed_for_staff(staff, [edit_id]):
                found = await pg.get_group(edit_id)
                out["edit_group"] = serialize_group(found) if isinstance(found, dict) else None
            else:
                out["error"] = GROUP_OUT_OF_SCOPE
        return out

    loaded = await _read(session, staff, load)
    return {"rows": [], "inbound_tags": [], "edit_group": None, **loaded, "can": _can(staff, "groups")}


async def hosts_page(session: Any, staff: dict) -> dict[str, Any]:
    async def load(pg: Any) -> dict[str, Any]:
        hosts_raw, inbounds_raw = await asyncio.gather(pg.get_hosts(), pg.get_inbounds(), return_exceptions=True)
        if isinstance(hosts_raw, BaseException):
            raise hosts_raw
        out: dict[str, Any] = {"rows": [serialize_host(h) for h in hosts_raw if isinstance(h, dict)], "inbound_tags": []}
        if isinstance(inbounds_raw, BaseException):
            logger.warning("pg inbounds read failed", exc_info=inbounds_raw)
            out["error"] = PG_READ_ERROR
        else:
            out["inbound_tags"] = inbound_tag_names(inbounds_raw)
        return out

    loaded = await _read(session, staff, load)
    return {"rows": [], "inbound_tags": [], **loaded, "can": _can(staff, "hosts")}
