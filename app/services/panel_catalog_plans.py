"""Data for the React Plans pages: the plan catalog, the plan edit forms and their options.

Everything here is read-only and shaped for the screen: explicit fields, never an ORM dump and
never a setting the screen does not show. Shop scope and permissions are decided by the caller's
dependency (``require_perm("plans")`` / ``require_admin``) and by the scoped service calls used
below, exactly as the server-rendered pages did.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Plan, PlanCategory, ResellerPlan, ServiceAddonPack
from app.services.button_styles import (
    CATEGORY_BUTTON_STYLE_OPTIONS,
    ITEM_BUTTON_STYLE_OPTIONS,
    PLAN_BUTTON_STYLE_OPTIONS,
    plan_button_style_form_value,
)
from app.services.panel_catalog_board import empty_board, plan_board_payload
from app.services.panel_plan_packs import (
    reseller_pack_config,
    reseller_plan_packs,
    user_pack_config,
    user_plan_packs,
)
from app.services.plan_category_board import DEFAULT_TONE, category_tones
from app.services.pg_quota import limit_snapshot_cards, load_staff_limit_snapshot
from app.services.plans_catalog import (
    catalog_owner_id,
    custom_range_limit_issue,
    list_catalog_plans,
    load_pg_plan_options,
    plan_limit_issue,
    staff_can_create_pg_template,
)
from app.services.shop_scope import is_platform_admin
from app.services.users import get_all_settings

logger = logging.getLogger(__name__)

TRUE_VALUES = frozenset({"1", "true", "yes", "on"})
ADDON_PLAN_KINDS = frozenset({"addon_volume", "addon_users"})
DEFAULT_WHOLESALE_TIERS = [{"min": 5, "percent": 10}, {"min": 20, "percent": 20}]
DEFAULT_NAMING = {"prefix": "clk", "suffix": "", "pattern": "{prefix}_{random}{suffix}"}
RESELLER_PLANS_LOAD_ERROR = "بارگذاری پلن‌های نمایندگی ناموفق بود — پس از به‌روزرسانی، سرویس را یک‌بار ری‌استارت کنید."
CUSTOM_PLAN_INVALID = "تنظیمات پلن دلخواه نامعتبر است"
SECONDS_PER_DAY = 86400


def _is_on(value: Any) -> bool:
    return str(value or "").strip().lower() in TRUE_VALUES


def style_options(options: list[tuple[str, str, str]]) -> list[dict[str, str]]:
    return [{"value": value, "label": label, "tone": tone} for value, label, tone in options]


def pg_option_rows(rows: list[dict] | None) -> list[dict[str, Any]]:
    """Only the id and name of PasarGuard templates, groups and roles reach the screen."""
    return [
        {"id": row.get("id"), "name": str(row.get("name") or "")}
        for row in rows or []
        if isinstance(row, dict) and row.get("id") is not None
    ]


def limit_payload(snapshot: dict[str, Any] | None) -> dict[str, Any]:
    """The live PasarGuard limits the plan forms quote next to their fields."""
    from app.services.formatting import format_bytes

    snap = snapshot or {}
    restricted = bool(snap.get("restricted"))
    per_data = snap.get("per_user_data_max") if restricted else None
    per_expire = snap.get("per_user_expire_max") if restricted else None
    account = snap.get("account_data_limit") if restricted else None
    max_users = snap.get("max_users") if restricted else None
    return {
        "cards": limit_snapshot_cards(snap),
        "per_user_data_max_text": format_bytes(per_data) if per_data else None,
        "per_user_expire_max_days": max(1, int(per_expire) // SECONDS_PER_DAY) if per_expire else None,
        "account_data_limit_text": format_bytes(account) if account else None,
        "max_users": int(max_users) if max_users else None,
    }


def _live_template_ids(templates: list[dict] | None) -> set[int]:
    ids: set[int] = set()
    for template in templates or []:
        try:
            ids.add(int(template["id"]))
        except (KeyError, TypeError, ValueError):
            continue
    return ids


def _id_list(raw: str | None) -> list[str]:
    return [part.strip() for part in (raw or "").split(",") if part.strip()]


def _category_name(category_map: dict[int, PlanCategory], category_id: int | None) -> str | None:
    cat = category_map.get(int(category_id)) if category_id else None
    return cat.name if cat else None


def serialize_plan(
    plan: Plan,
    *,
    category_map: dict[int, PlanCategory],
    live_template_ids: set[int],
    limit_issue: str | None,
) -> dict[str, Any]:
    template_missing = bool(plan.pg_template_id and int(plan.pg_template_id) not in live_template_ids)
    return {
        "id": plan.id,
        "name": plan.name,
        "price": plan.price,
        "duration_days": plan.duration_days,
        "data_limit_gb": plan.data_limit_gb,
        "pg_template_id": plan.pg_template_id,
        "pg_group_ids": plan.pg_group_ids or None,
        "category_id": plan.category_id,
        "category_name": _category_name(category_map, plan.category_id),
        "is_active": bool(plan.is_active),
        "template_missing": template_missing,
        "source_empty": not plan.pg_template_id and not plan.pg_group_ids,
        "limit_issue": limit_issue,
    }


def serialize_trial(trial: Plan | None, *, enabled: bool, limit_issue: str | None) -> dict[str, Any]:
    return {
        "exists": trial is not None,
        "enabled": enabled,
        "name": trial.name if trial else "تست رایگان",
        "duration_days": trial.duration_days if trial else 1,
        "data_limit_gb": trial.data_limit_gb if trial else None,
        "pg_template_id": trial.pg_template_id if trial else None,
        "pg_group_ids": _id_list(trial.pg_group_ids) if trial else [],
        "naming": _naming(trial.pg_username_prefix, trial.pg_username_suffix, trial.pg_username_pattern) if trial else _naming("", "", ""),
        "button_style": plan_button_style_form_value(trial.button_style) if trial else "inherit",
        "limit_issue": limit_issue,
    }


def _naming(prefix: str | None, suffix: str | None, pattern: str | None) -> dict[str, str]:
    return {"prefix": prefix or "", "suffix": suffix or "", "pattern": pattern or ""}


def serialize_custom(values: dict[str, str], *, limit_issue: str | None) -> dict[str, Any]:
    # The form stores «inherit» as an empty value, so only a real colour is an override.
    raw_style = values.get("custom_plan_button_style")
    style = raw_style if raw_style in {"primary", "success", "danger"} else "inherit"
    return {
        "enabled": _is_on(values.get("custom_plan_enabled")),
        "price_per_gb": values.get("custom_plan_price_per_gb", "1000"),
        "price_per_day": values.get("custom_plan_price_per_day", "500"),
        "min_gb": values.get("custom_plan_min_gb", "1"),
        "max_gb": values.get("custom_plan_max_gb", "500"),
        "min_days": values.get("custom_plan_min_days", "1"),
        "max_days": values.get("custom_plan_max_days", "365"),
        "template_id": values.get("custom_plan_template_id") or None,
        "group_ids": _id_list(values.get("custom_plan_group_ids")),
        "naming": _naming(
            values.get("custom_plan_username_prefix"),
            values.get("custom_plan_username_suffix"),
            values.get("custom_plan_username_pattern"),
        ),
        "button_style": style,
        "limit_issue": limit_issue,
    }


def parse_wholesale_tiers(raw: str | None) -> list[dict[str, int]]:
    """Stored tiers as ``[{min, percent}]``; an empty or broken value falls back to the defaults."""
    try:
        data = json.loads(raw or "[]")
    except (TypeError, ValueError):
        data = []
    tiers: list[dict[str, int]] = []
    for item in data if isinstance(data, list) else []:
        try:
            tiers.append({"min": int(item["min"]), "percent": int(item["percent"])})
        except (KeyError, TypeError, ValueError):
            continue
    return tiers or [dict(t) for t in DEFAULT_WHOLESALE_TIERS]


def serialize_wholesale(values: dict[str, str]) -> dict[str, Any]:
    return {
        "enabled": _is_on(values.get("wholesale_enabled")),
        "min_qty": values.get("wholesale_min_qty", "5"),
        "max_qty": values.get("wholesale_max_qty", "20"),
        "button_text": values.get("btn_wholesale", "📦 فروش عمده"),
        "tiers": parse_wholesale_tiers(values.get("wholesale_tiers")),
    }


def serialize_category(cat: PlanCategory, *, linked_plans: list[str], linked_packs: list[str], tone: str = DEFAULT_TONE) -> dict[str, Any]:
    return {
        "id": cat.id,
        "name": cat.name,
        "description": cat.description or "",
        "audience": cat.audience or "users",
        "sort_order": cat.sort_order,
        "is_active": bool(cat.is_active),
        "button_style": "inherit" if cat.button_style is None else cat.button_style,
        "tone": tone,
        "linked_plans": linked_plans,
        "linked_packs": linked_packs,
    }


def plan_form_categories(
    categories: list[PlanCategory], current_id: int | None, tones: dict[int, str]
) -> list[dict[str, Any]]:
    """The categories a plan form offers: the user ones that are on, plus the plan's own even when it is off."""
    return [
        {"id": c.id, "name": c.name, "is_active": bool(c.is_active), "tone": tones.get(int(c.id), DEFAULT_TONE)}
        for c in categories
        if ((c.audience or "users") == "users" and c.is_active) or c.id == current_id
    ]


