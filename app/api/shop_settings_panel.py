"""Data of the shop settings page (``/shop-settings``) for the React panel.

One payload per tab. The tab's form still posts the existing settings handlers in ``shop_settings.py``;
this module only reads: the shop always comes from the signed-in staff, never from the request.
"""

from __future__ import annotations

import logging
from collections.abc import Mapping
from typing import Any
from urllib.parse import quote, urlencode

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.guide_media_pages import SHOP_BASE, guides_media_view
from app.db.models import ResellerProfile
from app.services.authz import resolve_shop_permissions_from_profile, shop_feature_allowed
from app.services.bot_appearance import load_appearance_context
from app.services.button_styles import STYLE_OPTIONS, colors_page_grouped_sections
from app.services.chat_cleanup_config import KEY_ENABLED, KEY_PERSISTENT_MENU, KEY_RESTART_BUTTON
from app.services.connection_guides import default_connection_guides, parse_connection_guides, serialize_connection_guides
from app.services.daily_report import ACTOR_SHOP, DEFAULT_REPORT_TEMPLATE, metric_groups_for_ui, parse_metric_keys
from app.services.entry_approval_config import GROUP_TITLE as ENTRY_APPROVAL_GROUP, PERMISSION as ENTRY_APPROVAL_PERMISSION
from app.services.main_app_payload import main_app_payload
from app.services.miniapp_branding import ACCENT_PRESETS, ACCENT_SETTING, NOTICE_SETTING
from app.services.miniapp_main_app import main_app_guide
from app.services.miniapp_shop import (
    SHOP_SWITCH,
    shop_miniapp_available,
    shop_miniapp_blocker,
    shop_miniapp_url,
)
from app.services.notifications import SYSTEM_NOTIFY_KEYS, get_shop_notify_prefs, shop_notify_catalog
from app.services.panel_brand import load_brand, load_own_values
from app.services.redact import redact
from app.services.resellers import (
    RESELLER_SETTINGS_TABS,
    SHOP_SETTINGS_DOMAIN_REDIRECTS,
)
from app.services.rich_text import prepare_settings_values_for_web
from app.services.secret_box import reveal_bot_token
from app.services.settings_form_payload import (
    TRUE_VALUES,
    USER_ALERT_CAPTION,
    media_url,
    nav_payload,
    sections_payload,
    visible_groups,
)
from app.services.settings_tab_groups import group_settings_tabs, tabs_with_message_variables
from app.services.shop_scope import is_platform_admin, shop_owner_id
from app.services.users import RESETTABLE_SETTINGS_TABS, get_all_settings, get_setting
from app.services.ux20 import build_magic_links_context

logger = logging.getLogger(__name__)

SETTINGS_BASE = "/shop-settings"
DEFAULT_TAB = "welcome"
ALLOWED_TABS = frozenset(key for key, _ in RESELLER_SETTINGS_TABS)
PREVIEW_TABS = frozenset({"menu", "welcome", "messages", "buttons", "qr", "appearance", "daily_report"})
FLASH_KEYS = ("ok", "err", "saved", "msg")
NO_SCOPE_MESSAGE = "محدوده فروشگاه مشخص نیست — به داده ادمین اصلی دسترسی ندارید"
RESET_CONFIRM = "همهٔ متن‌ها و رنگ‌های همین بخش به پیش‌فرض ربات برمی‌گردد و تغییرهای شما در این بخش پاک می‌شود. ادامه می‌دهید؟"
MENU_RESET_CONFIRM = "ترتیب و چیدمان دکمه‌های منو به حالت اولیهٔ ربات برمی‌گردد. ادامه می‌دهید؟"
TELEGRAM_TIMEOUT_SECONDS = 8.0
TOKEN_MASK_TAIL = 6
MENU_CATALOG = {
    "connection_status": ("وضعیت اتصال", False),
    "shop": ("خرید سرویس", True),
    "services": ("سرویس‌های من", False),
    "wallet": ("کیف پول", False),
    "support": ("پشتیبانی", False),
    "loyalty": ("باشگاه مشتریان", False),
}


