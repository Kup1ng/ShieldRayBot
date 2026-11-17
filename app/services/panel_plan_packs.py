"""Pack editors of the React plan forms: a plan's current pack rows and the limits the editors enforce.

Reseller packs (extra volume / users) belong to one ``ResellerPlan``; customer packs (volume /
months) belong to one sales ``Plan`` of one shop. Reads are scoped by the plan the caller has
already proved they may open, so a pack of another plan or another shop never appears.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Plan, ServiceAddonPack
from app.services.button_styles import plan_button_style_form_value
from app.services.reseller_plan_extra_packs import (
    DEFAULT_EXTRA_GB_AMOUNTS,
    DEFAULT_EXTRA_USER_AMOUNTS,
    KIND_GB,
    KIND_USERS,
    MAX_PACK_AMOUNT_GB,
    MAX_PACK_AMOUNT_USERS,
    MAX_PACKS_PER_KIND,
    list_packs,
)
from app.services.service_addons import (
    KIND_DURATION,
    KIND_VOLUME,
    MAX_DURATION_DAYS,
    MAX_EXTRA_MONTHS,
    MAX_PACK_ROWS,
    MAX_PLAN_SCOPED_PACKS_PER_KIND,
    MAX_VOLUME_GB,
    plan_duration_months_for_form,
)

# The stairs a new customer plan starts with when extra sales are switched on.
DEFAULT_USER_VOLUME_GB: tuple[int, ...] = (1, 5, 10, 50)
DEFAULT_USER_DURATION_MONTHS: tuple[int, ...] = (1, 3, 6, 12)
# A plan never holds more rows than this per kind, so one query bounds the whole editor.
_PLAN_ROW_LIMIT = 2 * max(MAX_PLAN_SCOPED_PACKS_PER_KIND, MAX_PACKS_PER_KIND) + 20


def _row(amount: int, stored_style: str | None) -> dict[str, Any]:
    """One editor line; the colour is the form value (``inherit`` for none)."""
    return {"amount": int(amount), "button_style": plan_button_style_form_value(stored_style)}


def reseller_pack_config() -> dict[str, Any]:
    """Defaults and limits of the reseller extra-pack editor (Owner pages only)."""
    return {
        "max_per_kind": MAX_PACKS_PER_KIND,
        KIND_GB: {"defaults": list(DEFAULT_EXTRA_GB_AMOUNTS), "max": MAX_PACK_AMOUNT_GB},
        KIND_USERS: {"defaults": list(DEFAULT_EXTRA_USER_AMOUNTS), "max": MAX_PACK_AMOUNT_USERS},
    }


def user_pack_config() -> dict[str, Any]:
    """Defaults and limits of the customer add-on pack editor."""
    return {
        "max_per_kind": MAX_PLAN_SCOPED_PACKS_PER_KIND,
        # The general «بسته حجم / زمان» form: rows per save, and the largest volume (GB) / duration (days).
        "batch": {"max_rows": MAX_PACK_ROWS, "max_volume_gb": int(MAX_VOLUME_GB), "max_days": MAX_DURATION_DAYS},
        KIND_VOLUME: {"defaults": list(DEFAULT_USER_VOLUME_GB), "max": int(MAX_VOLUME_GB)},
        KIND_DURATION: {"defaults": list(DEFAULT_USER_DURATION_MONTHS), "max": MAX_EXTRA_MONTHS},
    }


async def reseller_plan_packs(session: AsyncSession, plan_id: int) -> dict[str, list[dict[str, Any]]]:
    """Active extra-volume and extra-user stairs of one reseller package."""
    rows = await list_packs(session, int(plan_id), active_only=True)
    return {
        KIND_GB: [_row(p.amount, p.button_style) for p in rows if p.kind == KIND_GB],
        KIND_USERS: [_row(p.amount, p.button_style) for p in rows if p.kind == KIND_USERS],
    }


async def user_plan_packs(session: AsyncSession, plan: Plan) -> dict[str, list[dict[str, Any]]]:
    """Volume (GB) and duration (months) stairs of one sales plan, scoped to the plan's own shop."""
    owner_id = plan.owner_reseller_id
    owner_clause = ServiceAddonPack.owner_reseller_id.is_(None) if owner_id is None else ServiceAddonPack.owner_reseller_id == int(owner_id)
    rows = list(
        await session.scalars(
            select(ServiceAddonPack)
            .where(ServiceAddonPack.plan_id == int(plan.id), owner_clause)
            .order_by(ServiceAddonPack.kind, ServiceAddonPack.sort_order, ServiceAddonPack.id)
            .limit(_PLAN_ROW_LIMIT)
        )
    )
    return {
        KIND_VOLUME: [_row(int(p.amount), p.button_style) for p in rows if p.kind == KIND_VOLUME],
        KIND_DURATION: [_row(plan_duration_months_for_form(p), p.button_style) for p in rows if p.kind == KIND_DURATION],
    }
