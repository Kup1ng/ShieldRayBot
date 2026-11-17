"""Data of the finance hub (orders, payments, delivery failures, cancellations, automation, reports) for the React panel.

Every function takes the signed-in staff member and repeats the shop scope of the old server-rendered
page: the platform sees platform rows only, a shop sees its own, and staff without a resolvable shop get
``FinanceScopeError`` (never a fall-through to platform data). Results contain only what the screens show.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from sqlalchemy import String, and_, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import BotUser, Order, Payment, Plan
from app.services.authz import authz_from_staff, can_shop
from app.services.dashboard_trend import sales_trend_or_empty
from app.services.db_safe import recover_session, rollback_quiet
from app.services.staff_audit import parse_before_id
from app.services.finance_charts import finance_charts, method_segments
from app.services.finance_reports import build_finance_report
from app.services.formatting import order_status_fa
from app.services.list_query import (
    DEFAULT_LIST_PAGE_SIZE,
    build_list_pager,
    ilike_pattern,
    list_offset,
    normalize_search_q,
    parse_list_page,
)
from app.services.payment_voids import STATUS_REVIEW, list_voids
from app.services.shop_scope import ShopScopeError, is_platform_admin, resolve_shop_scope_id, shop_owner_id
from app.services.stuck_order_resolution import describe_stuck_orders
from app.services.users import get_all_settings, on

logger = logging.getLogger(__name__)

SCOPE_UNKNOWN = "محدوده فروشگاه مشخص نیست"
DELIVERY_ERROR_LIMIT = 120
RECEIPT_MATCH_LIMIT = 3
DEFAULT_MATCH_WINDOW_MINUTES = 120
STARS_RECEIPT_PREFIX = "stars:"
REPORT_PERIODS = frozenset({"day", "week", "month"})
TREND_RANGES = (7, 30)
# Order states a reviewer can still act on from the orders list.
OPEN_ORDER_STATUSES = frozenset({"paid", "awaiting_approval", "pending", "awaiting_receipt", "rejected"})


class FinanceScopeError(ValueError):
    """The staff member has no shop to show finance data for."""


@dataclass(frozen=True, slots=True)
class FinanceAccess:
    can_orders: bool
    can_payments: bool
    can_settings: bool
    can_billing: bool
    can_void_payment: bool
    platform: bool

    @property
    def any_list(self) -> bool:
        return self.can_orders or self.can_payments

    @property
    def tabs(self) -> list[str]:
        tabs: list[str] = []
        if self.any_list:
            tabs.append("reports")
        if self.can_orders:
            tabs.append("orders")
        if self.can_payments:
            tabs.append("payments")
        if self.can_orders:
            tabs.extend(["delivery", "cancellations", "automation"])
        return tabs


def finance_access(staff: dict) -> FinanceAccess:
    authz = authz_from_staff(staff)
    can_settings = staff.get("role") == "admin" or can_shop(authz, "shop_settings")
    platform = is_platform_admin(staff)
    return FinanceAccess(
        can_orders=can_shop(authz, "orders"),
        can_payments=can_shop(authz, "payments"),
        can_settings=can_settings,
        can_billing=can_settings and staff.get("role") == "admin" and platform,
        can_void_payment=can_shop(authz, "payment_void") and (platform or bool(shop_owner_id(staff))),
        platform=platform,
    )


def _shop_id(staff: dict) -> int | None:
    """Shop whose rows are shown: ``None`` for the platform, an id for a shop; anyone else is refused."""
    if is_platform_admin(staff):
        return None
    shop_id = shop_owner_id(staff)
    if not shop_id:
        raise FinanceScopeError(SCOPE_UNKNOWN)
    return int(shop_id)


def _sql_substr(col, pat: str):
    """Case-insensitive substring match (SQLite + Postgres)."""
    return func.lower(cast(col, String)).like(pat, escape="\\")


def _order_search_clause(pat: str):
    return or_(
        _sql_substr(Order.id, pat),
        _sql_substr(Order.status, pat),
        _sql_substr(Order.payment_method, pat),
        _sql_substr(Order.amount, pat),
        _sql_substr(Order.note, pat),
        _sql_substr(Order.user_id, pat),
        _sql_substr(Order.plan_id, pat),
        _sql_substr(BotUser.username, pat),
        _sql_substr(BotUser.full_name, pat),
        _sql_substr(BotUser.telegram_id, pat),
        _sql_substr(Plan.name, pat),
    )


def _payment_search_clause(pat: str, needle: str):
    parts = [
        _sql_substr(Payment.id, pat),
        _sql_substr(Payment.user_id, pat),
        _sql_substr(Payment.order_id, pat),
        _sql_substr(Payment.amount, pat),
        _sql_substr(Payment.status, pat),
        _sql_substr(Payment.method, pat),
        _sql_substr(Payment.review_note, pat),
        _sql_substr(BotUser.username, pat),
        _sql_substr(BotUser.full_name, pat),
        _sql_substr(BotUser.telegram_id, pat),
    ]
    if "شارژ" in needle:
        parts.append(Payment.is_wallet_topup.is_(True))
    if "خرید" in needle:
        parts.append(Payment.is_wallet_topup.is_(False))
    return or_(*parts)


def _user_name(user: BotUser | None, fallback: object) -> str:
    if user is None:
        return str(fallback)
    return str(user.full_name or user.username or fallback)


def _user_ref(user: BotUser | None, fallback: object) -> dict[str, Any]:
    return {
        "id": int(user.id) if user is not None and user.id else None,
        "name": _user_name(user, fallback),
        "is_demo": bool(user is not None and user.is_demo),
    }


def _has_receipt(payment: Payment | None) -> bool:
    file_id = str(payment.receipt_file_id or "") if payment is not None else ""
    return bool(file_id) and not file_id.startswith(STARS_RECEIPT_PREFIX)


def _stamp(value: object) -> str:
    return str(value or "")[:16]


# ---- orders ---------------------------------------------------------------------------------


def order_actions(order: Order, payment: Payment | None, *, stuck: bool) -> list[str]:
    """Row buttons of the orders list, in display order (the old template's rules, once)."""
    pending_payment = payment is not None and payment.status == "pending"
    if not (_has_receipt(payment) or pending_payment or order.status in OPEN_ORDER_STATUSES):
        return []
    actions: list[str] = ["receipt"] if _has_receipt(payment) else []
    status = order.status
    if pending_payment:
        actions += ["approve", "reject", "cancel"]
    elif status in {"paid", "awaiting_approval", "delivering"}:
        actions.append("retry_delivery" if stuck else "approve_deliver")
        if status == "awaiting_approval":
            actions += ["reject", "cancel"]
    elif status in {"pending", "awaiting_receipt"}:
        actions += ["approve_no_receipt", "reject", "cancel"]
    elif status == "rejected":
        actions.append("cancel")
    return actions


def order_bulk_ops(order: Order, payment: Payment | None) -> list[str]:
    if payment is not None and payment.status == "pending":
        return ["approve", "reject", "cancel"]
    if order.status == "paid":
        return ["approve"]
    if order.status in {"awaiting_approval", "pending", "awaiting_receipt"}:
        return ["approve", "reject", "cancel"]
    if order.status == "rejected":
        return ["cancel"]
    return []


def _pager_payload(pager: dict[str, Any]) -> dict[str, Any]:
    return {key: pager[key] for key in ("page", "page_size", "total", "pages", "has_prev", "has_next", "prev_page", "next_page")}


async def _latest_payments(session: AsyncSession, order_ids: list[int]) -> dict[int, Payment]:
    latest: dict[int, Payment] = {}
    if not order_ids:
        return latest
    rows = await session.execute(select(Payment).where(Payment.order_id.in_(order_ids)).order_by(Payment.id.desc()))
    for payment in rows.scalars().all():
        if payment.order_id is not None and payment.order_id not in latest:
            latest[int(payment.order_id)] = payment
    return latest


async def orders_page(session: AsyncSession, staff: dict, *, q: str | None, page: str | None) -> dict[str, Any]:
    shop_id = _shop_id(staff)
    search = normalize_search_q(q)
    scope = Order.reseller_id.is_(None) if shop_id is None else Order.reseller_id == shop_id
    count_q = select(func.count()).select_from(Order)
    list_q = select(Order).options(selectinload(Order.plan), selectinload(Order.user))
    if search:
        for join_target, on_clause in ((BotUser, BotUser.id == Order.user_id), (Plan, Plan.id == Order.plan_id)):
            count_q = count_q.outerjoin(join_target, on_clause)
            list_q = list_q.outerjoin(join_target, on_clause)
    count_q, list_q = count_q.where(scope), list_q.where(scope)
    if search:
        clause = _order_search_clause(ilike_pattern(search.casefold()))
        count_q, list_q = count_q.where(clause), list_q.where(clause)

    page_no, size = parse_list_page(page), DEFAULT_LIST_PAGE_SIZE
    total = int((await session.scalar(count_q)) or 0)
    page_no = int(build_list_pager(page=page_no, page_size=size, fetched=0, total=total)["page"])
    orders = list(
        (await session.execute(list_q.order_by(Order.id.desc()).offset(list_offset(page_no, size)).limit(size))).scalars().all()
    )
    pager = build_list_pager(page=page_no, page_size=size, fetched=len(orders), total=total)
    payments = await _latest_payments(session, [int(o.id) for o in orders])
    rows = []
    for order in orders:
        payment = payments.get(int(order.id))
        stuck = order.status in {"paid", "delivering"} and order.service_id is None
        rows.append(
            {
                "id": int(order.id),
                "user": _user_ref(order.user, order.user_id),
                "plan_name": str(order.plan.name) if order.plan else str(order.plan_id or "—"),
                "amount": int(order.amount or 0),
                "status": str(order.status),
                "payment_method": str(order.payment_method or ""),
                "created_at": _stamp(order.created_at),
                "stuck": stuck,
                "receipt_payment_id": int(payment.id) if payment is not None and _has_receipt(payment) else None,
                "actions": order_actions(order, payment, stuck=stuck),
                "bulk_ops": order_bulk_ops(order, payment),
            }
        )
    return {"q": search, "rows": rows, "pager": _pager_payload(pager)}


# ---- payments -------------------------------------------------------------------------------


def _payment_scope_queries(staff: dict):
    """Count and list queries limited to the staff member's own payments (platform: never a shop's)."""
    if is_platform_admin(staff):
        scope = or_(
            and_(Payment.is_wallet_topup.is_(True), Payment.wallet_shop_id.is_(None)),
            and_(Payment.is_wallet_topup.is_(False), Order.reseller_id.is_(None)),
        )
        count_q = select(func.count()).select_from(Payment).outerjoin(Order, Order.id == Payment.order_id)
        list_q = select(Payment).outerjoin(Order, Order.id == Payment.order_id)
        filters = (scope,)
    else:
        shop_id = _shop_id(staff)
        count_q = select(func.count()).select_from(Payment).join(Order, Order.id == Payment.order_id)
        list_q = select(Payment).join(Order, Order.id == Payment.order_id)
        filters = (Order.reseller_id == shop_id, Payment.is_wallet_topup.is_(False))
    count_q = count_q.outerjoin(BotUser, BotUser.id == Payment.user_id).where(*filters)
    list_q = list_q.outerjoin(BotUser, BotUser.id == Payment.user_id).where(*filters)
    return count_q, list_q


async def _receipt_matches(session: AsyncSession, staff: dict, payments: list[Payment]) -> dict[int, list[int]]:
    """Other pending payments of the same amount near each pending receipt (soft hints, max 3 ids)."""
    from app.services.ux20 import suggest_receipt_matches

    shop_id = None if is_platform_admin(staff) else shop_owner_id(staff)
    values = await get_all_settings(session) if shop_id is None else await get_all_settings(session, reseller_id=shop_id)
    if not on(values.get("receipt_auto_match_enabled", "1")):
        return {}
    try:
        window = int(values.get("receipt_match_window_minutes") or DEFAULT_MATCH_WINDOW_MINUTES)
    except (TypeError, ValueError):
        window = DEFAULT_MATCH_WINDOW_MINUTES
    matches: dict[int, list[int]] = {}
    for payment in payments:
        if payment.status != "pending" or not payment.receipt_file_id:
            continue
        try:
            found = await suggest_receipt_matches(session, payment=payment, window_minutes=window, reseller_id=shop_id)
        except Exception:  # noqa: BLE001 - a hint failing must not blank the list
            logger.warning("receipt match failed payment=%s", payment.id, exc_info=True)
            await rollback_quiet(session)
            continue
        if found:
            matches[int(payment.id)] = [int(m["id"]) for m in found[:RECEIPT_MATCH_LIMIT]]
    return matches


async def payments_page(
    session: AsyncSession, staff: dict, access: FinanceAccess, *, q: str | None, page: str | None
) -> dict[str, Any]:
    search = normalize_search_q(q)
    count_q, list_q = _payment_scope_queries(staff)
    if search:
        clause = _payment_search_clause(ilike_pattern(search.casefold()), search.casefold())
        count_q, list_q = count_q.where(clause), list_q.where(clause)
    page_no, size = parse_list_page(page), DEFAULT_LIST_PAGE_SIZE
    total = int((await session.scalar(count_q)) or 0)
    page_no = int(build_list_pager(page=page_no, page_size=size, fetched=0, total=total)["page"])
    payments = list(
        (await session.execute(list_q.order_by(Payment.id.desc()).offset(list_offset(page_no, size)).limit(size)))
        .scalars()
        .unique()
        .all()
    )
    pager = build_list_pager(page=page_no, page_size=size, fetched=len(payments), total=total)
    payer_ids = {int(p.user_id) for p in payments if p.user_id}
    payers: dict[int, BotUser] = {}
    if payer_ids:
        payers = {int(u.id): u for u in (await session.execute(select(BotUser).where(BotUser.id.in_(payer_ids)))).scalars().all()}
    voids = await list_voids(session, [int(p.id) for p in payments])
    matches = await _receipt_matches(session, staff, payments)
    rows = []
    for payment in payments:
        void = voids.get(int(payment.id))
        void_review = void is not None and void.status == STATUS_REVIEW
        can_void = access.can_void_payment and payment.status == "approved" and payment.method in {"card", "crypto"}
        can_retry_void = access.can_void_payment and payment.status == "voided" and void_review
        rows.append(
            {
                "id": int(payment.id),
                "user": _user_ref(payers.get(int(payment.user_id)), payment.user_id),
                "amount": int(payment.amount or 0),
                "is_wallet_topup": bool(payment.is_wallet_topup),
                "status": str(payment.status),
                "order_id": int(payment.order_id) if payment.order_id else None,
                "has_receipt": _has_receipt(payment),
                "void_review": bool(void_review),
                "can_void": bool(can_void),
                "can_retry_void": bool(can_retry_void),
                "void_reason": str(void.reason) if can_retry_void and void is not None else "",
                "void_refund": bool(can_retry_void and void is not None and void.refund_amount),
                "matches": matches.get(int(payment.id), []),
                "bulk_ops": ["approve", "reject"] if payment.status == "pending" else [],
            }
        )
    return {"q": search, "rows": rows, "pager": _pager_payload(pager), "can_void_payment": access.can_void_payment}


# ---- failed deliveries ----------------------------------------------------------------------


def _diag_payload(diag: Any) -> dict[str, Any] | None:
    if diag is None:
        return None
    return {
        "kind": str(diag.kind),
        "label": str(diag.label_fa),
        "detail": str(diag.detail_fa),
        "payment_status": diag.payment_status,
        "order_status": diag.order_status,
        "action": str(diag.preferred_action),
        "action_label": str(diag.action_label_fa),
    }


def _stuck_payload(reason: Any) -> dict[str, Any] | None:
    if reason is None:
        return None
    return {"kind": str(reason.kind), "reason": str(reason.reason), "can_refund": bool(reason.can_refund)}


async def delivery_queue(session: AsyncSession, staff: dict) -> dict[str, Any]:
    from app.services.payment_review_diag import diagnose_order_delivery
    from app.services.ux20 import list_open_delivery_failures, list_stuck_paid_orders

    shop_id = _shop_id(staff)
    failures = await list_open_delivery_failures(session, reseller_id=shop_id)
    stuck = await list_stuck_paid_orders(session, reseller_id=shop_id, limit=100)
    failure_ids = {int(f.order_id) for f in failures}
    stuck_ids = {int(o.id) for o in stuck}
    order_ids = list(failure_ids | stuck_ids)
    orders: dict[int, Order] = {}
    if order_ids:
        found = await session.execute(
            select(Order).options(selectinload(Order.user), selectinload(Order.plan)).where(Order.id.in_(order_ids))
        )
        orders = {int(o.id): o for o in found.scalars().all()}
    for order in stuck:
        orders.setdefault(int(order.id), order)
    payments = await _latest_payments(session, order_ids)
    diagnoses: dict[int, Any] = {}
    for oid, order in orders.items():
        try:
            diagnoses[oid] = await diagnose_order_delivery(session, order, payment=payments.get(oid))
        except Exception:  # noqa: BLE001 - one unreadable row must not hide the queue
            logger.debug("delivery diagnosis failed order=%s", oid, exc_info=True)
            await rollback_quiet(session)
    reasons = await describe_stuck_orders(session, stuck)

    def row(oid: int, *, failure: Any | None) -> dict[str, Any]:
        order, diag = orders.get(oid), diagnoses.get(oid)
        is_stuck = oid in stuck_ids
        return {
            "order_id": oid,
            "user_name": _user_name(order.user, order.user_id) if order is not None else "—",
            "stuck": is_stuck,
            "diag": _diag_payload(diag),
            "action": str(diag.preferred_action) if diag else "resume",
            "action_label": str(diag.action_label_fa) if diag else "ادامه تحویل",
            "stuck_reason": _stuck_payload(reasons.get(oid)) if is_stuck else None,
            "error": str(failure.error or "")[:DELIVERY_ERROR_LIMIT] if failure is not None else "",
            "attempts": int(failure.attempts or 0) if failure is not None else None,
            "bulk_ops": ["retry", "dismiss"] if failure is not None else ["retry"],
        }

    stuck_only = sorted(stuck_ids - failure_ids, reverse=True)
    rows = [row(oid, failure=None) for oid in stuck_only] + [row(int(f.order_id), failure=f) for f in failures]
    return {"rows": rows}


# ---- cancellations and automation -----------------------------------------------------------


async def cancellations_page(session: AsyncSession, staff: dict, access: FinanceAccess, *, before: str | None) -> dict[str, Any]:
    from app.services.service_cancellations import STATUS_LABELS, list_cancellation_requests

    try:
        scope = resolve_shop_scope_id(staff)
    except ShopScopeError:
        raise FinanceScopeError(SCOPE_UNKNOWN) from None
    raw = (before or "").strip()
    rows, next_before = await list_cancellation_requests(session, scope, before=parse_before_id(raw), limit=50)
    return {
        "rows": [
            {
                "id": int(row.id),
                "username": str(username),
                "status": str(row.status),
                "status_label": STATUS_LABELS.get(row.status, str(row.status)),
                "notification_status": str(row.notification_status or ""),
                "reason": str(row.reason or ""),
                "operator_note": str(row.operator_note or ""),
                "refund_amount": int(row.refund_amount) if row.refund_amount is not None else None,
            }
            for row, username in rows
        ],
        "next_before": next_before,
        "can_approve": access.can_payments,
    }


async def automation_page(session: AsyncSession, staff: dict, *, after: str | None) -> dict[str, Any]:
    from app.services.automation_review import STATE_LABELS, list_review_queue, shops_without_bot_token
    from app.services.service_automation import LABELS

    try:
        scope = resolve_shop_scope_id(staff)
    except ShopScopeError:
        raise FinanceScopeError(SCOPE_UNKNOWN) from None
    raw = (after or "").strip()
    items, next_cursor = await list_review_queue(session, shop_id=scope, after_service_id=parse_before_id(raw) or 0)
    return {
        "items": [
            {
                "service_id": item.service_id,
                "username": item.username,
                "customer": item.customer,
                "action_label": LABELS.get(item.action, item.action) if item.action else "",
                "order_id": item.order_id,
                "order_status_label": order_status_fa(item.order_status) if item.order_status else "",
                "amount": item.amount,
                "state": item.state,
                "state_label": STATE_LABELS.get(item.state, ""),
                "wallet_debited": item.wallet_debited,
            }
            for item in items
        ],
        "next_cursor": next_cursor,
        "missing_bots": await shops_without_bot_token(session) if scope is None else [],
    }


# ---- reports --------------------------------------------------------------------------------

_PERIOD_FIELDS = ("revenue", "delivered", "orders", "new_users", "avg_order")
_OPS_FIELDS = (
    "total_users",
    "blocked_users",
    "no_service_users",
    "pending_receipts",
    "open_tickets",
    "delivery_failures",
    "expiring_services",
    "low_volume_services",
)


def _ints(source: dict[str, Any] | None, fields: tuple[str, ...]) -> dict[str, int]:
    source = source or {}
    return {name: int(source.get(name) or 0) for name in fields}


def _series_payload(series: dict[str, Any]) -> dict[str, Any]:
    return {
        "days": [
            {"date": str(d["date"]), "weekday": str(d["weekday"]), "value": int(d["value"]), "extra": int(d["extra"])}
            for d in series["days"]
        ],
        "total": int(series["total"]),
        "previous_total": int(series["previous_total"]),
        "change_pct": series["change_pct"],
        "has_data": bool(series["has_data"]),
    }


def _trend_payload(trend: dict[str, Any]) -> dict[str, Any]:
    return {
        "days": [
            {"date": str(d["date"]), "weekday": str(d["weekday"]), "revenue": int(d["revenue"]), "orders": int(d["orders"])}
            for d in trend["days"]
        ],
        "total": int(trend["total"]),
        "previous_total": int(trend["previous_total"]),
        "change_pct": trend["change_pct"],
        "has_data": bool(trend["has_data"]),
    }


async def reports_payload(session: AsyncSession, staff: dict, *, period: str | None) -> dict[str, Any]:
    shop_id = _shop_id(staff)
    key = (period or "week").strip().lower()
    key = key if key in REPORT_PERIODS else "week"
    await recover_session(session)
    report = await build_finance_report(session, reseller_id=shop_id, period=key)
    charts = await finance_charts(session, reseller_id=shop_id)
    methods = [
        {
            "label": str(m["label"]),
            "count": int(m["count"]),
            "amount": int(m["amount"]),
            "share_pct": int(m["share_pct"]),
        }
        for m in report["payment_methods"]
    ]
    trends = {str(days): _trend_payload(await sales_trend_or_empty(session, reseller_id=shop_id, days=days)) for days in TREND_RANGES}
    return {
        "period": report["period"],
        "period_label": str(report["period_label"]),
        "generated_at": str(report["generated_at"]),
        "periods": {name: _ints(report["periods"].get(name), _PERIOD_FIELDS) for name in ("day", "week", "month")},
        "active": _ints(report["active"], _PERIOD_FIELDS),
        "ops": _ints(report["ops"], _OPS_FIELDS),
        "payment_methods": methods,
        "method_segments": method_segments(report["payment_methods"]),
        "sales_trend": trends,
        "charts": {
            name: {str(days): _series_payload(series) for days, series in charts[name].items()} for name in ("orders", "new_users")
        },
    }