def serialize_pack(pack: ServiceAddonPack, *, category_map: dict[int, PlanCategory]) -> dict[str, Any]:
    return {
        "id": pack.id,
        "name": pack.name,
        "description": pack.description or "",
        "kind": pack.kind,
        "amount": pack.amount,
        "price": pack.price,
        "sort_order": pack.sort_order,
        "is_active": bool(pack.is_active),
        "is_general": bool(pack.is_general),
        "category_id": pack.category_id,
        "category_name": _category_name(category_map, pack.category_id),
    }


def reseller_plan_group(plan: ResellerPlan) -> str:
    if plan.plan_kind in ADDON_PLAN_KINDS:
        return "addon"
    return "payg" if plan.billing_mode == "payg" else "fixed"


def serialize_reseller_plan(plan: ResellerPlan, *, category_map: dict[int, PlanCategory]) -> dict[str, Any]:
    return {
        "id": plan.id,
        "group": reseller_plan_group(plan),
        "name": plan.name,
        "description": plan.description or "",
        "price": plan.price,
        "plan_kind": plan.plan_kind or "subscription",
        "billing_mode": plan.billing_mode or "fixed",
        "price_per_gb": plan.price_per_gb or 0,
        "pg_group_ids": plan.pg_group_ids or None,
        "addon_gb": plan.addon_gb or 0,
        "addon_users": plan.addon_users or 0,
        "is_system": bool(plan.is_system) or (plan.plan_kind or "") == "current_capacity",
        "is_active": bool(plan.is_active),
        "category_id": plan.category_id,
        "category_name": _category_name(category_map, plan.category_id),
    }


