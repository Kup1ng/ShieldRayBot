"""Data for the React catalog-discount, gift-code and message-variable pages.

Read-only and shaped for the screen. The caller's dependency decides who may open each page; the
scope helpers used here (``discount_scope``, ``gift_code_scope``) decide whose rows are read.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ChargeCode
from app.services.catalog_discounts import MODES, SCOPES, discount_dashboard, new_request_key
from app.services.gift_codes import (
    GIFT_CODE_LIST_LIMIT,
    MAX_AMOUNT,
    MAX_USES,
    PURCHASE_TYPES,
    code_plan_ids,
    describe_code,
    gift_code_plan_options,
    gift_code_scope,
    list_gift_codes,
)
from app.services.marketing_nav import marketing_sections
from app.services.message_variables import catalog_groups
from app.services.platform_identity import is_explicit_owner_staff
from app.services.resellers import RESELLER_SETTINGS_TABS
from app.services.settings_tab_groups import (
    MESSAGE_VARIABLES_TAB_KEY,
    group_settings_tabs,
    tabs_with_message_variables,
)
from app.services.settings_form_payload import listed_tabs
from app.services.users import SETTINGS_TABS


def marketing_tabs(staff: dict, active: str) -> list[dict[str, Any]]:
    """The shared marketing tab strip; sections the staff member cannot open are never listed."""
    return [
        {"key": s.key, "label": s.label, "href": s.href, "active": s.key == active}
        for s in marketing_sections(staff)
    ]


def _options(mapping: dict[str, str]) -> list[dict[str, str]]:
    return [{"key": key, "label": label} for key, label in mapping.items()]


async def discounts_payload(session: AsyncSession, staff: dict, *, before: int | None) -> dict[str, Any]:
    """Discount history (50 per page) plus the targets the create form can pick."""
    data = await discount_dashboard(session, staff, before=before)
    return {
        "scopes": _options(SCOPES),
        "modes": _options(MODES),
        "rows": [
            {
                "id": row.id,
                "title": row.title,
                "scope": row.scope,
                "mode": row.mode,
                "reduction_kind": row.reduction_kind,
                "reduction_value": row.reduction_value,
                "ends_at": data.deadlines.get(row.id) if row.ends_at else None,
                "is_active": bool(row.is_active),
                "has_announcement": row.campaign_id is not None,
                "announcement": data.announcement_status.get(row.campaign_id) if row.campaign_id else None,
            }
            for row in data.discounts
        ],
        "plans": [{"id": p.id, "name": p.name} for p in data.plans],
        "categories": [{"id": c.id, "name": c.name} for c in data.categories],
        "next_before": data.next_before,
        "request_key": new_request_key(),
        "tabs": marketing_tabs(staff, "discounts"),
    }


def serialize_gift_code(code: ChargeCode) -> dict[str, Any]:
    detail = describe_code(code)
    return {
        "id": code.id,
        "code": code.code,
        "kind": code.kind,
        "amount": code.amount,
        "percent": code.percent,
        "max_discount_toman": code.max_discount_toman,
        "max_uses": code.max_uses,
        "max_uses_per_user": code.max_uses_per_user,
        "used_count": code.used_count,
        "first_purchase_only": bool(code.first_purchase_only),
        "purchase_types": [key for key in (code.purchase_types or "").split(",") if key in PURCHASE_TYPES],
        "purchase_label": detail["purchase_label"],
        "note": code.note or "",
        "is_active": bool(code.is_active),
        "state": detail["state"],
        "expiry_input": detail["expiry_input"],
        "expiry_label": detail["expiry_label"],
        "plan_ids": sorted(code_plan_ids(code)),
    }


async def gift_codes_payload(session: AsyncSession, staff: dict) -> dict[str, Any]:
    """The staff member's own shop codes, newest first and bounded. Raises ``PermissionError``."""
    shop_id = gift_code_scope(staff)
    codes = await list_gift_codes(session, shop_id=shop_id)
    # The plans a code may be limited to: this shop's own, never another shop's.
    plans = await gift_code_plan_options(session, shop_id=shop_id)
    return {
        "codes": [serialize_gift_code(c) for c in codes],
        "plans": [{"id": plan_id, "name": name, "active": active} for plan_id, name, active in plans],
        "purchase_types": _options(PURCHASE_TYPES),
        "limits": {"max_amount": MAX_AMOUNT, "max_uses": MAX_USES, "list_limit": GIFT_CODE_LIST_LIMIT},
        "tabs": marketing_tabs(staff, "gift_codes"),
    }


def message_variables_payload(staff: dict) -> dict[str, Any]:
    """The placeholder catalog; Owner-only variables are hidden from everyone else."""
    is_owner = is_explicit_owner_staff(staff) or bool(staff.get("web_owner"))
    settings_base = "/settings" if is_owner or staff.get("role") == "admin" else "/shop-settings"
    tabs = SETTINGS_TABS if settings_base == "/settings" else RESELLER_SETTINGS_TABS
    groups = group_settings_tabs(tabs_with_message_variables(tabs, staff), MESSAGE_VARIABLES_TAB_KEY)
    return {
        "title": "تنظیمات ربات" if settings_base == "/settings" else "تنظیمات فروشگاه",
        "settings_base": settings_base,
        "groups": catalog_groups(include_owner_only=is_owner, settings_base=settings_base),
        "tab_groups": [
            {
                "key": group.key,
                "label": group.label,
                "is_active": group.is_active,
                "tabs": [
                    {
                        "key": tab.key,
                        "label": tab.label,
                        "href": tab.href or f"{settings_base}?tab={tab.key}",
                        "active": tab.key == MESSAGE_VARIABLES_TAB_KEY,
                    }
                    for tab in listed_tabs(group)
                ],
            }
            for group in groups
        ],
    }