def normalize_tab(raw: str | None) -> str:
    return (raw or DEFAULT_TAB).strip()


def entry_redirect(staff: dict, tab: str, params: Mapping[str, str]) -> str | None:
    """Where staff who do not belong on this page go instead (the Owner, a missing shop, a moved tab)."""
    if is_platform_admin(staff) or staff.get("role") == "admin":
        return "/settings"
    if not shop_owner_id(staff):
        return "/dashboard?err=" + quote(NO_SCOPE_MESSAGE)
    if tab == "security":
        return "/security"
    destination = SHOP_SETTINGS_DOMAIN_REDIRECTS.get(tab)
    if destination is None:
        return None
    extra = {key: params[key] for key in FLASH_KEYS if params.get(key)}
    if not extra:
        return destination
    return destination + ("&" if "?" in destination else "?") + urlencode(extra)


async def load_profile(session: AsyncSession, shop_id: int) -> ResellerProfile | None:
    return (await session.execute(select(ResellerProfile).where(ResellerProfile.user_id == shop_id))).scalar_one_or_none()


def menu_context(values: dict[str, str]) -> dict[str, Any]:
    """The bot menu's active buttons in order, and the buttons still in the pool."""
    # Function-local import: the keyboards module pulls in the whole bot.
    from app.bot.keyboards import DEFAULT_ACTIVE_MENU_ORDER, DEFAULT_MENU_ORDER

    order = [part.strip() for part in (values.get("menu_order") or ",".join(DEFAULT_ACTIVE_MENU_ORDER)).split(",") if part.strip()]
    if "referral" in order and "loyalty" not in order:
        order = ["loyalty" if key == "referral" else key for key in order]
    order = [key for key in order if key != "referral" and key in DEFAULT_MENU_ORDER and key != "reseller_apply"]
    if "shop" not in order:
        order.insert(0, "shop")

    def item(key: str) -> dict[str, Any]:
        label, required = MENU_CATALOG[key]
        return {"key": key, "label": label, "required": required}

    return {
        "items": [item(key) for key in order if key in MENU_CATALOG],
        "pool": [item(key) for key in MENU_CATALOG if key not in order and key != "shop"],
        "layout": values.get("menu_layout") or "compact",
        "cleanup": {
            "chat_cleanup": values.get(KEY_ENABLED, "1") in TRUE_VALUES,
            "persistent_menu": values.get(KEY_PERSISTENT_MENU, "0") in TRUE_VALUES,
            "restart_button": values.get(KEY_RESTART_BUTTON, "1") in TRUE_VALUES,
        },
    }


async def bot_token_status(token: str) -> dict[str, Any]:
    """Ask Telegram who the shop's bot token belongs to (one short call)."""
    token = (token or "").strip()
    if not token:
        return {"ok": False, "error": "توکن تنظیم نشده"}
    try:
        async with httpx.AsyncClient(timeout=TELEGRAM_TIMEOUT_SECONDS) as client:
            data = (await client.get(f"https://api.telegram.org/bot{token}/getMe")).json()
    except (httpx.HTTPError, ValueError) as exc:
        return {"ok": False, "error": f"عدم اتصال به تلگرام: {redact(exc)}"}
    me = data.get("result") if isinstance(data, dict) else None
    if isinstance(data, dict) and data.get("ok") and isinstance(me, dict):
        return {"ok": True, "username": me.get("username"), "id": me.get("id"), "name": me.get("first_name")}
    description = data.get("description") if isinstance(data, dict) else None
    return {"ok": False, "error": description or "توکن نامعتبر"}


def _style_options() -> list[dict[str, str]]:
    return [{"value": value, "label": label, "tone": tone} for value, label, tone in STYLE_OPTIONS]


