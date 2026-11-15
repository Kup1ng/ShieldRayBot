"""Data of «اشتراک من», the shop owner's own package screen, for the React panel.

The shop is always the signed-in owner's own; the screen never takes a shop id from the request.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.models import BotUser, ResellerProfile
from app.services.formatting import format_bytes
from app.services.redact import user_safe_error
from app.services.reseller_capacity import (
    ALLOWED_EXTRA_GB,
    ALLOWED_EXTRA_USERS,
    plan_allows_buy_extra,
    plan_extra_gb_price,
    plan_extra_user_price,
)
from app.services.reseller_package import PackageChoice, PackageOverview, package_overview

OWNER_ONLY = "این بخش فقط برای مالک فروشگاه است"
UNAVAILABLE_FALLBACK = "اشتراک این فروشگاه در دسترس نیست"


async def owner_shop_context(session: AsyncSession, staff: dict) -> tuple[BotUser, ResellerProfile]:
    """The shop owner's account and profile; staff sessions and other roles raise ``PermissionError``."""
    if staff.get("role") != "reseller" or not staff.get("bot_user_id"):
        raise PermissionError(OWNER_ONLY)
    owner_id = int(staff["bot_user_id"])
    profile = await session.scalar(select(ResellerProfile).where(ResellerProfile.user_id == owner_id))
    owner = await session.get(BotUser, owner_id)
    if profile is None or owner is None:
        raise PermissionError(OWNER_ONLY)
    return owner, profile


def _choice(choice: PackageChoice) -> dict[str, Any]:
    plan = choice.plan
    return {
        "plan_id": int(plan.id),
        "name": plan.name,
        "users": int(plan.included_users or 0),
        "gb": int(plan.included_gb or 0),
        "duration_days": int(plan.duration_days or 0),
        "price": int(choice.invoice["total"]),
        "relation": choice.relation,
        "label": choice.label,
        "blocked": choice.blocked,
    }


def _overview(overview: PackageOverview) -> dict[str, Any]:
    sub, usage = overview.sub, overview.usage
    return {
        "current_name": overview.current.name if overview.current else None,
        "expires_at": overview.expires_at_iso,
        "users_total": (int(sub.base_users or 0) + int(sub.extra_users_purchased or 0)) if sub else 0,
        "gb_total": (int(sub.base_gb or 0) + int(sub.extra_gb_purchased or 0)) if sub else 0,
        "users_used": usage.users if usage else None,
        "traffic_used_text": format_bytes(usage.used_bytes) if usage else None,
        "generation": overview.generation,
        "choices": [_choice(choice) for choice in overview.choices],
    }


def _extras(overview: PackageOverview) -> dict[str, Any] | None:
    if not plan_allows_buy_extra(overview.current):
        return None
    return {
        "gb_price": plan_extra_gb_price(overview.current),
        "user_price": plan_extra_user_price(overview.current),
        "gb_options": sorted(ALLOWED_EXTRA_GB),
        "user_options": sorted(ALLOWED_EXTRA_USERS),
    }


async def subscription_payload(session: AsyncSession, staff: dict) -> dict[str, Any]:
    """The owner's package, the packages it can renew into, the extras on offer and the wallet that pays."""
    owner, profile = await owner_shop_context(session, staff)
    payload: dict[str, Any] = {
        "wallet": int(owner.wallet_balance or 0),
        "bot_username": (get_settings().bot_username or "").lstrip("@"),
        "unavailable": "",
        "overview": None,
        "extras": None,
    }
    try:
        overview = await package_overview(session, profile)
    except ValueError as exc:
        payload["unavailable"] = user_safe_error(exc, fallback=UNAVAILABLE_FALLBACK)
        return payload
    payload["overview"] = _overview(overview)
    payload["extras"] = _extras(overview)
    return payload
