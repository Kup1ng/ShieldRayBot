"""PasarGuard nodes and inbounds lists for the React panel.

Both lists are read through the tenant-safe client (``staff_pg_read_client``), so a reseller or
panel staff member only ever sees what their own PasarGuard account may read. Rows are whitelisted
field by field: node API keys and certificates never leave this module.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.formatting import node_status_fa
from app.services.node_traffic import enrich_nodes_with_traffic
from app.services.pg_access import staff_pg_action
from app.services.pg_read import PgReadDenied, staff_pg_read_client
from app.services.pg_panel_errors import safe_pg_error
from app.services.redact import redact

logger = logging.getLogger(__name__)

NODES_ERROR = "دریافت نودها از پاسارگارد ممکن نشد؛ چند لحظهٔ دیگر دوباره تلاش کنید."
INBOUNDS_ERROR = "دریافت اینباندها از پاسارگارد ممکن نشد؛ چند لحظهٔ دیگر دوباره تلاش کنید."
MAX_NODES = 500
MAX_INBOUNDS = 500
MAX_DETAIL_ROWS = 300
MAX_DETAIL_TEXT = 2000
SECRET_KEY_PARTS = ("password", "secret", "token", "private", "api_key", "apikey", "passphrase")
HIDDEN_VALUE = "***"


def node_capabilities(staff: dict) -> dict[str, bool]:
    """What this staff member may do to nodes; the same grants the node action handlers check."""
    granted = (staff.get("pg_actions") or {}).get("nodes") or {}
    return {
        name: bool(granted.get(name) or staff_pg_action(staff, "nodes", name))
        for name in ("reconnect", "create", "update", "delete")
    }


def _node_id(node: dict[str, Any]) -> int | None:
    try:
        return int(node["id"])
    except (KeyError, TypeError, ValueError):
        return None


def node_row(node: dict[str, Any]) -> dict[str, Any]:
    """The columns of one node row; never the node's API key or server certificate."""
    status = str(node.get("status") or node.get("connection_status") or "")
    return {
        "id": _node_id(node),
        "name": str(node.get("name") or ""),
        "address": str(node.get("address") or node.get("host") or ""),
        "port": node.get("port") if isinstance(node.get("port"), int) else None,
        "status": status,
        "status_label": node_status_fa(status) if status else "",
        "status_kind": node.get("_status_kind") or "neutral",
        "traffic_up": node.get("_traffic_up"),
        "traffic_down": node.get("_traffic_down"),
        "traffic_total": node.get("_traffic_total"),
        "traffic_up_text": node.get("_traffic_up_text") or "—",
        "traffic_down_text": node.get("_traffic_down_text") or "—",
        "traffic_total_text": node.get("_traffic_total_text") or "—",
    }


async def nodes_payload(session: AsyncSession, staff: dict) -> dict[str, Any]:
    payload: dict[str, Any] = {"nodes": [], "error": None, "can": node_capabilities(staff)}
    try:
        pg = await staff_pg_read_client(session, staff)
        raw = await pg.get_nodes()
        try:
            realtime = await pg.get_nodes_realtime()
        except Exception:
            # Live figures are optional: the list still shows with the stored totals.
            logger.debug("pg node realtime stats unavailable", exc_info=True)
            realtime = None
        nodes = enrich_nodes_with_traffic(raw if isinstance(raw, list) else [], realtime)
        payload["nodes"] = [node_row(node) for node in nodes[:MAX_NODES]]
    except PgReadDenied as exc:
        payload["error"] = exc.message
    except Exception as exc:
        logger.warning("pg nodes read failed", exc_info=True)
        payload["error"] = safe_pg_error(exc, fallback=NODES_ERROR)
    return payload


def _inbound_tag(item: Any) -> str:
    if isinstance(item, str):
        return item
    if isinstance(item, dict):
        return str(item.get("tag") or item.get("name") or "")
    return str(item)


def _hide_secrets(value: Any, key: str = "") -> Any:
    """The value with every secret-looking entry replaced, however deep it sits."""
    if any(part in key.lower() for part in SECRET_KEY_PARTS):
        return HIDDEN_VALUE
    if isinstance(value, dict):
        return {str(k): _hide_secrets(v, str(k)) for k, v in value.items()}
    if isinstance(value, list):
        return [_hide_secrets(v, key) for v in value]
    return value


def _detail_text(value: Any) -> str:
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, default=str)
    return redact(text, limit=MAX_DETAIL_TEXT)


def details_payload(details: Any) -> dict[str, Any] | None:
    """The inbound details as key/value rows, or one block of text when the panel sent no mapping."""
    if not details:
        return None
    safe = _hide_secrets(details)
    if isinstance(safe, dict):
        rows = [{"key": str(key), "value": _detail_text(value)} for key, value in list(safe.items())[:MAX_DETAIL_ROWS]]
        return {"rows": rows, "text": None}
    return {"rows": [], "text": _detail_text(safe)}


async def inbounds_payload(session: AsyncSession, staff: dict) -> dict[str, Any]:
    payload: dict[str, Any] = {"tags": [], "details": None, "error": None}
    try:
        pg = await staff_pg_read_client(session, staff)
        inbounds = await pg.get_inbounds()
        tags = [_inbound_tag(item) for item in inbounds or []][:MAX_INBOUNDS]
        payload["tags"] = [tag for tag in tags if tag]
        payload["details"] = details_payload(await pg.get_inbounds_details())
    except PgReadDenied as exc:
        payload["error"] = exc.message
    except Exception as exc:
        logger.warning("pg inbounds read failed", exc_info=True)
        payload["error"] = safe_pg_error(exc, fallback=INBOUNDS_ERROR)
    return payload