async def _bot_extra(profile: ResellerProfile | None) -> dict[str, Any]:
    token = (reveal_bot_token(profile.bot_token) if profile else "") or ""
    return {
        "status": await bot_token_status(token),
        "token_masked": ("••••" + token[-TOKEN_MASK_TAIL:]) if len(token) > 8 else ("••••" if token else ""),
        "username": (profile.bot_username if profile else "") or "",
    }


async def _brand_extra(session: AsyncSession, shop_id: int) -> dict[str, Any]:
    own = await load_own_values(session, shop_id)
    effective = await load_brand(session, shop_id)
    return {
        "name": own["name"],
        "has_own_logo": bool(own["logo"]),
        "logo_url": effective.logo_url,
        "effective_name": effective.name,
        "platform_logo": effective.has_custom_logo and not own["logo"],
    }


async def _miniapp_extra(session: AsyncSession, profile: ResellerProfile | None, values: dict[str, str]) -> dict[str, Any]:
    presets = [{"value": colour, "label": title} for colour, title in ACCENT_PRESETS]
    saved = (values.get(ACCENT_SETTING, "") or "").lower()
    extra: dict[str, Any] = {
        "available": False,
        "blocker": "",
        "on": False,
        "url": "",
        "accent": saved if saved in {p["value"] for p in presets} else "",
        "notice": values.get(NOTICE_SETTING, ""),
        "presets": presets,
        "main_app": None,
    }
    if profile is None:
        return extra
    on_now = (await get_setting(session, SHOP_SWITCH, "0", reseller_id=int(profile.user_id))) == "1"
    url = shop_miniapp_url(profile.miniapp_key or "")
    extra.update(
        available=await shop_miniapp_available(session, profile),
        blocker=await shop_miniapp_blocker(session, profile),
        on=on_now,
        url=url,
        # The «Open» button in Telegram search only works while the shop's own Mini App is on.
        main_app=main_app_payload(
            await main_app_guide(reveal_bot_token(profile.bot_token or ""), url=url, known_username=profile.bot_username)
            if on_now and url
            else None
        ),
    )
    return extra


async def _appearance_extra(session: AsyncSession, shop_id: int, profile: ResellerProfile | None) -> dict[str, Any]:
    token = (reveal_bot_token(profile.bot_token) if profile else "") or ""
    username = (profile.bot_username if profile else "") or ""
    loaded = await load_appearance_context(session, token=token, reseller_id=shop_id, fallback_username=username)
    form = loaded["appearance"]
    return {
        "name": form.get("bot_tg_name") or "",
        "short_description": form.get("bot_tg_short_description") or "",
        "description": form.get("bot_tg_description") or "",
        "photo_url": media_url(form.get("bot_tg_photo") or ""),
        "bot_username": form.get("bot_username") or username,
        "sync_ok": bool(loaded["appearance_sync_ok"]),
        "sync_error": loaded["appearance_sync_err"] or "",
    }


async def _notifications_extra(session: AsyncSession, staff: dict, shop_id: int, profile: ResellerProfile | None) -> dict[str, Any]:
    perms = list(staff.get("permissions") or []) or list(resolve_shop_permissions_from_profile(profile) or [])
    prefs = await get_shop_notify_prefs(session, shop_id)
    return {
        "items": [
            {"key": key, "title": title, "help": help_text, "on": bool(prefs.get(key)), "system": key in SYSTEM_NOTIFY_KEYS}
            for key, title, help_text, _ in shop_notify_catalog(perms)
        ]
    }


def _daily_report_extra(values: dict[str, str]) -> dict[str, Any]:
    return {
        "metric_groups": metric_groups_for_ui(ACTOR_SHOP),
        "enabled_metrics": parse_metric_keys(values.get("admin_daily_report_metrics"), actor=ACTOR_SHOP),
    }