async def _plan_limit_issues(staff: dict, plans: list[Plan], session: AsyncSession) -> dict[int, str]:
    issues: dict[int, str] = {}
    for plan in plans:
        issue = await plan_limit_issue(staff, plan, session=session)
        if issue:
            issues[int(plan.id)] = issue
    return issues


def _custom_limit_message(values: dict[str, str], snapshot: dict[str, Any]) -> str | None:
    try:
        return custom_range_limit_issue(
            min_gb=float(values.get("custom_plan_min_gb") or 1),
            max_gb=float(values.get("custom_plan_max_gb") or 500),
            min_days=int(float(values.get("custom_plan_min_days") or 1)),
            max_days=int(float(values.get("custom_plan_max_days") or 365)),
            snapshot=snapshot,
        )
    except (TypeError, ValueError):
        return CUSTOM_PLAN_INVALID


async def _shop_settings(session: AsyncSession, staff: dict) -> dict[str, str]:
    """Settings of the staff's own catalog; a non-Owner without a shop never reads platform settings."""
    owner_id = catalog_owner_id(staff)
    if not is_platform_admin(staff) and not owner_id:
        return {}
    return await get_all_settings(session, reseller_id=owner_id)


async def _reseller_plan_section(session: AsyncSession) -> tuple[list[ResellerPlan], str | None]:
    from app.services.resellers import ensure_current_capacity_reseller_plan, list_reseller_plans

    try:
        await ensure_current_capacity_reseller_plan(session)
        await session.commit()
    except Exception:
        logger.exception("ensure current_capacity plan failed on /plans")
        try:
            await session.rollback()
        except Exception:
            logger.debug("plans overview: rollback ignored", exc_info=True)
    try:
        return await list_reseller_plans(session), None
    except Exception:
        # An additive column missing before the migration must not hide the user catalog.
        logger.exception("list_reseller_plans failed on /plans")
        return [], RESELLER_PLANS_LOAD_ERROR


