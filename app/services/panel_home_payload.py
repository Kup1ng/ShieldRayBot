"""JSON shapes of the React dashboard, bot overview, inbox and staff report.

Each function turns the context a page builder already computed into the fields the screen
shows and nothing else: no tokens, no panel addresses, no raw exception text. Persian status
wording lives here so the screens stay presentation only.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import asdict
from typing import Any

UNCHECKED_DETAIL = "بررسی نشده"
OWNER_BOT_HREF = "/settings?tab=bot"
SHOP_BOT_HREF = "/shop-settings?tab=bot"
PERIOD_KEYS = ("day", "week", "month")
PERIOD_FIELDS = ("orders", "delivered", "revenue", "new_users")
WAITING_ORDER_STATUSES = frozenset({"pending", "awaiting_receipt", "awaiting_approval"})
ORDER_STATUS_LABELS = {
    "delivered": ("تحویل شد", "success"),
    "paid": ("پرداخت شد", "accent"),
    "rejected": ("رد شد", "danger"),
    "cancelled": ("لغو", "danger"),
}
PAYMENT_STATUS_LABELS = {
    "pending": ("در انتظار", "warning"),
    "approved": ("تأییدشده", "success"),
    "rejected": ("ردشده", "danger"),
    "voided": ("ابطال‌شده", "danger"),
}
MAX_PAYG_NAMES = 3


def _int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _text(value: Any) -> str:
    return "" if value is None else str(value)


def _mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def periods_payload(periods: Any) -> dict[str, dict[str, int]]:
    source = _mapping(periods)
    return {key: {field: _int(_mapping(source.get(key)).get(field)) for field in PERIOD_FIELDS} for key in PERIOD_KEYS}


def action_center_payload(action_center: Any) -> dict[str, Any]:
    source = _mapping(action_center)
    entries = [
        {
            "key": _text(entry.get("key")),
            "title": _text(entry.get("title")),
            "detail": _text(entry.get("detail")),
            "href": _text(entry.get("href")),
            "tone": _text(entry.get("tone")) or "neutral",
        }
        for entry in source.get("entries") or []
        if isinstance(entry, Mapping)
    ]
    return {
        "has_items": bool(source.get("has_items") and entries),
        "entries": entries,
        "pending": _int(source.get("pending")),
        "tickets": _int(source.get("tickets")),
    }


def _meter_payload(meter: Any) -> dict[str, Any] | None:
    if not isinstance(meter, Mapping):
        return None
    has_limit = bool(meter.get("has_limit"))
    return {
        "label": _text(meter.get("label")),
        "has_limit": has_limit,
        "pct": meter.get("pct") if has_limit else None,
        "remain_pct": meter.get("remain_pct") if has_limit else None,
        "tone": _text(meter.get("tone")) or "neutral",
        "exhausted": bool(meter.get("exhausted")),
        "used_text": _text(meter.get("used_text")),
        "limit_text": _text(meter.get("limit_text")),
        "remain_text": _text(meter.get("remain_text")),
        "ratio_text": _text(meter.get("ratio_text")),
    }


def pg_limits_payload(limits: Any) -> dict[str, Any] | None:
    """The PasarGuard account limits card; only a successful live read is shown."""
    source = _mapping(limits)
    if not source.get("ready"):
        return None
    users, traffic = _meter_payload(source.get("users")), _meter_payload(source.get("traffic"))
    constraints = [
        {"label": _text(box.get("label")), "value_text": _text(box.get("value_text"))}
        for box in source.get("constraints") or []
        if isinstance(box, Mapping)
    ]
    if not (users or traffic or constraints):
        return None
    return {
        "username": source.get("username") or None,
        "status_label": source.get("status_label") or None,
        "status_badge": source.get("status_badge") or "neutral",
        "users": users,
        "traffic": traffic,
        "constraints": constraints,
        "lifetime_text": source.get("lifetime_text") or None,
    }


def link_health_payload(health: Any) -> dict[str, Any] | None:
    """How the link to PasarGuard behaved this hour (owner only)."""
    source = _mapping(health)
    if not source:
        return None
    circuit = _mapping(source.get("circuit"))
    if circuit.get("paused"):
        tone, label = "danger", "متوقف"
    elif source.get("recent_failure_count"):
        tone, label = "warning", "ناپایدار"
    elif source.get("last_ok_at"):
        tone, label = "success", "عادی"
    else:
        tone, label = "default", "بدون داده"
    return {
        "tone": tone,
        "label": label,
        "latency_p50_ms": source.get("latency_p50_ms"),
        "latency_p95_ms": source.get("latency_p95_ms"),
        "last_ok_time": source.get("last_ok_time"),
        "last_failure_time": source.get("last_failure_time"),
        "paused": bool(circuit.get("paused")),
        "retry_in_sec": _int(circuit.get("retry_in_sec")),
        "recent_failures": [
            {"label": _text(row.get("label")), "count": _int(row.get("count"))}
            for row in source.get("recent_failures") or []
            if isinstance(row, Mapping) and row.get("count")
        ],
    }


def _bot_tile(bot: Any, *, href: str) -> dict[str, Any]:
    source = _mapping(bot)
    if source.get("unchecked"):
        state, detail = "neutral", UNCHECKED_DETAIL
    elif source.get("ok"):
        username = _text(source.get("username"))
        state, detail = "ok", f"@{username}" if username else "آنلاین"
    else:
        state, detail = "err", _text(source.get("error")) or "قطع"
    return {"id": "bot", "name": "ربات تلگرام", "detail": detail, "state": state, "href": href}


def _pg_tile(pg_health: Any) -> dict[str, Any]:
    source = _mapping(pg_health)
    if source.get("unchecked"):
        state, detail = "neutral", UNCHECKED_DETAIL
    elif source.get("ok"):
        version = _text(source.get("version"))
        state, detail = "ok", f"نسخه {version}" if version else "آنلاین"
    else:
        state, detail = "err", _text(source.get("error")) or "قطع"
    return {"id": "pg", "name": "پاسارگارد", "detail": detail, "state": state, "href": "/pg"}


def _nodes_tile(nodes: Any) -> dict[str, Any]:
    source = _mapping(nodes)
    if source.get("unchecked"):
        state, detail = "neutral", UNCHECKED_DETAIL
    else:
        overall = source.get("overall")
        if source.get("ok") and overall == "ok":
            state = "ok"
        elif source.get("ok") and overall == "warn":
            state = "warn"
        elif not source.get("ok") or overall == "err":
            state = "err"
        else:
            state = "neutral"
        if source.get("ok") and source.get("total"):
            detail = f"{_int(source.get('connected'))}/{_int(source.get('total'))} متصل"
        else:
            detail = _text(source.get("error")) or "ثبت‌نشده"
    return {"id": "nodes", "name": "نود", "detail": detail, "state": state, "href": "/pg/nodes"}


def connection_notice(request_state: Any) -> dict[str, Any] | None:
    """Set when PasarGuard answered late or not at all while this page was built."""
    budget = getattr(request_state, "pg_read_budget", None)
    if not getattr(budget, "failure", None):
        return None
    last_good = getattr(request_state, "pg_last_good", None)
    if last_good is not None and getattr(last_good, "age", None) is not None:
        return {"kind": "stale", "minutes": _int(last_good.minutes)}
    return {"kind": "unavailable", "minutes": 0}


def _kpi_payload(periods: dict, action_center: dict, trend: Any, links: Mapping[str, bool]) -> dict[str, Any]:
    day, week = periods["day"], periods["week"]
    sales = _mapping(trend)
    return {
        "sales_today": _int(sales["today"]) if "today" in sales else day["revenue"],
        "sales_compare": "today_change_pct" in sales,
        "sales_today_change_pct": sales.get("today_change_pct"),
        "new_users_today": day["new_users"],
        "new_users_week": week["new_users"],
        "pending": action_center["pending"],
        "tickets": action_center["tickets"],
        "links": {"payments": bool(links.get("payments")), "tickets": bool(links.get("tickets"))},
    }


def _trend_payload(trend: Any) -> dict[str, Any] | None:
    source = _mapping(trend)
    return dict(source) if source else None


def _account_payload(wallet_card: Any) -> dict[str, Any] | None:
    source = _mapping(wallet_card)
    if not source:
        return None
    return {
        "balance": _int(source.get("balance")),
        "services": _int(source.get("services")),
        "nearest_expiry_days": source.get("nearest_expiry_days"),
        "user_id": _int(source.get("user_id")) or None,
    }


def home_portals(staff: Mapping[str, Any], *, owner: bool) -> dict[str, Any]:
    """Which overview shortcuts the dashboard offers this staff member."""
    if owner:
        return {"bot": True, "pg": True}
    role = staff.get("role")
    return {
        "bot": "dashboard" in (staff.get("permissions") or []) or role == "reseller",
        "pg": (
            "pg_overview" in (staff.get("pg_permissions") or [])
            or role == "reseller"
            or bool(staff.get("pg_admin_username"))
        ),
    }


def home_shell_payload(
    staff: Mapping[str, Any], template: str, ctx: Mapping[str, Any], links: Mapping[str, bool]
) -> dict[str, Any]:
    """What the dashboard frame needs before the slow widgets arrive."""
    owner = template == "home.html"
    return {
        "variant": "owner" if owner else "shop",
        "portals": home_portals(staff, owner=owner),
        "show_pg_nodes": bool(ctx.get("show_pg_nodes")) if owner else False,
        "bot_setup_needed": bool(ctx.get("bot_setup_needed")),
        "kpi_links": {"payments": bool(links.get("payments")), "tickets": bool(links.get("tickets"))},
    }


def home_widgets_payload(
    staff: Mapping[str, Any],
    template: str,
    ctx: Mapping[str, Any],
    links: Mapping[str, bool],
    *,
    update: Any = None,
    notice: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """The dashboard body of the platform owner (``home.html``) or of a shop."""
    owner = template == "home.html"
    periods = periods_payload(ctx.get("periods"))
    action_center = action_center_payload(ctx.get("action_center"))
    tiles = [_bot_tile(_mapping(ctx.get("overview")).get("bot") if owner else ctx.get("bot"), href=OWNER_BOT_HREF if owner else SHOP_BOT_HREF)]
    tiles.append(_pg_tile(ctx.get("pg_health")))
    if owner and ctx.get("show_pg_nodes"):
        tiles.append(_nodes_tile(_mapping(ctx.get("overview")).get("nodes")))
    billing = _mapping(ctx.get("billing_card"))
    update_info = _mapping(update)
    return {
        "variant": "owner" if owner else "shop",
        "degraded": bool(ctx.get("dashboard_degraded")),
        "notice": notice,
        "update": {"remote_version": _text(update_info.get("remote_version"))}
        if owner and update_info.get("update_available")
        else None,
        "bot_setup_needed": bool(ctx.get("bot_setup_needed")),
        "billing": {"balance": _int(billing.get("balance")), "suspended": bool(billing.get("suspended"))} if billing else None,
        "kpi": _kpi_payload(periods, action_center, ctx.get("trend"), links),
        "tiles": tiles,
        "link_health": link_health_payload(ctx.get("pg_link_health")) if owner else None,
        "pg_limits": pg_limits_payload(ctx.get("pg_limits")),
        "portals": home_portals(staff, owner=owner),
        "trend": _trend_payload(ctx.get("trend")),
        "queue": action_center,
        "periods": periods,
        "account": _account_payload(ctx.get("wallet_card")) if owner else None,
    }


def _payg_rows(rows: Any) -> list[dict[str, Any]]:
    return [{"label": _text(row.get("label")), "balance": _int(row.get("balance"))} for row in rows or [] if isinstance(row, Mapping)]


def inbox_payload(ctx: Mapping[str, Any]) -> dict[str, Any]:
    """The notifications and work queue of one staff member, dismissals already applied."""
    update = _mapping(ctx.get("update"))
    ticket = _mapping(ctx.get("ticket_alert"))
    payg = _mapping(ctx.get("payg_risk"))
    return {
        "has_items": bool(ctx.get("inbox_has")),
        "hidden_count": _int(ctx.get("inbox_hidden_by_dismiss")),
        "update": {"version": _text(update.get("version")), "remote_version": _text(update.get("remote_version"))}
        if update.get("update_available")
        else None,
        "ticket_alert": {
            "title": _text(ticket.get("title")),
            "detail": _text(ticket.get("detail")),
            "href": _text(ticket.get("href")) or "/tickets",
            "entity_id": _text(ticket.get("ticket_id") or ticket.get("id")),
        }
        if ticket
        else None,
        "shop_maintenance": bool(ctx.get("shop_maintenance")),
        "capacity_warn": bool(ctx.get("capacity_warn")),
        "payg": {
            "suspended": _payg_rows(payg.get("suspended")),
            "low": _payg_rows(payg.get("low")),
            "threshold": _int(payg.get("threshold")),
            "max_names": MAX_PAYG_NAMES,
        },
        "action_center": action_center_payload(ctx.get("action_center")),
    }


def _order_row(order: Any) -> dict[str, Any]:
    status = _text(order.status)
    if status in WAITING_ORDER_STATUSES:
        label, tone = "در انتظار", "warning"
    else:
        label, tone = ORDER_STATUS_LABELS.get(status, (status or "نامشخص", "default"))
    return {"id": int(order.id), "amount": _int(order.amount), "status_label": label, "tone": tone}


def _payment_row(payment: Any) -> dict[str, Any]:
    status = _text(payment.status)
    label, tone = PAYMENT_STATUS_LABELS.get(status, (status or "نامشخص", "default"))
    return {
        "id": int(payment.id),
        "amount": _int(payment.amount),
        "is_topup": bool(payment.is_wallet_topup),
        "status_label": label,
        "tone": tone,
    }


def _stats_payload(stats: Mapping[str, Any]) -> dict[str, int]:
    return {key: _int(stats.get(key)) for key in ("users", "orders", "plans", "resellers", "revenue", "services", "pending", "tickets")}


def overview_payload(
    *,
    viewer: Any,
    period: str,
    period_labels: Mapping[str, str],
    compare_label: str,
    bot_setup_needed: bool,
    figures: Mapping[str, Any] | None,
    host: Mapping[str, Any] | None,
) -> dict[str, Any]:
    """The bot overview (/dashboard) of one shop; ``figures`` is None when it has no bot or no shop."""
    payload: dict[str, Any] = {
        "viewer": {
            "has_shop": bool(viewer.has_shop),
            "is_platform": viewer.shop_id is None,
            "can_payments": bool(viewer.can_payments),
            "can_orders": bool(viewer.can_orders),
            "can_tickets": bool(viewer.can_tickets),
            "can_settings": bool(viewer.can_settings),
            "settings_href": OWNER_BOT_HREF if viewer.shop_id is None else "/shop-settings",
        },
        "period": period,
        "periods": [{"key": key, "label": label} for key, label in period_labels.items()],
        "compare_label": compare_label,
        "bot_setup_needed": bot_setup_needed,
        "host": dict(host) if host else None,
        "figures": None,
    }
    if figures is None:
        return payload
    kpis = figures["kpis"]
    payload["figures"] = {
        "stats": _stats_payload(figures["stats"]),
        "kpis": {
            "current": asdict(kpis.current),
            "change_pct": {field: kpis.change_pct(field) for field in ("revenue", "delivered", "new_users")},
        },
        "deliveries": _int(figures["deliveries"]),
        "trend": _trend_payload(figures["trend"]),
        "recent_payments": [_payment_row(p) for p in figures["recent_payments"]] if viewer.can_payments else None,
        "recent_orders": [_order_row(o) for o in figures["recent_orders"]] if viewer.can_orders else None,
        "bot": {
            "state": _text(figures["bot"].get("state")) or "neutral",
            "username": figures["bot"].get("username") or None,
            "detail": _text(figures["bot"].get("detail")),
        },
    }
    return payload


def staff_actions_payload(views: list[Any], next_before: int | None) -> dict[str, Any]:
    return {
        "actions": [
            {
                "id": view.id,
                "when": view.when,
                "actor": view.actor,
                "actor_kind": view.actor_kind,
                "action": view.action,
                "target": view.target,
                "amount": view.amount,
                "reason": view.reason,
            }
            for view in views
        ],
        "next_before": next_before,
    }
