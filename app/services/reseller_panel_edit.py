"""Data of the reseller edit screen for the React panel (profile, panel limits, capacity, wallet, PAYG ledger).

Only the platform owner opens it. Passwords, API keys and hashes are never returned: the screen
learns that a panel API key is stored (a flag), never its value.
"""

from __future__ import annotations

import logging
import secrets
from collections.abc import Mapping
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import BotUser, ResellerPlan, ResellerProfile
from app.services.authz import resolve_shop_permissions_from_profile
from app.services.billing import (
    ensure_payg_shop_wallet,
    is_payg,
    list_billing_transactions,
    rate_context_for_profile,
    resolve_price_per_gb,
)
from app.services.billing_suspend import min_topup_to_unsuspend, restore_payg_reseller
from app.services.bot_user_admin import list_wallet_txs
from app.services.color_tags import color_tags_for_ui, normalize_color_tag
from app.services.formatting import format_bytes, format_expire_short
from app.services.miniapp_shop import shop_miniapp_state
from app.services.org_principals import get_principal_by_reseller_profile
from app.services.pasarguard import get_pg
from app.services.pg_admin_subscription import get_subscription, is_current_capacity_plan
from app.services.pg_overview import build_reseller_pg_overview
from app.services.reseller_capacity_view import allocation_view_for_shop, build_capacity_view, live_capacity_from_overview
from app.services.resellers import FEATURE_PERMS

logger = logging.getLogger(__name__)

LEDGER_LIMIT = 15
NONCE_BYTES = 8
METER_KEYS = ("has_limit", "pct", "remain_pct", "tone", "exhausted", "used_text", "limit_text", "remain_text", "ratio_text")
ALLOCATION_TEXT_KEYS = (
    "alloc_ratio_text",
    "alloc_external_text",
    "alloc_children_text",
    "alloc_expired_held_text",
    "alloc_is_oversold",
    "alloc_external_stale",
)


def _meter(raw: Mapping[str, Any] | None) -> dict[str, Any] | None:
    return {key: raw.get(key) for key in METER_KEYS} if raw else None


def _limits(overview: Mapping[str, Any] | None) -> dict[str, Any] | None:
    if not overview:
        return None
    return {
        "username": overview.get("username"),
        "status_label": overview.get("status_label"),
        "status_badge": overview.get("status_badge"),
        "role_name": overview.get("role_name"),
        "users": _meter(overview.get("users")),
        "traffic": _meter(overview.get("traffic")),
        "lifetime_text": overview.get("lifetime_text"),
    }


def _subscription(view: Mapping[str, Any], expires_text: str | None) -> dict[str, Any]:
    data = {
        "expires_at": expires_text,
        "total_gb_text": view["total_gb_text"],
        "extra_gb_text": view["extra_gb_text"],
        "total_users_text": view["total_users_text"],
        "extra_users_text": view["extra_users_text"],
        "live_gb_text": view["live_gb_text"],
        "live_users_text": view["live_users_text"],
        "differs": view["differs"],
        "can_sync": view["can_sync"],
        "alloc_uncapped_children": [
            {"shop_id": int(child.shop_id), "pg_username": child.pg_username} for child in view.get("alloc_uncapped_children") or []
        ],
        "alloc_unlimited": [
            {"id": int(item.get("id") or 0), "pg_username": str(item.get("pg_username") or ""), "kind": str(item.get("kind") or "")}
            for item in view.get("alloc_unlimited") or []
        ],
    }
    for key in ALLOCATION_TEXT_KEYS:
        data[key] = view.get(key)
    return data


def _ledger_rows(rows: list[Any], *, billing: bool) -> list[dict[str, Any]]:
    return [
        {
            "id": int(tx.id),
            "amount": int(tx.amount),
            "balance_after": int(tx.balance_after),
            "label": tx.kind if billing else tx.reason,
            "note": tx.note if billing else None,
        }
        for tx in rows
    ]


async def _roles() -> list[dict[str, Any]]:
    try:
        roles = await get_pg().get_admin_roles()
    except Exception:  # the form still opens; the role list is empty while the panel is unreachable
        logger.warning("panel roles unavailable for the reseller edit screen", exc_info=True)
        return []
    return [
        {"id": int(role["id"]), "name": str(role.get("name") or role["id"])}
        for role in roles or []
        if isinstance(role, dict) and role.get("id") is not None
    ]