async def _pg_roles() -> list[dict[str, Any]]:
    from app.services.pasarguard import get_pg

    try:
        return pg_option_rows(await get_pg().get_admin_roles())
    except Exception:
        logger.debug("pg roles unavailable", exc_info=True)
        return []


async def _label_data(
    session: AsyncSession, staff: dict, sale_plans: list[Plan], reseller_plans: list[ResellerPlan], ui: dict[str, str]
) -> dict[str, Any]:
    """Categories, the grouped plan board, add-on packs and the maps that label plans with them."""
    out: dict[str, Any] = {"categories": [], "board": empty_board(), "packs": [], "plan_map": {}, "reseller_map": {}}
    if not (is_platform_admin(staff) or catalog_owner_id(staff)):
        return out
    try:
        from app.services.plan_categories import category_map_for_plans, category_plans_map, list_categories
        from app.services.service_addons import list_packs

        categories = await list_categories(session, staff)
        plan_map = await category_map_for_plans(session, staff, sale_plans)
        reseller_map = await category_map_for_plans(session, staff, reseller_plans) if reseller_plans else {}
        linked = await category_plans_map(session, staff, categories)
        packs = await list_packs(session, staff)
        if packs:
            plan_map.update(await category_map_for_plans(session, staff, packs))
        tones = category_tones(categories, ui)
        out.update(
            categories=[
                serialize_category(
                    c,
                    linked_plans=linked.get(int(c.id)) or [],
                    linked_packs=[p.name for p in packs if p.category_id == c.id],
                    tone=tones.get(int(c.id), DEFAULT_TONE),
                )
                for c in categories
            ],
            board=plan_board_payload(sale_plans, categories, ui=ui),
            packs=[serialize_pack(p, category_map=plan_map) for p in packs],
            plan_map=plan_map,
            reseller_map=reseller_map,
        )
    except Exception:
        logger.exception("plan categories/addons load failed on /plans")
    return out


def _pack_config(*, include_reseller: bool) -> dict[str, Any]:
    """Pack editor limits; the reseller stairs are an Owner-only feature."""
    config: dict[str, Any] = {"user": user_pack_config()}
    if include_reseller:
        config["reseller"] = reseller_pack_config()
    return config


