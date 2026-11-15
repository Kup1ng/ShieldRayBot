"""Data the React loyalty page shows: overview, ledger and the settings editors.

Every function takes the shop scope the caller already resolved (``None`` = the platform shop)
and reads only that shop's rows. Output is explicit JSON-ready dicts: no ORM objects, no ids of
customers (the ledger shows a label), nothing the old server-rendered page did not show.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any
from urllib.parse import quote

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    BotUser,
    LoyaltyReward,
    LoyaltyTier,
    LuckyWheelPrize,
    PointsRule,
    PointsTransaction,
)
from app.services.db_safe import rollback_quiet
from app.services.formatting import bot_user_panel_label
from app.services.loyalty import (
    EVENT_LABELS,
    REWARD_TYPE_LABELS,
    ensure_loyalty_defaults,
    overview_metrics,
)
from app.services.lucky_wheel import (
    DEFAULT_SUBMENU_ORDER,
    PRIZE_TYPE_LABELS as WHEEL_PRIZE_TYPE_LABELS,
    get_wheel_settings,
    list_prizes,
    list_recent_spins,
    overview_wheel_metrics,
)
from app.services.platform_identity import is_explicit_owner_staff
from app.services.shop_manual_adjust import new_request_key
from app.services.shop_points_adjust import shop_points_form_context
from app.services.users import SETTING_GROUPS, TAB_SETTING_GROUPS, get_all_settings, get_setting

logger = logging.getLogger(__name__)

TRANSACTION_LIMIT = 50
SPIN_LIMIT = 40
SUBMENU_LABELS = {
    "loy_referral": "دعوت دوستان",
    "loy_points": "امتیاز من",
    "loy_rewards": "جوایز",
    "loy_wheel": "چرخ شانس",
    "loy_history": "تاریخچه",
}
REFERRAL_TAB = "loyalty"
REFERRAL_FIELD_KINDS = {"text", "textarea"}
SHOP_SETTINGS_PERMISSION = "shop_settings"


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if isinstance(value, datetime) else None


def _options(labels: dict[str, str]) -> list[dict[str, str]]:
    return [{"value": key, "label": label} for key, label in labels.items()]


def _submenu_lists(order: list[str]) -> tuple[list[str], list[str]]:
    """Active buttons in their saved order, and the known buttons that are hidden."""
    active = [key for key in order if key in DEFAULT_SUBMENU_ORDER]
    active = active or list(DEFAULT_SUBMENU_ORDER)
    hidden = [key for key in DEFAULT_SUBMENU_ORDER if key not in active]
    return active, hidden


def can_edit_referral_text(staff: dict) -> bool:
    return staff.get("role") == "admin" or SHOP_SETTINGS_PERMISSION in (staff.get("permissions") or [])


def _empty_wheel_metrics() -> dict[str, Any]:
    return {"wheel_enabled": False, "active_prizes": 0, "total_spins": 0, "spin_cost": 10}


async def _wheel_metrics(session: AsyncSession, scope: int | None) -> dict[str, Any]:
    """The summary card of the wheel; a pending migration shows it as switched off."""
    try:
        metrics = await overview_wheel_metrics(session, reseller_id=scope)
    except Exception:
        logger.exception("loyalty wheel metrics failed (migration pending?)")
        await rollback_quiet(session)
        return _empty_wheel_metrics()
    return {
        "wheel_enabled": bool(metrics["wheel_enabled"]),
        "active_prizes": int(metrics["active_prizes"]),
        "total_spins": int(metrics["total_spins"]),
        "spin_cost": int(metrics["spin_cost"]),
    }


def _manual_adjust_context(staff: dict) -> dict[str, Any]:
    shop = shop_points_form_context(staff)
    owner_allowed = is_explicit_owner_staff(staff)
    return {
        "platform": {"allowed": owner_allowed, "nonce": new_request_key() if owner_allowed else ""},
        "shop": {
            "allowed": bool(shop.get("can_adjust_shop_points")),
            "nonce": str(shop.get("shop_points_nonce") or ""),
            "max_points": int(shop.get("shop_points_max") or 0),
            "daily_points": int(shop.get("shop_points_daily") or 0),
        },
    }


async def loyalty_overview(session: AsyncSession, staff: dict, scope: int | None) -> dict[str, Any]:
    await ensure_loyalty_defaults(session, reseller_id=scope)
    metrics = await overview_metrics(session, reseller_id=scope)
    enabled = await get_setting(session, "loyalty_enabled", "1", reseller_id=scope)
    wallet_rate = await get_setting(session, "points_to_wallet_rate", "100", reseller_id=scope)
    return {
        "metrics": {
            "total_referrals": int(metrics["total_referrals"]),
            "qualified_referrals": int(metrics["qualified_referrals"]),
            "points_issued": int(metrics["points_issued"]),
            "points_redeemed": int(metrics["points_redeemed"]),
            "wallet_credits_issued": int(metrics["wallet_credits_issued"]),
            "active_rewards": int(metrics["active_rewards"]),
            "top_referrers": [
                {"label": str(row["label"]), "count": int(row["count"])} for row in metrics["top_referrers"]
            ],
        },
        "wheel": await _wheel_metrics(session, scope),
        "club": {"enabled": enabled in {"1", "true", "yes", "on"}, "wallet_rate": str(wallet_rate)},
        "adjust": _manual_adjust_context(staff),
        "is_platform_admin": staff.get("role") == "admin",
        "can_edit_referral_text": can_edit_referral_text(staff),
    }


async def loyalty_transactions(session: AsyncSession, scope: int | None) -> list[dict[str, Any]]:
    query = (
        select(PointsTransaction, BotUser)
        .join(BotUser, BotUser.id == PointsTransaction.user_id)
        .order_by(PointsTransaction.id.desc())
        .limit(TRANSACTION_LIMIT)
    )
    # The entry's own purse decides the shop, not the customer's attribution.
    if scope is None:
        query = query.where(PointsTransaction.reseller_id.is_(None))
    else:
        query = query.where(PointsTransaction.reseller_id == int(scope))
    rows = (await session.execute(query)).all()
    return [
        {
            "id": int(tx.id),
            "user_label": bot_user_panel_label(user, fallback_id=tx.user_id),
            "amount": int(tx.amount),
            "balance_after": int(tx.balance_after),
            "description": str(tx.description or ""),
            "created_at": _iso(tx.created_at),
        }
        for tx, user in rows
    ]


def _rule_row(rule: PointsRule) -> dict[str, Any]:
    return {
        "id": int(rule.id),
        "event_label": EVENT_LABELS.get(rule.event_key, rule.event_key),
        "name": rule.name,
        "amount_mode": rule.amount_mode,
        "amount": int(rule.amount),
        "max_reward": rule.max_reward,
        "min_purchase_toman": int(rule.min_purchase_toman or 0),
        "min_purchase_gb": int(rule.min_purchase_gb or 0),
        "cooldown_hours": int(rule.cooldown_hours or 0),
        "enabled": bool(rule.enabled),
        "first_time_only": bool(rule.first_time_only),
    }


def _reward_row(reward: LoyaltyReward) -> dict[str, Any]:
    return {
        "id": int(reward.id),
        "name": reward.name,
        "description": reward.description or "",
        "reward_type": reward.reward_type,
        "type_label": REWARD_TYPE_LABELS.get(reward.reward_type, reward.reward_type),
        "reward_value": int(reward.reward_value),
        "points_cost": int(reward.points_cost),
        "sort_order": int(reward.sort_order or 0),
        "enabled": bool(reward.enabled),
        "redemption_count": int(reward.redemption_count or 0),
        "max_redemptions_global": reward.max_redemptions_global,
        "max_redemptions_per_user": reward.max_redemptions_per_user,
        "min_purchase_toman": int(reward.min_purchase_toman or 0),
        "max_discount_toman": reward.max_discount_toman,
        "expires_days": reward.expires_days,
    }


def _tier_row(tier: LoyaltyTier) -> dict[str, Any]:
    return {
        "id": int(tier.id),
        "name": tier.name,
        "min_points": int(tier.min_points),
        "max_points": tier.max_points,
        "multiplier_bps": int(tier.multiplier_bps),
        "enabled": bool(tier.enabled),
    }


def _prize_row(prize: LuckyWheelPrize) -> dict[str, Any]:
    return {
        "id": int(prize.id),
        "label": prize.label,
        "prize_type": prize.prize_type,
        "type_label": WHEEL_PRIZE_TYPE_LABELS.get(prize.prize_type, prize.prize_type),
        "prize_value": int(prize.prize_value),
        "weight": int(prize.weight),
        "sort_order": int(prize.sort_order or 0),
        "enabled": bool(prize.enabled),
        "win_count": int(prize.win_count or 0),
        "max_wins_global": prize.max_wins_global,
        "max_wins_per_user": prize.max_wins_per_user,
        "min_purchase_toman": int(prize.min_purchase_toman or 0),
        "max_discount_toman": prize.max_discount_toman,
        "expires_days": prize.expires_days,
    }


def _empty_wheel_settings() -> dict[str, Any]:
    active, hidden = _submenu_lists(list(DEFAULT_SUBMENU_ORDER))
    return {
        "degraded": True,
        "enabled": False,
        "spin_cost": 10,
        "daily_limit": 3,
        "cooldown_seconds": 0,
        "free_spins_daily": 0,
        "submenu_active": active,
        "submenu_hidden": hidden,
        "prizes": [],
        "spins": [],
    }


async def _spin_rows(session: AsyncSession, scope: int | None) -> list[dict[str, Any]]:
    spins = await list_recent_spins(session, reseller_id=scope, limit=SPIN_LIMIT)
    user_ids = {int(spin.user_id) for spin in spins}
    users: dict[int, BotUser] = {}
    if user_ids:
        found = (await session.execute(select(BotUser).where(BotUser.id.in_(user_ids)))).scalars().all()
        users = {int(user.id): user for user in found}
    return [
        {
            "id": int(spin.id),
            "user_label": bot_user_panel_label(users.get(int(spin.user_id)), fallback_id=int(spin.user_id)),
            "prize_label": spin.prize_label_snapshot,
            "type_label": WHEEL_PRIZE_TYPE_LABELS.get(spin.prize_type, spin.prize_type),
            "cost_points": int(spin.cost_points or 0),
            "used_free_spin": bool(spin.used_free_spin),
            "status": spin.status,
        }
        for spin in spins
    ]


async def wheel_settings(session: AsyncSession, scope: int | None) -> dict[str, Any]:
    """The wheel editor's data. A pending migration yields a marked, switched-off default."""
    try:
        cfg = await get_wheel_settings(session, reseller_id=scope)
        prizes = await list_prizes(session, reseller_id=scope, include_archived=False)
        spins = await _spin_rows(session, scope)
    except Exception:
        logger.exception("loyalty wheel settings failed (migration pending?)")
        await rollback_quiet(session)
        return _empty_wheel_settings()
    active, hidden = _submenu_lists(list(cfg["submenu_order"]))
    return {
        "degraded": False,
        "enabled": bool(cfg["enabled"]),
        "spin_cost": int(cfg["spin_cost"]),
        "daily_limit": int(cfg["daily_limit"]),
        "cooldown_seconds": int(cfg["cooldown_seconds"]),
        "free_spins_daily": int(cfg["free_spins_daily"]),
        "submenu_active": active,
        "submenu_hidden": hidden,
        "prizes": [_prize_row(prize) for prize in prizes],
        "spins": spins,
    }


