"""JSON data endpoints of the React web panel: Owner settings: every bot and web-panel settings tab.

Read endpoints only; actions keep posting the existing form handlers (see app/api/panel_fetch.py).
Every endpoint repeats the permission and shop-scope checks of the page it feeds.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import Depends, FastAPI
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.guide_media_pages import PLATFORM_BASE as GUIDE_MEDIA_BASE
from app.api.guide_media_pages import guides_media_view
from app.bot.keyboards import DEFAULT_ACTIVE_MENU_ORDER, DEFAULT_MENU_ORDER
from app.config import get_settings
from app.services.bot_appearance import load_appearance_context
from app.services.chat_cleanup_config import KEY_ENABLED, KEY_PERSISTENT_MENU, KEY_RESTART_BUTTON
from app.services.miniapp_branding import ACCENT_PRESETS, ACCENT_SETTING, NOTICE_MAX, NOTICE_SETTING
from app.services.miniapp_shop import PLATFORM_SWITCH
from app.services.settings_panel import TRUE_VALUES, resolve_tab, tab_payload
from app.services.setup_wizard import current_setup_values
from app.services.users import get_all_settings

NO_STORE = {"Cache-Control": "private, no-store"}
# Entries the keyboard editor can place, with the label it shows and whether the shop button may leave.
MENU_CATALOG: dict[str, dict[str, Any]] = {
    "connection_status": {"label": "وضعیت اتصال", "required": False},
    "shop": {"label": "خرید سرویس", "required": True},
    "services": {"label": "سرویس‌های من", "required": False},
    "wallet": {"label": "کیف پول", "required": False},
    "support": {"label": "پشتیبانی", "required": False},
    "loyalty": {"label": "باشگاه مشتریان", "required": False},
    "reseller_apply": {"label": "درخواست نمایندگی", "required": False},
}
MENU_LAYOUTS = (
    {"value": "classic", "label": "تکی — هر دکمه یک ردیف"},
    {"value": "compact", "label": "فشرده — دکمه‌ها جفتی (پیشنهادی)"},
)
MENU_SWITCHES = (
    (KEY_ENABLED, "1"),
    (KEY_PERSISTENT_MENU, "0"),
    (KEY_RESTART_BUTTON, "1"),
)


def _menu_entry(key: str) -> dict[str, Any]:
    meta = MENU_CATALOG[key]
    return {"key": key, "label": meta["label"], "required": meta["required"]}


async def menu_extra(session: AsyncSession) -> dict[str, Any]:
    """The keyboard editor: the active order, the storage of buttons that are out, and the layout."""
    values = await get_all_settings(session)
    raw_order = values.get("menu_order") or ",".join(DEFAULT_ACTIVE_MENU_ORDER)
    order = [part.strip() for part in raw_order.split(",") if part.strip() in DEFAULT_MENU_ORDER]
    if "shop" not in order:
        order.insert(0, "shop")
    layout = values.get("menu_layout")
    return {
        "items": [_menu_entry(key) for key in order if key in MENU_CATALOG],
        "pool": [_menu_entry(key) for key in DEFAULT_MENU_ORDER if key not in order and key != "shop" and key in MENU_CATALOG],
        "layout": layout if layout in {"classic", "compact"} else "compact",
        "layouts": list(MENU_LAYOUTS),
        "switches": [
            {"key": key, "on": str(values.get(key, default)).lower() in TRUE_VALUES}
            for key, default in MENU_SWITCHES
        ],
    }


async def appearance_extra(session: AsyncSession) -> dict[str, Any]:
    env = current_setup_values()
    context = await load_appearance_context(
        session,
        token=(env.get("BOT_TOKEN") or "").strip(),
        fallback_username=(env.get("BOT_USERNAME") or "").strip(),
    )
    appearance = context["appearance"]
    photo = str(appearance.get("bot_tg_photo") or "")
    return {
        "name": appearance.get("bot_tg_name") or "",
        "short_description": appearance.get("bot_tg_short_description") or "",
        "description": appearance.get("bot_tg_description") or "",
        "username": appearance.get("bot_username") or "",
        "photo_url": f"/media/{photo}" if photo else "",
        "sync_ok": bool(context.get("appearance_sync_ok")),
        "sync_error": context.get("appearance_sync_err") or "",
    }


async def miniapp_extra(session: AsyncSession) -> dict[str, Any]:
    values = await get_all_settings(session)
    saved = (values.get(ACCENT_SETTING, "") or "").lower()
    presets = [{"value": colour, "label": title} for colour, title in ACCENT_PRESETS]
    return {
        "accent": saved if saved in {item["value"] for item in presets} else "",
        "presets": presets,
        "notice": values.get(NOTICE_SETTING, "") or "",
        "notice_max": NOTICE_MAX,
        "shops_enabled": str(values.get(PLATFORM_SWITCH, "0")).lower() in TRUE_VALUES,
        "miniapp_url": get_settings().miniapp_url or "",
    }


async def guides_extra(session: AsyncSession) -> dict[str, Any]:
    return {
        "media": await guides_media_view(session, GUIDE_MEDIA_BASE, reseller_id=None),
        "media_base": GUIDE_MEDIA_BASE,
    }


# Tabs whose extra data needs the API layer (the keyboard defaults, the guide-media routes, the bot's profile).
ExtraBuilder = Callable[[AsyncSession], Awaitable[dict[str, Any]]]
EXTRA_BUILDERS: dict[str, ExtraBuilder] = {
    "menu": menu_extra,
    "appearance": appearance_extra,
    "miniapp": miniapp_extra,
    "guides": guides_extra,
}


def register_panel_settings_api(
    app: FastAPI,
    *,
    require_staff: Callable[..., Any],
    require_admin: Callable[..., Any],
    require_perm: Callable[[str], Callable[..., Any]],
    require_pg_perm: Callable[[str], Callable[..., Any]],
    get_db: Callable[..., Any],
) -> None:
    """Register this domain's ``/api/panel/...`` endpoints."""

    @app.get("/api/panel/settings")
    async def settings_tab(
        tab: str | None = None,
        staff: dict = Depends(require_admin),
        session: AsyncSession = Depends(get_db),
    ) -> JSONResponse:
        route = resolve_tab(tab)
        if route.redirect:
            return JSONResponse({"redirect": route.redirect}, headers=NO_STORE)
        payload = await tab_payload(session, staff, route.tab)
        builder = EXTRA_BUILDERS.get(route.tab)
        if builder:
            payload["extra"] = await builder(session)
        return JSONResponse(payload, headers=NO_STORE)