async def plans_overview(session: AsyncSession, staff: dict) -> dict[str, Any]:
    """Everything the Plans page shows for this staff member's catalog."""
    plans = await list_catalog_plans(session, staff, include_trial=True)
    trial = next((p for p in plans if p.is_trial), None)
    sale_plans = [p for p in plans if not p.is_trial]
    templates, groups, pg_error = await load_pg_plan_options(staff, session=session)
    live_template_ids = _live_template_ids(templates)
    values = await _shop_settings(session, staff)
    snapshot = await load_staff_limit_snapshot(staff, session=session)
    issues = await _plan_limit_issues(staff, sale_plans, session)
    trial_issue = await plan_limit_issue(staff, trial, session=session) if trial else None
    custom_issue = _custom_limit_message(values, snapshot)

    is_admin = is_platform_admin(staff)
    reseller_plans: list[ResellerPlan] = []
    reseller_error: str | None = None
    feature_perms: list[list[str]] = []
    pg_roles: list[dict[str, Any]] = []
    if is_admin:
        from app.services.resellers import FEATURE_PERMS

        feature_perms = [[key, label] for key, label in FEATURE_PERMS]
        reseller_plans, reseller_error = await _reseller_plan_section(session)
        pg_roles = await _pg_roles()
    labels = await _label_data(session, staff, sale_plans, reseller_plans, values)

    return {
        "is_platform_admin": is_admin,
        "pg_error": pg_error,
        "can_create_template": staff_can_create_pg_template(staff),
        "limits": limit_payload(snapshot),
        "plans": [
            serialize_plan(p, category_map=labels["plan_map"], live_template_ids=live_template_ids, limit_issue=issues.get(int(p.id)))
            for p in sale_plans
        ],
        "trial": serialize_trial(trial, enabled=_is_on(values.get("trial_enabled")), limit_issue=trial_issue),
        "custom": serialize_custom(values, limit_issue=custom_issue),
        "wholesale": serialize_wholesale(values),
        "naming_defaults": {
            "prefix": values.get("pg_username_prefix", DEFAULT_NAMING["prefix"]),
            "suffix": values.get("pg_username_suffix", DEFAULT_NAMING["suffix"]),
            "pattern": values.get("pg_username_pattern", DEFAULT_NAMING["pattern"]),
        },
        "templates": pg_option_rows(templates),
        "groups": pg_option_rows(groups),
        "categories": labels["categories"],
        "plan_board": labels["board"],
        "addon_packs": labels["packs"],
        "reseller_plans": [serialize_reseller_plan(p, category_map=labels["reseller_map"]) for p in reseller_plans],
        "reseller_plans_error": reseller_error,
        "feature_perms": feature_perms,
        "pg_roles": pg_roles,
        "plan_style_options": style_options(PLAN_BUTTON_STYLE_OPTIONS),
        "category_style_options": style_options(CATEGORY_BUTTON_STYLE_OPTIONS),
        "pack_style_options": style_options(ITEM_BUTTON_STYLE_OPTIONS),
        "pack_config": _pack_config(include_reseller=is_admin),
    }


async def plan_edit_data(session: AsyncSession, staff: dict, plan: Plan) -> dict[str, Any]:
    """The edit form of one sales plan the caller already proved belongs to their shop."""
    values = await _shop_settings(session, staff)
    categories: list[PlanCategory] = []
    if is_platform_admin(staff) or catalog_owner_id(staff):
        from app.services.plan_categories import list_categories

        categories = await list_categories(session, staff, active_only=False)
    tones = category_tones(categories, values)
    templates, groups, pg_error = await load_pg_plan_options(staff, session=session)
    snapshot = await load_staff_limit_snapshot(staff, session=session)
    return {
        "plan": {
            "id": plan.id,
            "name": plan.name,
            "price": plan.price,
            "duration_days": plan.duration_days,
            "data_limit_gb": plan.data_limit_gb,
            "description": plan.description or "",
            "category_id": plan.category_id,
            "sort_order": plan.sort_order,
            "pg_template_id": plan.pg_template_id,
            "pg_group_ids": _id_list(plan.pg_group_ids),
            "naming": _naming(plan.pg_username_prefix, plan.pg_username_suffix, plan.pg_username_pattern),
            "button_style": plan_button_style_form_value(plan.button_style),
            "is_trial": bool(plan.is_trial),
            "carry_remaining_quota": bool(plan.carry_remaining_quota),
            "allow_buy_extra": bool(plan.allow_buy_extra),
            "extra_gb_price": plan.extra_gb_price or 0,
            "extra_month_price": plan.extra_month_price or 0,
        },
        "packs": await user_plan_packs(session, plan),
        "pack_style_options": style_options(ITEM_BUTTON_STYLE_OPTIONS),
        "pack_config": _pack_config(include_reseller=False),
        "pg_error": pg_error,
        "limits": limit_payload(snapshot),
        "templates": pg_option_rows(templates),
        "groups": pg_option_rows(groups),
        "categories": plan_form_categories(categories, plan.category_id, tones),
        "category_style_options": style_options(CATEGORY_BUTTON_STYLE_OPTIONS),
        "naming_defaults": {
            "prefix": values.get("pg_username_prefix", DEFAULT_NAMING["prefix"]),
            "suffix": values.get("pg_username_suffix", DEFAULT_NAMING["suffix"]),
            "pattern": values.get("pg_username_pattern", DEFAULT_NAMING["pattern"]),
        },
        "plan_style_options": style_options(PLAN_BUTTON_STYLE_OPTIONS),
    }


