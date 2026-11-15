"""Data of the reseller list, its create forms, risk-tag picker and the application queue for the React panel.

The functions repeat what the server-rendered ``/resellers`` and ``/resellers/applications`` pages
showed: the platform owner sees every shop, a representative only the shops under it, and nothing
here returns a password, API key, token or hash.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings, normalize_pg_base_url
from app.db.models import BotUser, ResellerApplication, ResellerProfile
from app.services.billing import ensure_payg_shop_wallet, is_payg
from app.services.billing_suspend import restore_payg_reseller
from app.services.color_tags import (
    color_tag_meta,
    color_tags_for_ui,
    effective_color_tag,
    normalize_color_filter,
    normalize_color_tag,
)
from app.services.db_safe import rollback_quiet
from app.services.list_query import (
    DEFAULT_LIST_PAGE_SIZE,
    build_list_pager,
    filter_by_search,
    list_offset,
    normalize_search_q,
    parse_list_page,
)
from app.services.pasarguard import get_pg, get_pg_for_principal
from app.services.pg_overview import admin_usage_snapshot
from app.services.platform_identity import is_explicit_owner_staff
from app.services.representative_unification import descendant_shop_profile_ids
from app.services.resellers import (
    FEATURE_PERMS,
    get_reseller_panel_base_url,
    get_reseller_pg_panel_base_url,
    list_active_reseller_plans,
    list_applications,
    release_stale_pending_payment_apps,
)
from app.services.setup_wizard import default_panel_base_url
from app.services.user_search import clean_handle
from app.services.users import get_setting
from app.services.volume_allocation import list_oversold_shop_ids

logger = logging.getLogger(__name__)

# Shops read before the search and risk-tag filters; a platform with more shops than this narrows by search.
LIST_SCAN_LIMIT = 2000
SETTING_ON = frozenset({"1", "true", "yes", "on"})
MODE_OWNER = "owner"
MODE_CHILD = "child"
# What each application status lets the reviewer do.
APPLICATION_OPS = {"awaiting_approval": ["approve", "reject"], "pending_payment": ["reject"]}


@dataclass(frozen=True, slots=True)
class ListQuery:
    color: str | None
    q: str
    page: int

    @classmethod
    def parse(cls, color: str | None, q: str | None, page: str | None) -> ListQuery:
        return cls(color=normalize_color_filter(color), q=normalize_search_q(q), page=parse_list_page(page))


SHOP_OK = "ok"
SHOP_MISSING = "missing"
SHOP_FORBIDDEN = "forbidden"


async def load_scoped_shop(session: AsyncSession, staff: dict, user_id: int) -> tuple[BotUser | None, ResellerProfile | None, str]:
    """A shop owner and profile inside the staff member's scope, with why it is not returned otherwise."""
    user = await session.get(BotUser, int(user_id))
    profile = (await session.execute(select(ResellerProfile).where(ResellerProfile.user_id == int(user_id)))).scalar_one_or_none()
    if user is None or profile is None:
        return None, None, SHOP_MISSING
    if not is_explicit_owner_staff(staff) and int(profile.id) not in await descendant_shop_profile_ids(session, staff):
        return None, None, SHOP_FORBIDDEN
    return user, profile, SHOP_OK


def _tag(user: BotUser) -> dict[str, str]:
    meta = color_tag_meta(effective_color_tag(user))
    return {"key": meta.key, "title": meta.title_fa}


def _status_of(profile: ResellerProfile) -> str:
    if profile.billing_suspended_at is not None:
        return "suspended"
    return "active" if profile.is_active else "inactive"


def _setup_of(profile: ResellerProfile) -> str:
    if profile.setup_completed_at:
        return "complete"
    return "no_bot" if profile.web_username else "none"


async def _scan_rows(session: AsyncSession, staff: dict, *, owner_view: bool) -> list[tuple[BotUser, ResellerProfile]]:
    query = (
        select(BotUser, ResellerProfile)
        .join(ResellerProfile, ResellerProfile.user_id == BotUser.id)
        .order_by(ResellerProfile.id.desc())
        .limit(LIST_SCAN_LIMIT)
    )
    if not owner_view:
        allowed = await descendant_shop_profile_ids(session, staff)
        query = query.where(ResellerProfile.id.in_(tuple(allowed) or (0,)))
    return [(user, profile) for user, profile in (await session.execute(query)).all()]


def _filter_rows(rows: list[tuple[BotUser, ResellerProfile]], query: ListQuery) -> list[tuple[BotUser, ResellerProfile]]:
    if query.color:
        rows = [pair for pair in rows if effective_color_tag(pair[0]) == query.color]
    if not query.q:
        return rows
    return filter_by_search(
        rows,
        clean_handle(query.q),
        lambda pair: (
            pair[0].id,
            pair[0].telegram_id,
            pair[0].username,
            pair[0].full_name,
            pair[0].role,
            pair[1].web_username,
            pair[1].bot_username,
            pair[1].pg_admin_username,
            pair[1].billing_mode,
        ),
    )