async def _payg_block(session: AsyncSession, user: BotUser, profile: ResellerProfile) -> dict[str, Any]:
    """Wallet link, ledgers and rate of a PAYG shop; the first view links the old billing pot to the wallet."""
    was_linked = bool(profile.payg_wallet_linked)
    await ensure_payg_shop_wallet(session, profile)
    await session.refresh(user)
    balance = int(user.wallet_balance or 0)
    if not was_linked and balance > 0 and profile.billing_suspended_at is not None:
        try:
            await restore_payg_reseller(session, profile, commit=True)
        except Exception:  # lifting an old suspend is a courtesy; the screen shows the state as it is
            logger.warning("PAYG restore on first view failed", exc_info=True)
    else:
        await session.commit()
    billing_txs = await list_billing_transactions(session, int(user.id), limit=LEDGER_LIMIT)
    # The PAYG billing pot is the platform purse (shop_id None).
    wallet_txs = await list_wallet_txs(session, int(user.id), limit=LEDGER_LIMIT, shop_id=None)
    rate = await resolve_price_per_gb(session, rate_context_for_profile(profile))
    min_unsuspend = await min_topup_to_unsuspend(session) if profile.billing_suspended_at is not None else 0
    return {
        "balance": balance,
        "rate_per_gb": rate,
        "min_unsuspend": min_unsuspend,
        "billing_txs": _ledger_rows(billing_txs, billing=True),
        "wallet_txs": _ledger_rows(wallet_txs, billing=False),
    }


async def _pg_limits(session: AsyncSession, staff: dict, profile: ResellerProfile) -> dict[str, Any] | None:
    if not profile.pg_admin_username:
        return None
    view = dict(staff)
    view["pg_admin_username"] = profile.pg_admin_username
    view["pg_role_id"] = profile.pg_role_id
    try:
        overview = await build_reseller_pg_overview(view, session=session)
    except Exception:  # the screen still opens without the limits block
        logger.warning("panel limits unavailable for shop %s", profile.id, exc_info=True)
        return None
    return overview if overview.get("ready") else None


async def _capacity(session: AsyncSession, profile: ResellerProfile, overview: dict[str, Any] | None) -> dict[str, Any] | None:
    if not profile.pg_admin_username:
        return None
    sub = await get_subscription(session, profile.pg_admin_username)
    if sub is None:
        return None
    plan = await session.get(ResellerPlan, int(sub.plan_id)) if sub.plan_id else None
    view = build_capacity_view(
        sub,
        current_capacity=is_current_capacity_plan(plan),
        live=live_capacity_from_overview(overview),
        allocation=await allocation_view_for_shop(session, int(profile.user_id)),
    )
    return _subscription(view, format_expire_short(sub.expires_at) if sub.expires_at else None)


async def _api_key_stored(session: AsyncSession, profile: ResellerProfile) -> bool:
    if (profile.pg_api_key_enc or "").strip():
        return True
    linked = await get_principal_by_reseller_profile(session, int(profile.id))
    return linked is not None and bool((linked.pg_api_key_enc or "").strip())


def _profile_block(profile: ResellerProfile) -> dict[str, Any]:
    return {
        "billing_mode": profile.billing_mode or "fixed",
        "pg_admin_username": profile.pg_admin_username,
        "pg_role_id": profile.pg_role_id,
        "web_username": profile.web_username,
        "bot_username": profile.bot_username,
        "bot_admin_ids": profile.bot_admin_ids or "",
        "is_active": bool(profile.is_active),
        "share_pg_panel_url": bool(profile.share_pg_panel_url),
        "allow_volume_oversell": bool(profile.allow_volume_oversell),
        "billing_suspended": profile.billing_suspended_at is not None,
        "watermark_text": format_bytes(int(profile.billing_watermark_bytes or 0)),
    }


async def load_shop(session: AsyncSession, user_id: int) -> tuple[BotUser, ResellerProfile] | None:
    user = await session.get(BotUser, user_id)
    profile = (await session.execute(select(ResellerProfile).where(ResellerProfile.user_id == user_id))).scalar_one_or_none()
    return (user, profile) if user is not None and profile is not None else None


async def edit_payload(
    session: AsyncSession,
    staff: dict,
    user_id: int,
    *,
    owner_can_toggle_oversell: bool,
    miniapp_status_text: Mapping[str, str],
) -> dict[str, Any] | None:
    """Everything the edit screen shows for one shop owner; ``None`` when there is no such shop."""
    shop = await load_shop(session, user_id)
    if shop is None:
        return None
    user, profile = shop
    payg = is_payg(profile)
    wallet = await _payg_block(session, user, profile) if payg else None
    overview = await _pg_limits(session, staff, profile)
    return {
        "user": {
            "id": int(user.id),
            "name": user.full_name or user.username or "",
            "telegram_id": user.telegram_id,
            "role": user.role,
            "wallet_balance": int(user.wallet_balance or 0),
            "color_tag": normalize_color_tag(user.color_tag),
        },
        "profile": _profile_block(profile),
        "roles": await _roles(),
        "feature_perms": [{"key": key, "label": label} for key, label in FEATURE_PERMS],
        "selected_perms": list(resolve_shop_permissions_from_profile(profile) or []),
        "miniapp_status": miniapp_status_text[await shop_miniapp_state(session, profile)],
        "color_tags": [{"key": tag["key"], "title": tag["title_fa"]} for tag in color_tags_for_ui()],
        "is_payg": payg,
        "payg": wallet,
        "pg_limits": _limits(overview),
        "pg_subscription": await _capacity(session, profile, overview),
        "pg_api_key_stored": await _api_key_stored(session, profile),
        "topup_nonce": secrets.token_hex(NONCE_BYTES),
        "can_toggle_oversell": owner_can_toggle_oversell,
    }