async def reseller_plan_edit_data(session: AsyncSession, staff: dict, plan: ResellerPlan) -> dict[str, Any]:
    """The edit form of one reseller package (Owner only)."""
    from app.services.pasarguard import get_pg
    from app.services.pg_admin_subscription import is_current_capacity_plan
    from app.services.plan_categories import AUDIENCE_RESELLERS, list_categories
    from app.services.resellers import DEFAULT_FEATURE_PERMS, FEATURE_PERMS, parse_perms, with_shop_settings

    groups: list[dict[str, Any]] = []
    try:
        groups = pg_option_rows(await get_pg().get_groups_simple())
    except Exception:
        logger.debug("pg groups unavailable", exc_info=True)
    snapshot = await load_staff_limit_snapshot(staff, session=session)
    categories = await list_categories(session, staff, audience=AUDIENCE_RESELLERS)
    selected = with_shop_settings(parse_perms(plan.web_permissions) or parse_perms(DEFAULT_FEATURE_PERMS))
    return {
        "plan": {
            "id": plan.id,
            "name": plan.name,
            "description": plan.description or "",
            "price": plan.price,
            "plan_kind": plan.plan_kind or "subscription",
            "billing_mode": plan.billing_mode or "fixed",
            "price_per_gb": plan.price_per_gb or 0,
            "sort_order": plan.sort_order,
            "category_id": plan.category_id,
            "duration_days": plan.duration_days or 0,
            "included_gb": plan.included_gb or 0,
            "included_users": plan.included_users or 0,
            "addon_gb": plan.addon_gb or 0,
            "addon_users": plan.addon_users or 0,
            "renew_price": plan.renew_price or 0,
            "renew_pricing_mode": plan.renew_pricing_mode or "fixed",
            "allow_buy_extra": bool(plan.allow_buy_extra),
            "extra_gb_price": plan.extra_gb_price or 0,
            "extra_user_price": plan.extra_user_price or 0,
            "create_pg_admin": bool(plan.create_pg_admin),
            "share_pg_panel_url": bool(plan.share_pg_panel_url),
            "pg_role_id": plan.pg_role_id,
            "pg_group_ids": _id_list(plan.pg_group_ids),
            "button_style": plan_button_style_form_value(plan.button_style),
            "is_active": bool(plan.is_active),
            "is_system": bool(plan.is_system) or is_current_capacity_plan(plan),
            "carry_remaining_period": bool(plan.carry_remaining_period),
            "keep_extras_on_renew": bool(plan.keep_extras_on_renew),
            "allow_pg_panel_access": bool(plan.allow_pg_panel_access),
            "payg_basis": plan.payg_basis or "traffic",
            "payg_charge_upfront": bool(plan.payg_charge_upfront),
            "payg_user_price": plan.payg_user_price or 0,
            "payg_user_price_per_30d": bool(plan.payg_user_price_per_30d),
            "payg_unlimited_price": plan.payg_unlimited_price,
        },
        "packs": await reseller_plan_packs(session, int(plan.id)),
        "pack_style_options": style_options(ITEM_BUTTON_STYLE_OPTIONS),
        "pack_config": {"reseller": reseller_pack_config()},
        "limits": limit_payload(snapshot),
        "groups": groups,
        "pg_roles": await _pg_roles(),
        "feature_perms": [[key, label] for key, label in FEATURE_PERMS],
        "selected_perms": selected,
        "categories": [
            {"id": c.id, "name": c.name, "is_active": bool(c.is_active)}
            for c in categories
            if c.is_active or plan.category_id == c.id
        ],
        "plan_style_options": style_options(PLAN_BUTTON_STYLE_OPTIONS),
    }