async def link_payg_wallets(session: AsyncSession, profiles: list[ResellerProfile]) -> None:
    """One-time link of a PAYG shop's billing pot to its wallet; a wrongful empty-pot suspend lifts on first link only."""
    touched = False
    for profile in profiles:
        if not is_payg(profile):
            continue
        was_linked = bool(profile.payg_wallet_linked)
        try:
            _owner, balance = await ensure_payg_shop_wallet(session, profile)
            touched = True
            if not was_linked and balance > 0 and profile.billing_suspended_at is not None:
                await restore_payg_reseller(session, profile, commit=False)
        except Exception:  # one bad shop must not hide the list; rolled back and logged below
            logger.warning("PAYG wallet link failed for shop profile %s", profile.id, exc_info=True)
            await rollback_quiet(session)
            touched = False
    if touched:
        try:
            await session.commit()
        except SQLAlchemyError:
            logger.warning("PAYG wallet link commit failed", exc_info=True)
            await rollback_quiet(session)


async def _usage_by_shop(profiles: list[ResellerProfile]) -> dict[int, dict[str, Any]]:
    """Users and traffic of each shop's panel admin from one admin list; empty while the panel is unreadable."""
    try:
        pg = get_pg()
        roles = await pg.get_admin_roles()
        admins = await pg.get_admins() or await pg.get_admins_simple()
    except Exception:  # the panel may be down; the list shows dashes instead
        logger.warning("reseller usage unavailable", exc_info=True)
        return {}
    roles_by_id = {int(r["id"]): r for r in roles or [] if isinstance(r, dict) and r.get("id") is not None}
    by_name = {str(a.get("username") or "").strip().lower(): a for a in admins or [] if isinstance(a, dict) and a.get("username")}
    usage: dict[int, dict[str, Any]] = {}
    for profile in profiles:
        admin = by_name.get(str(profile.pg_admin_username or "").strip().lower())
        if not isinstance(admin, dict):
            continue
        role = admin.get("role") if isinstance(admin.get("role"), dict) else None
        if role is None:
            role = _role_of(admin, profile, roles_by_id)
        usage[int(profile.user_id)] = admin_usage_snapshot(admin, role)
    return usage


def _role_of(admin: dict[str, Any], profile: ResellerProfile, roles_by_id: dict[int, Any]) -> Any:
    raw = admin.get("role_id") or profile.pg_role_id
    try:
        return roles_by_id.get(int(raw)) if raw is not None else None
    except (TypeError, ValueError):
        return None


def _usage_fields(snapshot: dict[str, Any] | None) -> dict[str, Any]:
    snapshot = snapshot or {}
    return {
        "users_text": snapshot.get("users_text") or "—",
        "traffic_text": snapshot.get("traffic_text") or "—",
        "lifetime_text": snapshot.get("lifetime_text"),
    }


def _row(user: BotUser, profile: ResellerProfile, *, owner_view: bool, oversold: set[int], usage: dict[int, dict[str, Any]]) -> dict[str, Any]:
    return {
        "user_id": int(user.id),
        "name": user.full_name or user.username or "",
        "telegram_id": user.telegram_id,
        "role": user.role,
        "tag": _tag(user),
        "billing_mode": profile.billing_mode or "fixed",
        "status": _status_of(profile),
        "oversold": owner_view and int(user.id) in oversold,
        "bot_username": profile.bot_username,
        "web_username": profile.web_username,
        "setup": _setup_of(profile),
        "usage": _usage_fields(usage.get(int(user.id))),
        # The warning before deleting a user with money on the wallet is for the platform owner only.
        "wallet_balance": int(user.wallet_balance or 0) if owner_view else None,
    }


async def list_payload(session: AsyncSession, staff: dict, query: ListQuery) -> dict[str, Any]:
    """One page of shops the staff member may see, with the filters echoed back."""
    owner_view = is_explicit_owner_staff(staff)
    rows = _filter_rows(await _scan_rows(session, staff, owner_view=owner_view), query)
    size = DEFAULT_LIST_PAGE_SIZE
    pager = build_list_pager(page=query.page, page_size=size, fetched=len(rows), total=len(rows))
    visible = rows[list_offset(pager["page"], size) :][:size]
    await link_payg_wallets(session, [profile for _user, profile in visible])
    usage: dict[int, dict[str, Any]] = {}
    oversold: set[int] = set()
    if owner_view:
        usage = await _usage_by_shop([profile for _user, profile in visible])
        oversold = await _oversold_ids(session)
    return {
        "owner_view": owner_view,
        "can_create": MODE_OWNER if owner_view else MODE_CHILD,
        "q": query.q,
        "color": query.color or "",
        "color_tags": _picker_tags(),
        "oversold_ids": sorted(oversold),
        "rows": [_row(user, profile, owner_view=owner_view, oversold=oversold, usage=usage) for user, profile in visible],
        "pager": pager,
    }