def _colors_extra(values: dict[str, str]) -> dict[str, Any]:
    sections = colors_page_grouped_sections(for_reseller=True)
    _, label, caption, groups = sections[0]
    return {
        "label": label,
        "caption": caption,
        "groups": [
            {"name": name, "items": [{"key": item["key"], "label": item["label"], "value": values.get(item["key"], item["default"])} for item in items]}
            for name, items in groups
        ],
    }


async def _guides_extra(session: AsyncSession, shop_id: int) -> dict[str, Any]:
    return {"media": await guides_media_view(session, SHOP_BASE, reseller_id=shop_id), "media_base": SHOP_BASE}


def _with_default_guides(values: dict[str, str]) -> None:
    if not parse_connection_guides(values.get("connection_guides")):
        values["connection_guides"] = serialize_connection_guides(default_connection_guides())


async def _tab_extra(session: AsyncSession, staff: dict, tab: str, shop_id: int, profile: ResellerProfile | None, values: dict[str, str]) -> dict[str, Any]:
    """What a tab needs beyond its generic fields."""
    if tab == "menu":
        return menu_context(values)
    if tab == "colors":
        return _colors_extra(values)
    if tab == "bot":
        return await _bot_extra(profile)
    if tab == "brand":
        return await _brand_extra(session, shop_id)
    if tab == "miniapp":
        return await _miniapp_extra(session, profile, values)
    if tab == "links":
        links = await build_magic_links_context(session, staff)
        return {"bot_username": links["bot_username"] or "", "links": {key: value or "" for key, value in links["links"].items()}}
    if tab == "appearance":
        return await _appearance_extra(session, shop_id, profile)
    if tab == "notifications":
        return await _notifications_extra(session, staff, shop_id, profile)
    if tab == "daily_report":
        return _daily_report_extra(values)
    if tab == "guides":
        return await _guides_extra(session, shop_id)
    return {}


async def shop_settings_payload(session: AsyncSession, staff: dict, tab: str) -> dict[str, Any]:
    """The shop's settings for one tab. The caller has already refused the Owner and shop-less staff."""
    shop_id = shop_owner_id(staff)
    if not shop_id:
        raise PermissionError(NO_SCOPE_MESSAGE)
    tab = tab if tab in ALLOWED_TABS else DEFAULT_TAB
    # Texts edited in the bot may be packed with premium emoji; fields show their plain text.
    values = prepare_settings_values_for_web(await get_all_settings(session, reseller_id=shop_id))
    values["show_reseller_apply"] = "0"
    if tab == "guides":
        _with_default_guides(values)
    if tab == "daily_report" and not (values.get("admin_daily_report_template") or "").strip():
        values["admin_daily_report_template"] = DEFAULT_REPORT_TEMPLATE
    profile = await load_profile(session, shop_id)
    groups = visible_groups(tab)
    if tab == "limits" and not shop_feature_allowed(key=ENTRY_APPROVAL_PERMISSION, staff=staff):
        # Nobody in the shop could decide the requests, so the switch is not offered.
        groups.pop(ENTRY_APPROVAL_GROUP, None)
    nav = group_settings_tabs(tabs_with_message_variables(RESELLER_SETTINGS_TABS, staff), tab)
    return {
        "tab": tab,
        "nav": nav_payload(nav, SETTINGS_BASE),
        "preview": tab in PREVIEW_TABS,
        "shop_title": values.get("shop_title", ""),
        "reset": {"enabled": tab in RESETTABLE_SETTINGS_TABS, "confirm": MENU_RESET_CONFIRM if tab == "menu" else RESET_CONFIRM},
        "style_options": _style_options() if tab in {"limits", "guides", "colors"} else [],
        "sections": sections_payload(groups, values, caption=USER_ALERT_CAPTION if tab == "notifications" else ""),
        "extra": await _tab_extra(session, staff, tab, shop_id, profile, values),
    }
