"""JSON bodies of the React panel's customer screens, built field by field.

Only what each screen shows is returned. Subscription links are never included: the screen
asks for one on demand through ``/users/{id}/services/{service_id}/link``.
"""

from __future__ import annotations

from typing import Any

from app.db.models import Plan
from app.services.bot_user_admin import ServiceSnapshot
from app.services.color_tags import ColorTag, color_tag_meta, color_tags_for_ui
from app.services.formatting import format_gb
from app.services.marketing_nav import MarketingSection
from app.services.trial_users import FILTER_LABELS, TrialSummary, TrialUserRow, TrialUsersPage
from app.services.user_card import UserCard
from app.services.user_edit_view import UserEditView
from app.services.users_list_view import UsersListView
from app.services.users_ops import ServiceSummary, UserOpsRow

# A customer row carries at most this many services; the real count stays in ``service_count``.
ROW_SERVICE_LIMIT = 30
EXTERNAL_SERVICE_REMARKS = frozenset({"linked", "imported"})
TRIAL_TIME_LENGTH = 16  # «YYYY-MM-DD HH:MM», as the table showed it


def tag_payload(tag: ColorTag) -> dict[str, str]:
    return {"key": tag.key, "title": tag.title_fa}


def color_tag_options() -> list[dict[str, str]]:
    return [{"key": t["key"], "title": t["title_fa"]} for t in color_tags_for_ui()]


def display_name(user: Any) -> str:
    return user.full_name or user.username or "—"


def _summary_payload(service: ServiceSummary) -> dict[str, Any]:
    return {
        "id": service.id,
        "label": service.label,
        "plan_name": service.plan_name,
        "pg_username": service.pg_username,
        "volume_text": service.volume_text,
        "expire_text": service.expire_text,
        "expire_tone": service.expire_tone,
        "days_left": service.days_left,
        "has_alert": service.has_alert,
    }


def _bulk_ops(row: UserOpsRow, view: UsersListView) -> list[str]:
    """The bulk actions that apply to this row (the server re-checks each one)."""
    can = view.abilities
    user = row.user
    ops: list[str] = []
    if can.manage:
        ops.append("unblock" if user.is_blocked else "block")
    if can.pg_update and row.service_count > 0:
        ops.append("renew")
    if can.manage and user.role != "admin":
        ops.append("delete")
    return ops


def _list_row_payload(row: UserOpsRow, view: UsersListView) -> dict[str, Any]:
    user = row.user
    marks = view.marks.get(int(user.id))
    return {
        "id": int(user.id),
        "telegram_id": int(user.telegram_id),
        "name": display_name(user),
        "message_name": user.full_name or user.username or str(user.telegram_id),
        "username": user.username or "",
        "role": user.role,
        "is_demo": bool(user.is_demo),
        "is_blocked": bool(user.is_blocked),
        "tag": tag_payload(color_tag_meta(marks.tag if marks else None)),
        "has_alert": row.has_alert,
        "service_count": row.service_count,
        "services": [_summary_payload(s) for s in row.services[:ROW_SERVICE_LIMIT]],
        "volume_text": row.volume_text,
        "expire_text": row.expire_text,
        "expire_tone": row.expire_tone,
        "days_left": row.days_left,
        "wallet_balance": row.wallet_balance,
        "can_message": not user.is_blocked,
        "can_renew": view.abilities.pg_update and row.service_count > 0,
        "bulk_ops": _bulk_ops(row, view),
    }


def users_list_payload(view: UsersListView) -> dict[str, Any]:
    can = view.abilities
    return {
        "filter": view.filter_key,
        "q": view.query,
        "color": view.color_filter or "",
        "focus_uid": view.focus_uid,
        "counts": view.counts,
        "color_tags": color_tag_options(),
        "can": {
            "manage": can.manage,
            "provision": can.provision,
            "edit_services": can.edit_services,
            "pg_update": can.pg_update,
        },
        "rows": [_list_row_payload(row, view) for row in view.rows],
    }


def user_card_payload(card: UserCard, *, can_edit: bool, can_message: bool) -> dict[str, Any]:
    user = card.user
    return {
        "user": {
            "id": int(user.id),
            "name": display_name(user),
            "username": user.username or "",
            "telegram_id": int(user.telegram_id),
            "role": user.role,
            "is_demo": bool(user.is_demo),
            "is_blocked": bool(user.is_blocked),
            "message_name": user.full_name or user.username or str(user.telegram_id),
        },
        "risk_tag": tag_payload(card.risk_tag) if card.risk_tag else None,
        "wallet_balance": card.wallet_balance,
        "paid_total": card.paid_total,
        "paid_count": card.paid_count,
        "joined": card.joined,
        "services": [_summary_payload(s) for s in card.services],
        "can_edit": can_edit,
        "can_message": can_message,
    }