def _referral_action(staff: dict) -> str:
    next_url = quote("/loyalty?tab=overview&settings=referral")
    if staff.get("role") == "admin":
        return f"/settings?tab={REFERRAL_TAB}&next={next_url}"
    return f"/shop-settings?tab={REFERRAL_TAB}&next={next_url}"


async def referral_editor(session: AsyncSession, staff: dict, scope: int | None) -> dict[str, Any] | None:
    """The invite-text fields, for staff who may edit them (they save through the settings pages)."""
    if not can_edit_referral_text(staff):
        return None
    values = await get_all_settings(session, reseller_id=scope)
    fields = []
    for group in TAB_SETTING_GROUPS.get(REFERRAL_TAB) or []:
        for item in SETTING_GROUPS.get(group, []):
            key, label = item[0], item[1]
            kind = item[2] if len(item) > 2 else "text"
            if kind not in REFERRAL_FIELD_KINDS:
                continue
            fields.append(
                {
                    "name": f"s_{key}",
                    "label": label,
                    "kind": kind,
                    "help": item[3] if len(item) > 3 else "",
                    "value": str(values.get(key, "")),
                }
            )
    return {"action": _referral_action(staff), "fields": fields}


async def _ordered(session: AsyncSession, model: Any, scope: int | None) -> list[Any]:
    query = select(model)
    if scope is None:
        query = query.where(model.reseller_id.is_(None))
    else:
        query = query.where(model.reseller_id == int(scope))
    query = query.order_by(model.sort_order.asc(), model.id.asc())
    return list((await session.execute(query)).scalars().all())


async def loyalty_settings(session: AsyncSession, staff: dict, scope: int | None) -> dict[str, Any]:
    await ensure_loyalty_defaults(session, reseller_id=scope)
    rules = await _ordered(session, PointsRule, scope)
    rewards = await _ordered(session, LoyaltyReward, scope)
    tiers = (
        await session.execute(select(LoyaltyTier).order_by(LoyaltyTier.sort_order.asc(), LoyaltyTier.id.asc()))
    ).scalars().all()
    return {
        "rules": [_rule_row(rule) for rule in rules],
        "rewards": [_reward_row(reward) for reward in rewards if not reward.archived],
        "reward_types": _options(REWARD_TYPE_LABELS),
        "tiers": [_tier_row(tier) for tier in tiers],
        "wheel": {
            **await wheel_settings(session, scope),
            "prize_types": _options(WHEEL_PRIZE_TYPE_LABELS),
            "submenu_labels": SUBMENU_LABELS,
        },
        "referral": await referral_editor(session, staff, scope),
    }
