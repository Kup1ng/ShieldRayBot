"""Data of the Owner's bot-settings screens for the React web panel.

The screens still save through the existing ``POST /settings`` handler; this module only describes
them: which tabs the Owner has, each tab's fields with their saved values, and the extra data a few
tabs show (colors catalog, notification switches, bot connection). Secret fields never carry their
value, only whether one is saved.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.button_styles import (
    STYLE_OPTIONS,
    build_dynamic_color_summary,
    colors_page_grouped_sections,
)
from app.services.connection_guides import (
    default_connection_guides,
    parse_connection_guides,
    serialize_connection_guides,
)
from app.services.daily_report import (
    ACTOR_OWNER,
    DEFAULT_REPORT_TEMPLATE,
    metric_groups_for_ui,
    parse_metric_keys,
)
from app.services.home_overview import check_bot_connection
from app.services.message_variables import template_variable_specs
from app.services.notifications import PLATFORM_NOTIFY_PREFS, get_notify_prefs
from app.services.payment_destinations import (
    enrich_payment_settings,
    parse_payment_cards,
    parse_payment_crypto_wallets,
    parse_payment_gateways,
)
from app.services.rich_text import prepare_settings_values_for_web
from app.services.settings_form_payload import listed_tabs
from app.services.settings_tab_groups import group_settings_tabs, tabs_with_message_variables
from app.services.setup_wizard import current_setup_values
from app.services.support_contacts import parse_support_contacts
from app.services.ux20 import build_magic_links_context
from app.services.users import (
    PANEL_SETTINGS_KEYS,
    PANEL_SETTINGS_TABS,
    RESETTABLE_SETTINGS_TABS,
    SETTING_GROUPS,
    SETTING_VISIBILITY,
    SETTINGS_DOMAIN_REDIRECTS,
    SETTINGS_TABS,
    TAB_SETTING_GROUPS,
    get_all_settings,
)

DEFAULT_TAB = "welcome"
# The Owner's bot connection is a system setting upstream, but the React panel edits it with the bot
# settings, where its form lives; every other system tab is drawn by the system settings page.
BOT_TAB = "bot"
OWNER_BOT_TAB = (BOT_TAB, dict(PANEL_SETTINGS_TABS).get(BOT_TAB, "اتصال ربات"))
SYSTEM_TABS = [(key, label) for key, label in PANEL_SETTINGS_TABS if key != BOT_TAB]
# The shared layout names this group for a shop's own bot; on the Owner's page it is the main bot.
CONNECT_GROUP, OWNER_CONNECT_LABEL = "connect", "اتصال ربات"
NAMING_TAB = "naming"
SECURITY_PATH = "/security"
TRUE_VALUES = frozenset({"1", "true", "yes", "on"})
# Tabs whose live Telegram preview shows a chat; the identity tab has its own profile preview.
CHAT_PREVIEW_TABS = frozenset({"menu", "welcome", "messages", "buttons", "qr", "daily_report"})
PROFILE_PREVIEW_TAB = "appearance"
RESET_CONFIRM = "همهٔ متن‌ها و رنگ‌های همین بخش به پیش‌فرض ربات برمی‌گردد و تغییرهای شما در این بخش پاک می‌شود. ادامه می‌دهید؟"
MENU_RESET_CONFIRM = "ترتیب و چیدمان دکمه‌های منو به حالت اولیهٔ ربات برمی‌گردد. ادامه می‌دهید؟"
PERCENT_KEYS = frozenset({"user_alert_low_traffic_pct", "user_alert_low_time_pct"})
LIST_PLACEHOLDERS = {"wallet_topup_presets": "50000", "service_import_paths": "/sub", "service_import_admins": "admin"}
# Saved values the Telegram preview falls back to while a field is not in the form.
PREVIEW_KEYS = (
    "shop_title",
    "welcome_text",
    "guide_text",
    "faq_text",
    "empty_services_text",
    "shop_empty_text",
    "delivery_title",
    "purchase_success_text",
    "wallet_success_text",
    "btn_menu_home",
    "btn_back",
    "btn_shop",
    "btn_services",
    "btn_wallet",
    "btn_support",
    "btn_loyalty",
    "btn_referral",
    "btn_reseller_apply",
    "btn_style_home",
    "btn_style_back",
    "btn_style_shop",
    "btn_style_services",
    "btn_style_wallet",
    "btn_style_support",
    "btn_style_loyalty",
    "btn_style_reseller_apply",
    "menu_order",
    "menu_layout",
    "qr_enabled",
    "qr_caption",
    "qr_background",
    "show_sub_link_in_text",
    "admin_daily_report_template",
)

FORCE_JOIN_GROUP = "کانال اجباری"
TERMS_GROUP = "قوانین ورود به ربات"
USER_ALERT_GROUP = "هشدار سرویس کاربر"
# A group's own warning, shown inside its box under the title.
GROUP_NOTICES: dict[str, dict[str, Any]] = {
    FORCE_JOIN_GROUP: {
        "title": "ربات باید ادمین کانال باشد",
        "text": "بدون نقش Admin، تلگرام اجازهٔ بررسی عضویت را نمی‌دهد و کاربر ممکن است پشت صفحهٔ عضویت بماند.",
        "items": [
            "ربات را به کانال یا گروه اضافه کنید و نقش Admin بدهید.",
            "شناسه را درست وارد کنید: @username یا -100… یا لینک t.me/c/….",
            "برای کانال خصوصی، لینک دعوت t.me/+… را هم بگذارید.",
            "بعد از ادمین کردن ربات، یک‌بار دکمه «عضو شدم» را در خود ربات تست کنید.",
        ],
    },
    TERMS_GROUP: {
        "title": "ایموجی پریمیوم تلگرام",
        "text": "برای حفظ ایموجی سفارشی، متن قوانین را از داخل ربات (تنظیمات ← دسترسی ← قوانین) بفرستید. ذخیره از وب‌پنل فقط متن ساده نگه می‌دارد.",
        "items": [],
    },
}
GROUP_CAPTIONS = {
    USER_ALERT_GROUP: (
        "هشدار خودکار برای مشتری‌ها وقتی حجم یا زمان سرویس‌شان رو به اتمام است. "
        "درصد را طوری تنظیم کنید که قبل از قطع سرویس به کاربر یادآوری شود."
    ),
}


@dataclass(frozen=True, slots=True)
class TabRoute:
    """Where a requested ``?tab=`` leads: a tab of this page, or another page."""

    tab: str
    redirect: str | None = None


def resolve_tab(raw: str | None) -> TabRoute:
    """The tab to show, following the legacy tab keys that moved to other pages."""
    tab = (raw or DEFAULT_TAB).strip() or DEFAULT_TAB
    if tab in SETTINGS_DOMAIN_REDIRECTS:
        return TabRoute(tab, SETTINGS_DOMAIN_REDIRECTS[tab])
    if tab == "users":
        return TabRoute(NAMING_TAB, f"/settings?tab={NAMING_TAB}")
    if tab == "security":
        return TabRoute(tab, SECURITY_PATH)
    valid = {key for key, _ in SETTINGS_TABS} | PANEL_SETTINGS_KEYS
    return TabRoute(tab if tab in valid else DEFAULT_TAB)


def is_panel_tab(tab: str) -> bool:
    return tab in PANEL_SETTINGS_KEYS and tab != BOT_TAB


def nav_payload(staff: dict, tab: str) -> dict[str, Any]:
    """Tab navigation: grouped bot tabs, or the flat panel tabs with the security page."""
    if is_panel_tab(tab):
        return {
            "kind": "panel",
            "panel_tabs": [{"key": key, "label": label} for key, label in SYSTEM_TABS],
            "security_href": SECURITY_PATH,
            "groups": [],
        }
    groups = group_settings_tabs(tabs_with_message_variables([*SETTINGS_TABS, OWNER_BOT_TAB], staff), tab)
    return {
        "kind": "bot",
        "panel_tabs": [],
        "security_href": SECURITY_PATH,
        "groups": [
            {
                "key": group.key,
                "label": OWNER_CONNECT_LABEL if group.key == CONNECT_GROUP else group.label,
                "is_active": group.is_active,
                "tabs": [{"key": item.key, "label": item.label, "href": item.href} for item in listed_tabs(group)],
            }
            for group in groups
        ],
    }


def _style_options() -> list[dict[str, str]]:
    return [{"value": value, "label": label, "tone": tone} for value, label, tone in STYLE_OPTIONS]


def field_payload(field: tuple, values: dict[str, str], specs: dict[str, dict[str, str]]) -> dict[str, Any]:
    """One setting field for the form. Switches are booleans, secrets only say whether one is saved."""
    key, label = field[0], field[1]
    kind = field[2] if len(field) > 2 else "text"
    help_text = field[3] if len(field) > 3 else ""
    options = field[4] if len(field) > 4 else []
    raw = str(values.get(key, "") or "")
    payload: dict[str, Any] = {"key": key, "label": label, "kind": kind, "help": help_text, "options": []}
    if kind == "toggle":
        payload["value"] = raw.lower() in TRUE_VALUES
    elif kind == "password":
        payload["value"] = ""
        payload["has_value"] = bool(raw)
    elif kind == "select":
        payload["options"] = [{"value": value, "label": text} for value, text in options]
        payload["value"] = raw or (options[0][0] if options else "")
    elif kind == "btn_color":
        payload["options"] = _style_options()
        payload["value"] = raw
    elif kind == "image":
        payload["value"] = raw
        payload["image_url"] = f"/media/{raw}" if raw else ""
    else:
        payload["value"] = raw
    if kind == "list":
        payload["list_kind"] = "money" if key == "wallet_topup_presets" else "text"
        payload["placeholder"] = LIST_PLACEHOLDERS.get(key, "")
    if key in PERCENT_KEYS:
        payload["min"], payload["max"] = 1, 99
    rule = SETTING_VISIBILITY.get(key)
    payload["show_when"] = {"key": rule[0], "values": list(rule[1])} if rule else None
    payload["variables"] = specs.get(key) or None
    return payload


def groups_payload(tab: str, values: dict[str, str]) -> list[dict[str, Any]]:
    specs = template_variable_specs(ACTOR_OWNER)
    return [
        {
            "name": name,
            "caption": GROUP_CAPTIONS.get(name, ""),
            "notice": GROUP_NOTICES.get(name),
            "fields": [field_payload(field, values, specs) for field in SETTING_GROUPS[name]],
        }
        for name in TAB_SETTING_GROUPS.get(tab, [])
        if name in SETTING_GROUPS
    ]


def _guides_json(raw: str | None) -> str:
    """The guides the editor starts from, without their stored media (that has its own endpoints)."""
    guides = parse_connection_guides(raw) or default_connection_guides()
    return serialize_connection_guides([{k: v for k, v in guide.items() if k != "media"} for guide in guides])


def _colors_extra(values: dict[str, str]) -> dict[str, Any]:
    pay_ui = enrich_payment_settings(values)
    dynamic = build_dynamic_color_summary(
        values,
        support_contacts=parse_support_contacts(values.get("support_contacts")),
        payment_cards=parse_payment_cards(pay_ui.get("payment_cards")),
        payment_gateways=parse_payment_gateways(pay_ui.get("payment_gateways")),
        payment_crypto_wallets=parse_payment_crypto_wallets(pay_ui.get("payment_crypto_wallets")),
    )
    sections = []
    for tab_id, label, caption, groups in colors_page_grouped_sections():
        sections.append(
            {
                "id": tab_id,
                "label": label,
                "caption": caption,
                "groups": [
                    {
                        "name": name,
                        "items": [
                            {"key": item["key"], "label": item["label"], "value": values.get(item["key"], item["default"]) or ""}
                            for item in items
                        ],
                    }
                    for name, items in groups
                ],
                "dynamic": [
                    {
                        "title": row["title"],
                        "color_label": row["color_label"],
                        "edit_url": row["edit_url"],
                        "edit_hint": row["edit_hint"],
                    }
                    for row in dynamic
                    if row.get("tab") == tab_id
                ],
            }
        )
    return {"sections": sections, "style_options": _style_options()}


async def _notifications_extra(session: AsyncSession) -> dict[str, Any]:
    prefs = await get_notify_prefs(session)
    return {
        "items": [
            {"key": key, "title": title, "help": help_text, "on": bool(prefs.get(key))}
            for key, title, help_text, _default in PLATFORM_NOTIFY_PREFS
        ]
    }


def _daily_report_extra(values: dict[str, str]) -> dict[str, Any]:
    enabled = parse_metric_keys(values.get("admin_daily_report_metrics"), actor=ACTOR_OWNER)
    return {
        "metric_groups": metric_groups_for_ui(ACTOR_OWNER),
        "enabled_metrics": list(enabled),
    }


async def _bot_extra() -> dict[str, Any]:
    env = current_setup_values()
    token = env.get("BOT_TOKEN") or ""
    status = await check_bot_connection(token)
    webhook_base = env.get("WEBHOOK_URL") or ""
    webhook_path = env.get("WEBHOOK_PATH") or "/telegram/webhook"
    mode = env.get("BOT_UPDATE_MODE") or ("webhook" if webhook_base else "polling")
    return {
        "bot_status": {
            "ok": bool(status.get("ok")),
            "username": status.get("username") or "",
            "id": status.get("id"),
            "error": "" if status.get("ok") else str(status.get("error") or "آفلاین"),
        },
        "token_masked": ("••••" + token[-6:]) if len(token) > 8 else ("••••" if token else ""),
        "bot_username": env.get("BOT_USERNAME") or "",
        "admin_ids": env.get("ADMIN_IDS") or "",
        "update_mode": "webhook" if mode == "webhook" else "polling",
        "webhook_url": webhook_base,
        "webhook_path": webhook_path,
        "public_base_url": env.get("PUBLIC_BASE_URL") or "",
        "webhook_full_url": (webhook_base + webhook_path) if webhook_base else "",
        "pg_base_url": env.get("PG_BASE_URL") or "",
        "pg_subscription_path": env.get("PG_SUBSCRIPTION_PATH") or "/sub",
        "pg_username": env.get("PG_USERNAME") or "",
        "has_pg_api_key": bool(env.get("PG_API_KEY")),
    }


async def _links_extra(session: AsyncSession, staff: dict) -> dict[str, Any]:
    context = await build_magic_links_context(session, staff)
    return {"bot_username": context.get("bot_username") or "", "links": context.get("links") or {}}


def preview_values(values: dict[str, str]) -> dict[str, str]:
    return {key: str(values.get(key, "") or "") for key in PREVIEW_KEYS}


SyncExtra = Callable[[dict[str, str]], dict[str, Any]]
SYNC_EXTRAS: dict[str, SyncExtra] = {
    "colors": _colors_extra,
    "daily_report": _daily_report_extra,
}


async def tab_payload(session: AsyncSession, staff: dict, tab: str) -> dict[str, Any]:
    """Everything the page frame and one bot tab need (the panel tabs load their own data)."""
    payload: dict[str, Any] = {"tab": tab, "nav": nav_payload(staff, tab)}
    if is_panel_tab(tab):
        return payload
    values = prepare_settings_values_for_web(await get_all_settings(session))
    if tab == "guides":
        values["connection_guides"] = _guides_json(values.get("connection_guides"))
    if tab == "daily_report" and not (values.get("admin_daily_report_template") or "").strip():
        values["admin_daily_report_template"] = DEFAULT_REPORT_TEMPLATE
    if tab == "colors":
        values = enrich_payment_settings(values)
    # The colors tab edits the button catalog (its own sections), not the generic field groups.
    payload["groups"] = [] if tab == "colors" else groups_payload(tab, values)
    payload["can_reset"] = tab in RESETTABLE_SETTINGS_TABS
    payload["reset_confirm"] = MENU_RESET_CONFIRM if tab == "menu" else RESET_CONFIRM
    payload["preview"] = (
        "chat" if tab in CHAT_PREVIEW_TABS else "profile" if tab == PROFILE_PREVIEW_TAB else None
    )
    payload["preview_values"] = preview_values(values) if tab in CHAT_PREVIEW_TABS else {}
    extra: dict[str, Any] = {}
    sync_extra = SYNC_EXTRAS.get(tab)
    if sync_extra:
        extra = sync_extra(values)
    elif tab == "notifications":
        extra = await _notifications_extra(session)
    elif tab == "bot":
        extra = await _bot_extra()
    elif tab == "links":
        extra = await _links_extra(session, staff)
    payload["extra"] = extra
    return payload