async def _oversold_ids(session: AsyncSession) -> set[int]:
    try:
        return set(await list_oversold_shop_ids(session))
    except SQLAlchemyError:
        # The warning is optional; the list still renders without it.
        logger.warning("oversold shop list failed", exc_info=True)
        await rollback_quiet(session)
        return set()


def _picker_tags() -> list[dict[str, str]]:
    return [{"key": tag["key"], "title": tag["title_fa"]} for tag in color_tags_for_ui()]


def _role_option(role: Any) -> dict[str, Any] | None:
    if not isinstance(role, dict) or role.get("id") is None:
        return None
    try:
        return {"id": int(role["id"]), "name": str(role.get("name") or role["id"]), "is_owner": bool(role.get("is_owner"))}
    except (TypeError, ValueError):
        return None


async def _owner_roles() -> list[dict[str, Any]]:
    try:
        roles = await get_pg().get_admin_roles()
    except Exception:  # without roles the form still opens; the plan's role is used
        logger.warning("panel roles unavailable for the reseller form", exc_info=True)
        return []
    return [option for option in map(_role_option, roles or []) if option]


async def _child_roles(session: AsyncSession, staff: dict) -> list[dict[str, Any]]:
    """The representative's own live roles, never the platform owner's."""
    try:
        principal_id = int(staff.get("org_principal_id") or 0)
        if principal_id <= 0:
            return []
        roles = await (await get_pg_for_principal(session, principal_id=principal_id)).get_admin_roles()
    except Exception:  # the form shows an empty role list and cannot be submitted
        logger.warning("representative roles unavailable", exc_info=True)
        return []
    return [option for option in map(_role_option, roles or []) if option and not option["is_owner"]]


async def create_options_payload(session: AsyncSession, staff: dict) -> dict[str, Any]:
    """What the create form needs: roles from the panel, the active packages, the permission switches."""
    if not is_explicit_owner_staff(staff):
        return {"mode": MODE_CHILD, "roles": await _child_roles(session, staff)}
    plans = await list_active_reseller_plans(session)
    return {
        "mode": MODE_OWNER,
        "roles": await _owner_roles(),
        "plans": [
            {"id": int(plan.id), "name": plan.name, "billing_mode": plan.billing_mode or "fixed", "price_per_gb": int(plan.price_per_gb or 0)}
            for plan in plans
        ],
        "feature_perms": [{"key": key, "label": label} for key, label in FEATURE_PERMS],
        "color_tags": _picker_tags(),
    }


async def panel_settings_payload(session: AsyncSession) -> dict[str, Any]:
    """The addresses sent in approval messages, with what is in use now and the defaults."""
    custom_url = (await get_setting(session, "reseller_panel_base_url") or "").strip()
    custom_pg_url = (await get_setting(session, "reseller_pg_panel_base_url") or "").strip()
    show_apply = await get_setting(session, "show_reseller_apply", "1")
    return {
        "panel_url": await get_reseller_panel_base_url(session),
        "custom_panel_url": custom_url,
        "default_panel_url": default_panel_base_url(),
        "pg_panel_url": await get_reseller_pg_panel_base_url(session),
        "custom_pg_panel_url": custom_pg_url,
        "default_pg_panel_url": normalize_pg_base_url(get_settings().pg_base_url or ""),
        "show_reseller_apply": str(show_apply or "").strip().lower() in SETTING_ON,
    }


async def color_tag_payload(user: BotUser) -> dict[str, Any]:
    """The picker of one shop owner's risk tag."""
    return {
        "user_id": int(user.id),
        "name": user.full_name or user.username or "",
        "color_tag": normalize_color_tag(user.color_tag),
        "tags": _picker_tags(),
    }


def _application_row(application: ResellerApplication) -> dict[str, Any]:
    user, plan = application.user, application.plan
    return {
        "id": int(application.id),
        "user_name": (user.full_name or user.username or "") if user else "",
        "telegram_id": user.telegram_id if user else None,
        "plan_name": plan.name if plan else "",
        "price": int(plan.price or 0) if plan else 0,
        "status": application.status,
        "ops": APPLICATION_OPS.get(application.status, []),
    }


async def applications_payload(session: AsyncSession) -> dict[str, Any]:
    """The newest applications; a payment that never arrived is released first, as the old page did."""
    if await release_stale_pending_payment_apps(session):
        await session.commit()
    return {"rows": [_application_row(application) for application in await list_applications(session)]}