def plan_option(plan: Plan) -> dict[str, Any]:
    return {"id": int(plan.id), "label": f"{plan.name} · {plan.duration_days or '∞'}روز · {format_gb(plan.data_limit_gb)}"}


def _edit_service_payload(snapshot: ServiceSnapshot) -> dict[str, Any]:
    service = snapshot.service
    return {
        "id": int(service.id),
        "title": service.plan.name if service.plan else (service.pg_username or "سرویس"),
        "pg_username": service.pg_username or "",
        "plan_id": int(service.plan_id) if service.plan_id else None,
        "status_text": snapshot.status_fa,
        "is_active": "فعال" in (snapshot.status_fa or ""),
        "error": snapshot.error or "",
        "volume_text": snapshot.volume_text,
        "remain_text": snapshot.remain_gb_text,
        "time_label": snapshot.time_label,
        "has_link": bool(snapshot.subscription_url),
        "is_external": service.remark in EXTERNAL_SERVICE_REMARKS,
    }


def user_edit_payload(view: UserEditView) -> dict[str, Any]:
    user = view.user
    shop_wallet = view.shop_wallet
    shop_block = view.shop_block
    return {
        "user": {
            "id": int(user.id),
            "name": display_name(user),
            "username": user.username or "",
            "telegram_id": int(user.telegram_id),
            "role": user.role,
            "is_blocked": bool(user.is_blocked),
            "is_demo": bool(user.is_demo),
        },
        "tag": tag_payload(view.tag),
        "color_tags": color_tag_options(),
        "note": view.marks.note if view.can_edit_private_marks else "",
        "wallet": {
            "balance": view.wallet_balance,
            "nonce": view.wallet_nonce,
            "transactions": [
                {"id": int(tx.id), "amount": int(tx.amount), "reason": tx.reason or "", "balance_after": int(tx.balance_after)}
                for tx in view.wallet_txs
            ],
        },
        "services": [_edit_service_payload(s) for s in view.services],
        "plans": [plan_option(p) for p in view.plans],
        "can": {
            "manage": view.can_manage_users,
            "demo": view.can_manage_demo_users,
            "private_marks": view.can_edit_private_marks,
            "view_services": view.can_view_services,
            "pg_create": view.can_pg_create,
            "pg_update": view.can_pg_update,
            "pg_delete": view.can_pg_delete,
            "delete_user": view.can_manage_users and user.role != "admin",
        },
        "shop_wallet": (
            {
                "nonce": shop_wallet["shop_wallet_nonce"],
                "max": shop_wallet["shop_wallet_max"],
                "daily": shop_wallet["shop_wallet_daily"],
            }
            if shop_wallet.get("can_adjust_shop_wallet")
            else None
        ),
        "shop_block": (
            {"blocked": bool(shop_block.get("shop_blocked")), "reason": str(shop_block.get("shop_blocked_reason") or "")}
            if shop_block.get("can_block_in_shop")
            else None
        ),
    }


def _trial_row_payload(row: TrialUserRow, *, can_message: bool, can_block: bool) -> dict[str, Any]:
    ops: list[str] = []
    if can_message and not row.is_blocked and not row.is_opted_out:
        ops.append("message")
    if can_block and row.can_manage:
        ops.append("unblock" if row.is_blocked else "block")
    return {
        "user_id": row.user_id,
        "name": row.name,
        "telegram_id": row.telegram_id,
        "trial_order_id": row.trial_order_id,
        "trial_at": str(row.trial_at)[:TRIAL_TIME_LENGTH] if row.trial_at else "",
        "trial_state": row.trial_state,
        "trial_state_label": row.trial_state_label,
        "is_buyer": row.is_buyer,
        "purchase_count": row.purchase_count,
        "first_purchase_at": str(row.first_purchase_at)[:TRIAL_TIME_LENGTH] if row.first_purchase_at else "",
        "total_spent": row.total_spent,
        "is_blocked": row.is_blocked,
        "is_opted_out": row.is_opted_out,
        "ops": ops,
    }


def trial_users_payload(
    page: TrialUsersPage,
    summary: TrialSummary,
    *,
    trial_filter: str,
    search: str,
    can_message: bool,
    can_block: bool,
    settings_href: str | None,
    marketing_tabs: tuple[MarketingSection, ...],
) -> dict[str, Any]:
    return {
        "filter": trial_filter,
        "q": search,
        "filters": [{"key": key, "label": label} for key, label in FILTER_LABELS.items()],
        "summary": {
            "trials": summary.trials,
            "buyers": summary.buyers,
            "non_buyers": summary.trials - summary.buyers,
            "conversion_percent": summary.conversion_percent,
        },
        "rows": [_trial_row_payload(r, can_message=can_message, can_block=can_block) for r in page.rows],
        "next_before": page.next_before,
        "can_message": can_message,
        "can_block": can_block,
        "settings_href": settings_href,
        "marketing_tabs": [{"key": s.key, "label": s.label, "href": s.href} for s in marketing_tabs],
    }
