"""PasarGuard overview (``/pg``) data for the React panel: what the owner or a shop's own admin sees.

The owner sees the panel's server, live traffic, users and nodes; a reseller or panel staff sees
only their own quota and the users they own, never panel-wide figures. Everything here is display
data: it is never used to allow or deny, and a slow or unreachable panel only trims it.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import asdict
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.host_gauges import gauges_from_pg_system_stats, gauges_json
from app.services.node_traffic import build_nodes_overview, nodes_overview_json
from app.services.panel_home_payload import pg_limits_payload
from app.services.pasarguard import get_pg
from app.services.pg_overview import build_reseller_pg_overview
from app.services.pg_overview_view import overview_view, owner_user_counts
from app.services.pg_panel_errors import safe_persian_text
from app.services.pg_read_cache import DASHBOARD_COUNT_MAX_AGE_SEC

logger = logging.getLogger(__name__)

PG_STATS_ERROR = "دریافت آمار پاسارگارد ممکن نشد؛ چند لحظهٔ دیگر صفحه را تازه کنید."
# The widgets are decoration: past this the page shows what arrived and stops waiting.
WIDGETS_TIMEOUT_SEC = 3.0
MAX_NODE_CARDS = 200
EMPTY_COUNTS = {"admins": 0, "groups": 0, "hosts": 0, "nodes": 0, "users": 0}


def is_pg_owner(staff: dict) -> bool:
    """The true PasarGuard owner (hybrid account), not merely the web Owner session."""
    return bool(staff.get("pg_is_owner"))


def _list_len(value: Any) -> int:
    return len(value) if isinstance(value, list) else 0


async def _load_owner_widgets(state: dict[str, Any]) -> None:
    pg = get_pg()
    # Admin, group and host lists only feed the count tiles. During an outage the tiles show the
    # last good answer, flagged by the notice; live rates have no meaningful saved value.
    raw, nodes_raw, admins, groups, hosts, realtime = await asyncio.gather(
        pg.get_system_stats(last_good_ok=True),
        pg.get_nodes(last_good_ok=True),
        pg.get_admins_simple(cache_max_age=DASHBOARD_COUNT_MAX_AGE_SEC, last_good_ok=True),
        pg.get_groups_simple(cache_max_age=DASHBOARD_COUNT_MAX_AGE_SEC, last_good_ok=True),
        pg.get_hosts(cache_max_age=DASHBOARD_COUNT_MAX_AGE_SEC, last_good_ok=True),
        pg.get_nodes_realtime(),
        return_exceptions=True,
    )
    counts = state["counts"]
    if isinstance(raw, dict):
        state["host_gauges"] = gauges_from_pg_system_stats(raw)
        state["system_stats"] = raw
        counts["users"] = owner_user_counts(raw).total
    elif isinstance(raw, Exception):
        logger.warning("pg system stats failed", exc_info=raw)
        state["err"] = PG_STATS_ERROR
    nodes = nodes_raw if isinstance(nodes_raw, list) else []
    live = None if isinstance(realtime, Exception) else realtime
    try:
        overview = build_nodes_overview(nodes, live)
    except (TypeError, ValueError):
        logger.warning("pg node overview failed; showing nodes without live figures", exc_info=True)
        overview = build_nodes_overview(nodes, None)
    state["nodes_overview"] = overview
    counts["nodes"] = len(overview.get("nodes") or [])
    counts["admins"] = _list_len(admins)
    counts["groups"] = _list_len(groups)
    counts["hosts"] = _list_len(hosts)


async def display_widgets(staff: dict, session: AsyncSession) -> dict[str, Any]:
    """Decorative overview data, bounded by ``WIDGETS_TIMEOUT_SEC``; partial data is returned on a timeout."""
    state: dict[str, Any] = {
        "err": None,
        "system_stats": None,
        "nodes_overview": None,
        "host_gauges": None,
        "counts": dict(EMPTY_COUNTS),
        "reseller_overview": None,
    }
    owner = is_pg_owner(staff)

    async def load() -> None:
        if owner:
            await _load_owner_widgets(state)
        else:
            state["reseller_overview"] = await build_reseller_pg_overview(staff, session=session)

    try:
        await asyncio.wait_for(load(), timeout=WIDGETS_TIMEOUT_SEC)
    except asyncio.TimeoutError:
        logger.info("pg display widgets timed out after %.1fs - serving partial data", WIDGETS_TIMEOUT_SEC)
    except Exception:
        # Display only: the page still renders, flagged with the error.
        logger.warning("pg display widgets failed", exc_info=True)
        state["err"] = PG_STATS_ERROR
    nodes_overview = state["nodes_overview"]
    reseller = state["reseller_overview"] or {}
    state["view"] = overview_view(
        owner=owner,
        system_stats=state["system_stats"],
        user_stats=reseller.get("user_stats"),
        nodes=(nodes_overview or {}).get("nodes") if owner else [],
    )
    return state


def overview_payload(staff: dict, widgets: dict[str, Any], perms: list[str]) -> dict[str, Any]:
    """The widgets the screen shows. A non-owner never receives panel-wide counts, version or nodes."""
    owner = is_pg_owner(staff)
    view = widgets["view"]
    counts = asdict(view["counts"])
    payload: dict[str, Any] = {
        "owner": owner,
        "error": widgets["err"],
        "links": {"users": "pg_users" in perms, "nodes": "pg_nodes" in perms},
        "counts": counts,
        "segments": [asdict(segment) for segment in view["segments"]],
    }
    if not owner:
        reseller = widgets["reseller_overview"] or {}
        payload["ready"] = bool(reseller.get("ready"))
        raw_error = None if reseller.get("ready") else reseller.get("error")
        payload["account_error"] = safe_persian_text(str(raw_error), fallback=PG_STATS_ERROR) if raw_error else None
        payload["limits"] = pg_limits_payload(reseller)
        return payload
    live = nodes_overview_json(widgets["nodes_overview"] or {})
    payload.update(
        {
            "version": view["version"],
            "nodes_connected": view["nodes_connected"],
            "nodes_total": view["nodes_total"],
            "nodes_state": view["nodes_state"],
            "facts": {key: int(widgets["counts"].get(key) or 0) for key in ("admins", "groups", "hosts", "nodes")},
            "host": gauges_json(widgets["host_gauges"]) if widgets["host_gauges"] else None,
            "live": live["live"],
            "nodes": live["nodes"][:MAX_NODE_CARDS],
        }
    )
    return payload
