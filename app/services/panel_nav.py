"""The web panel's navigation for one signed-in staff member.

A port of the sidebar gating in ``app/web/templates/base.html`` so the React panel shows exactly
the sections and items the server-rendered panel showed. Presentation only: every page and
action still checks permissions on the server; hiding an item here never grants or denies access.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import asdict, dataclass, field
from typing import Any

# Paths the panel settings tabs live under (the "web panel" settings, not the bot settings).
PANEL_SETTINGS_TABS = ("general", "backup", "pwa", "ssl", "update")

PG_ITEMS: tuple[tuple[str, str, str, str], ...] = (
    ("pg_overview", "/pg", "نمای کلی", "solar:widget-5-linear"),
    ("pg_users", "/pg/users", "کاربران", "solar:users-group-rounded-linear"),
    ("pg_admins", "/pg/admins", "ادمین", "solar:shield-user-linear"),
    ("pg_nodes", "/pg/nodes", "نود", "solar:server-square-linear"),
    ("pg_groups", "/pg/groups", "گروه", "solar:folder-with-files-linear"),
    ("pg_hosts", "/pg/hosts", "هاست", "solar:global-linear"),
    ("pg_templates", "/pg/templates", "قالب", "solar:document-text-linear"),
    ("pg_inbounds", "/pg/inbounds", "اینباند", "solar:login-3-linear"),
)


@dataclass(slots=True)
class NavItem:
    id: str
    href: str
    label: str
    icon: str
    # Paths (prefixes) that keep this item highlighted, e.g. /orders for «مدیریت مالی».
    match: list[str] = field(default_factory=list)
    # Sidebar dot: "inbox", "tickets" or "cancellations" — the client reads the live counts.
    dot: str | None = None


@dataclass(slots=True)
class NavSection:
    id: str
    label: str
    items: list[NavItem]


def _perm_list(staff: Mapping[str, Any], key: str) -> list[str]:
    raw = staff.get(key) or []
    return [str(p) for p in raw] if isinstance(raw, (list, tuple, set)) else []


def _system_section(*, is_owner: bool, is_pg_staff: bool) -> NavSection:
    settings = (
        NavItem("panel-settings", "/settings?tab=general", "تنظیمات وب پنل", "solar:settings-linear", ["/security"])
        if is_owner
        else NavItem("panel-settings", "/security", "تنظیمات وب پنل", "solar:settings-linear", ["/security"])
    )
    items = [
        NavItem("home", "/home", "داشبورد", "solar:home-2-linear"),
        NavItem("inbox", "/inbox", "اعلان‌ها", "solar:bell-linear", ["/inbox"], dot="inbox"),
        settings,
    ]
    if not is_owner and is_pg_staff:
        items.append(NavItem("tickets", "/tickets", "پشتیبانی", "solar:chat-round-dots-linear", ["/tickets"], dot="tickets"))
    return NavSection("system", "وب پنل", items)


def _shop_section(
    staff: Mapping[str, Any],
    *,
    identity: Mapping[str, Any],
    is_owner: bool,
    marketing: Sequence[Any],
) -> NavSection:
    perms = _perm_list(staff, "permissions")
    role = str(staff.get("role") or "")
    is_admin = role == "admin"
    is_reseller = role == "reseller"
    items: list[NavItem] = []
    if is_admin or "dashboard" in perms:
        items.append(NavItem("dashboard", "/dashboard", "نمای کلی", "solar:chart-2-linear"))
    if is_reseller and not is_owner:
        items.append(NavItem("my-subscription", "/my-subscription", "اشتراک من", "solar:crown-linear", ["/my-subscription"]))
    if is_owner:
        items.append(NavItem("users", "/users", "کاربران", "solar:users-group-rounded-linear", ["/users"]))
    elif "dashboard" in perms:
        items.append(NavItem("users", "/users", "مشتریان", "solar:users-group-rounded-linear", ["/users"]))
    if not is_owner and identity.get("can_add_representative"):
        items.append(NavItem("resellers", "/resellers", "نمایندگان من", "solar:user-hand-up-linear", ["/resellers"]))
    if is_owner and identity.get("can_manage_representatives"):
        items.append(NavItem("resellers", "/resellers", "نمایندگان", "solar:user-hand-up-linear", ["/resellers"]))
    if is_admin or "orders" in perms or "payments" in perms:
        items.append(
            NavItem(
                "finance", "/finance", "مدیریت مالی", "solar:wallet-money-linear",
                ["/finance", "/orders", "/payments", "/service-cancellations"], dot="cancellations",
            )
        )
    if is_admin or "plans" in perms:
        items.append(NavItem("plans", "/plans", "پلن‌ها", "solar:box-linear", ["/plans"]))
    if is_owner or "tickets" in perms:
        items.append(NavItem("tickets", "/tickets", "پشتیبانی", "solar:chat-round-dots-linear", ["/tickets"], dot="tickets"))
    if marketing:
        first = getattr(marketing[0], "href", None) or marketing[0]["href"]
        prefixes = [str(getattr(s, "href", None) or s["href"]).split("?")[0] for s in marketing]
        items.append(NavItem("marketing", str(first), "بازاریابی و وفاداری", "solar:gift-linear", prefixes))
    if is_owner or role in ("reseller", "principal"):
        items.append(NavItem("staff-actions", "/staff-actions", "گزارش کارکنان", "solar:document-text-linear", ["/staff-actions"]))
    if is_owner or "shop_settings" in perms:
        href = "/settings" if is_owner else "/shop-settings"
        items.append(NavItem("settings", href, "تنظیمات", "solar:tuning-2-linear", ["/settings", "/shop-settings", "/message-variables"]))
    if is_owner:
        items.append(NavItem("connection-status", "/connection-status", "وضعیت اتصال", "solar:pulse-2-linear", ["/connection-status"]))
    return NavSection("shop", "پنل ربات", items)


def _pg_section(staff: Mapping[str, Any], *, is_owner: bool) -> NavSection:
    pg_nav = set(_perm_list(staff, "pg_permissions"))
    items = [NavItem(key, href, label, icon, [href] if href != "/pg" else []) for key, href, label, icon in PG_ITEMS if key in pg_nav]
    if is_owner:
        items.append(NavItem("pg-connection", "/settings?tab=bot", "تنظیمات اتصال", "solar:plug-circle-linear"))
    return NavSection("pg", "پنل پاسارگارد", items)


def panel_nav(
    staff: Mapping[str, Any],
    *,
    identity: Mapping[str, Any],
    is_owner: bool,
    marketing: Sequence[Any] = (),
) -> list[dict[str, Any]]:
    """Sections and items for the sidebar, in display order; empty sections are dropped."""
    role = str(staff.get("role") or "")
    perms = _perm_list(staff, "permissions")
    has_bot = role == "admin" or bool(perms) or role == "reseller"
    has_pg = bool(_perm_list(staff, "pg_permissions"))
    sections = [_system_section(is_owner=is_owner, is_pg_staff=role == "pg_staff")]
    if has_bot:
        sections.append(_shop_section(staff, identity=identity, is_owner=is_owner, marketing=marketing))
    if has_pg:
        sections.append(_pg_section(staff, is_owner=is_owner))
    return [asdict(section) for section in sections if section.items]
