"""Reseller-facing shop bot settings (web panel subset)."""

from __future__ import annotations

import logging
import uuid
from pathlib import Path
from urllib.parse import quote

from fastapi import Depends, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.datastructures import UploadFile

from app.api.safe_next import safe_internal_next
from app.api.shop_settings_panel import NO_SCOPE_MESSAGE, entry_redirect, load_profile, normalize_tab
from app.api.spa_pages import spa_response
from app.config import DATA_DIR
from app.services.bbc_settlement import bbc_enable_error
from app.services.chat_cleanup_config import chat_cleanup_payload
from app.services.connection_guides import prune_guide_media, serialize_submitted_guides
from app.services.miniapp_shop import (
    SHOP_SWITCH,
    set_shop_miniapp,
    switch_value,
)
from app.services.reseller_bots import schedule_shop_menu_sync
from app.services.resellers import (
    RESELLER_SETTINGS_TABS,
    SHOP_SETTINGS_DOMAIN_POST_TABS,
    complete_reseller_setup,
    get_reseller_profile,
)
from app.services.rich_text import merge_rich_settings_on_save
from app.services.screen_titles import SCREEN_TEXT_TAB, platform_only_screen_text_keys, validate_screen_text_settings
from app.services.secret_box import reveal_bot_token
from app.services.settings_button_labels import PLATFORM_ONLY_BTN_KEYS
from app.services.users import (
    IMAGE_KEYS,
    PLATFORM_ONLY_SETTING_KEYS,
    RESETTABLE_SETTINGS_TABS,
    SECRET_KEYS,
    TOGGLE_KEYS,
    default_values_for_keys,
    get_all_settings,
    keys_for_tab,
    set_settings_bulk,
    should_keep_secret_value,
)


logger = logging.getLogger(__name__)

def register_shop_settings(app, *, render, require_staff, get_db, require_shop_settings=None):
    allowed_tabs = {t[0] for t in RESELLER_SETTINGS_TABS}
    post_tabs = allowed_tabs | set(SHOP_SETTINGS_DOMAIN_POST_TABS)
    shop_dep = require_shop_settings or require_staff

    def _safe_next(request: Request, fallback: str) -> str:
        return safe_internal_next(request.query_params.get("next"), fallback)

    def _redirect_after_save(request: Request, fallback: str, *, msg: str | None = None) -> RedirectResponse:
        dest = _safe_next(request, fallback)
        sep = "&" if "?" in dest else "?"
        url = f"{dest}{sep}saved=1"
        if msg:
            url += f"&msg={quote(msg)}"
        return RedirectResponse(url, status_code=303)

    def _rid(staff: dict) -> int | None:
        """Server-side shop tenant only (session → shop_owner_id). Never form/query."""
        from app.services.shop_scope import shop_owner_id

        return shop_owner_id(staff)

    def _is_owner_settings_actor(staff: dict) -> bool:
        """Real Owner (or legacy role=admin chrome) → platform /settings, not shop."""
        from app.services.shop_scope import is_platform_admin

        return bool(is_platform_admin(staff) or staff.get("role") == "admin")

    def _deny_scope() -> RedirectResponse:
        return RedirectResponse(
            "/dashboard?err=" + quote(NO_SCOPE_MESSAGE),
            status_code=303,
        )

    @app.get("/shop-settings", response_class=HTMLResponse)
    async def shop_settings_page(
        request: Request,
        staff: dict = Depends(shop_dep),
    ):
        # The page is the React app; its data comes from /api/panel/shop-settings. Scope comes from the
        # authenticated session only (not role == "reseller" alone), and moved tabs still redirect.
        moved = entry_redirect(staff, normalize_tab(request.query_params.get("tab")), request.query_params)
        if moved:
            return RedirectResponse(moved, status_code=303)
        return spa_response("shop-settings")

    @app.post("/shop-settings")
    async def shop_settings_save(
        request: Request,
        staff: dict = Depends(shop_dep),
        session: AsyncSession = Depends(get_db),
    ):
        if _is_owner_settings_actor(staff):
            return RedirectResponse("/settings", status_code=303)
        rid = _rid(staff)
        if not rid:
            return _deny_scope()
        tab = (request.query_params.get("tab") or "welcome").strip()
        if tab not in post_tabs:
            return RedirectResponse("/shop-settings", status_code=303)

        form = await request.form()
        # Ignore any client-supplied reseller_id — authority is session scope only.
        profile = await load_profile(session, rid)
        if not profile:
            return RedirectResponse("/logout", status_code=303)

        if tab == "bot":
            token = str(form.get("BOT_TOKEN") or "").strip()
            if not token:
                return RedirectResponse(
                    "/shop-settings?tab=bot&err=" + quote("توکن ربات الزامی است"),
                    status_code=303,
                )
            try:
                from aiogram import Bot

                bot = Bot(token=token)
                try:
                    me = await bot.get_me()
                    uname = me.username or str(me.id)
                    tg_id = int(me.id)
                finally:
                    await bot.session.close()
                await complete_reseller_setup(
                    session,
                    profile,
                    bot_token=token,
                    bot_username=uname,
                    bot_telegram_id=tg_id,
                    bot_only=True,
                )
                from app.services.reseller_bots import start_reseller_bot_for_profile

                await start_reseller_bot_for_profile(profile.id)
            except ValueError as e:
                return RedirectResponse(
                    "/shop-settings?tab=bot&err=" + quote(str(e)),
                    status_code=303,
                )
            except Exception:
                return RedirectResponse(
                    "/shop-settings?tab=bot&err=" + quote("توکن ربات نامعتبر است"),
                    status_code=303,
                )
            return RedirectResponse("/shop-settings?tab=bot&saved=1", status_code=303)

        if tab == "appearance":
            from app.services.bot_appearance import save_appearance_from_form

            token = (reveal_bot_token(profile.bot_token) or "").strip()
            if not token:
                return RedirectResponse(
                    "/shop-settings?tab=appearance&err="
                    + quote("ابتدا توکن ربات اختصاصی را در تب «ربات اختصاصی» ذخیره کنید"),
                    status_code=303,
                )
            ok, msg = await save_appearance_from_form(
                session,
                form,
                token=token,
                reseller_id=rid,
                upload_prefix=f"r{rid}",
            )
            if not ok:
                return RedirectResponse(
                    "/shop-settings?tab=appearance&err=" + quote(msg),
                    status_code=303,
                )
            # The shop bot's «Open» button follows its own Mini App, never the platform's.
            schedule_shop_menu_sync([int(profile.id)])
            return RedirectResponse(
                "/shop-settings?tab=appearance&saved=1&msg=" + quote(msg),
                status_code=303,
            )

        from app.services.service_import_config import PLATFORM_ONLY_KEYS

        # Subscription paths and extra panel admins describe the one panel: Owner only.
        known = keys_for_tab(tab) - PLATFORM_ONLY_KEYS - PLATFORM_ONLY_BTN_KEYS - PLATFORM_ONLY_SETTING_KEYS
        if tab == "menu":
            known = known | {"menu_order"}
            known.discard("show_reseller_apply")
        if tab == "colors":
            # ACL: shop may only persist reseller-allowed btn_style_* (no admin leak).
            from app.services.button_styles import allowed_style_setting_keys

            known = known & allowed_style_setting_keys(for_reseller=True)
        known -= platform_only_screen_text_keys()
        if tab == "menu" and form.get("reset_defaults"):
            from app.bot.keyboards import default_menu_layout_settings

            await set_settings_bulk(session, default_menu_layout_settings(for_shop=True), reseller_id=rid)
            return _redirect_after_save(request, "/shop-settings?tab=menu", msg="چیدمان منو به پیش‌فرض برگشت.")
        if form.get("reset_defaults") and tab in RESETTABLE_SETTINGS_TABS:
            await set_settings_bulk(session, default_values_for_keys(known), reseller_id=rid)
            return _redirect_after_save(
                request, f"/shop-settings?tab={tab}", msg="متن‌ها و رنگ‌های این بخش به پیش‌فرض برگشت."
            )

        payload: dict[str, str] = {}
        for key in TOGGLE_KEYS:
            if key in known:
                payload[key] = "1" if form.get(f"s_{key}") else "0"
        for key in known:
            if key in TOGGLE_KEYS or key in IMAGE_KEYS:
                continue
            raw = form.get(f"s_{key}")
            if raw is not None and not isinstance(raw, UploadFile):
                val = str(raw)
                if key in SECRET_KEYS and should_keep_secret_value(val):
                    continue
                if key.startswith("btn_style_"):
                    from app.services.button_styles import normalize_style

                    val = normalize_style(val)
                if key in ("user_alert_low_traffic_pct", "user_alert_low_time_pct"):
                    from app.services.users import clamp_alert_percent

                    val = clamp_alert_percent(val)
                if key == "force_join_channel":
                    from app.services.users import normalize_force_join_channel_value

                    val = normalize_force_join_channel_value(val)
                if key == "connection_guides":
                    val = await serialize_submitted_guides(session, val, reseller_id=rid)
                if key == "receipt_dup_policy":
                    from app.services.receipt_fingerprints import normalize_dup_policy

                    val = normalize_dup_policy(val)
                if key.startswith("service_import_"):
                    from app.services.service_import_config import normalize_setting_value

                    val = normalize_setting_value(key, val)
                payload[key] = val

        if tab == "daily_report":
            from app.services.daily_report import (
                ACTOR_SHOP,
                metrics_for_actor,
                serialize_metric_keys,
            )

            chosen = [
                m.key
                for m in metrics_for_actor(ACTOR_SHOP)
                if form.get(f"m_{m.key}")
            ]
            payload["admin_daily_report_metrics"] = serialize_metric_keys(
                chosen, actor=ACTOR_SHOP
            )

        uploads = DATA_DIR / "uploads"
        uploads.mkdir(parents=True, exist_ok=True)
        max_image_bytes = 5 * 1024 * 1024
        for key in IMAGE_KEYS:
            if key not in known:
                continue
            if form.get(f"s_{key}_clear"):
                payload[key] = ""
                continue
            upload = form.get(f"s_{key}")
            if isinstance(upload, UploadFile) and upload.filename:
                name = upload.filename.lower()
                ext = Path(name).suffix
                if ext not in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
                    continue
                dest_name = f"r{rid}_{key}_{uuid.uuid4().hex[:10]}{ext}"
                dest = uploads / dest_name
                content = await upload.read(max_image_bytes + 1)
                if len(content) > max_image_bytes:
                    continue
                if content:
                    dest.write_bytes(content)
                    payload[key] = f"uploads/{dest_name}"

        # Always keep apply button off on reseller shops
        payload["show_reseller_apply"] = "0"
        # Never allow notify_* smuggling into ResellerSetting via generic settings save
        # (shop notify prefs go through /shop-notifications with an ACL allowlist).
        for k in list(payload.keys()):
            if str(k).startswith("notify_"):
                payload.pop(k, None)
        # Never allow admin-only btn_style_* smuggling into ResellerSetting.
        from app.services.button_styles import allowed_style_setting_keys

        allowed_btn = allowed_style_setting_keys(for_reseller=True)
        for k in list(payload.keys()):
            if str(k).startswith("btn_style_") and k not in allowed_btn:
                payload.pop(k, None)
        gateway_error = await bbc_enable_error(session, payload, reseller_id=rid) if tab == "payment" else None
        if gateway_error:
            back = _safe_next(request, "/shop-settings?tab=payment")
            return RedirectResponse(f"{back}{'&' if '?' in back else '?'}err=" + quote(gateway_error), status_code=303)
        if tab == SCREEN_TEXT_TAB:
            try:
                validate_screen_text_settings(payload)
            except ValueError as exc:
                return RedirectResponse(f"/shop-settings?tab={tab}&err=" + quote(str(exc)), status_code=303)
        # Unchanged text keeps the premium emoji it was saved with in the bot.
        existing = await get_all_settings(session, reseller_id=rid)
        payload = merge_rich_settings_on_save(existing, payload)
        await set_settings_bulk(session, payload, reseller_id=rid)
        if "connection_guides" in payload:
            await prune_guide_media(session, reseller_id=rid)
        return _redirect_after_save(request, f"/shop-settings?tab={tab}")

    @app.post("/shop-notifications")
    async def shop_notifications_save(
        request: Request,
        staff: dict = Depends(shop_dep),
        session: AsyncSession = Depends(get_db),
    ):
        """Save shop Telegram notify prefs — ResellerSetting only, ACL-filtered."""
        if _is_owner_settings_actor(staff):
            return RedirectResponse("/settings", status_code=303)
        rid = _rid(staff)
        if not rid:
            return _deny_scope()
        profile = await load_profile(session, rid)
        if not profile:
            return RedirectResponse("/logout", status_code=303)

        from app.services.authz import resolve_shop_permissions_from_profile
        from app.services.notifications import (
            PLATFORM_ONLY_NOTIFY_KEYS,
            save_shop_notify_prefs,
            shop_notify_allowed_keys,
        )

        perms = list(staff.get("permissions") or []) or list(
            resolve_shop_permissions_from_profile(profile) or []
        )
        allowed = shop_notify_allowed_keys(perms)
        # Belt-and-suspenders: never accept platform-only keys from the form
        allowed -= set(PLATFORM_ONLY_NOTIFY_KEYS)

        form = await request.form()
        await save_shop_notify_prefs(
            session,
            rid,
            dict(form),
            allowed_keys=allowed,
        )
        return RedirectResponse(
            "/shop-settings?tab=notifications&saved=1&msg="
            + quote("نوتیفیکیشن‌های فروشگاه ذخیره شد"),
            status_code=303,
        )

    @app.post("/shop-settings/miniapp")
    async def shop_miniapp_save(
        request: Request,
        staff: dict = Depends(shop_dep),
        session: AsyncSession = Depends(get_db),
    ):
        """The shop owner turns the shop's Mini App on or off; the shop comes from the session."""
        if _is_owner_settings_actor(staff):
            return RedirectResponse("/settings", status_code=303)
        rid = _rid(staff)
        profile = await get_reseller_profile(session, rid) if rid else None
        if profile is None:
            return _deny_scope()
        form = await request.form()
        try:
            await set_shop_miniapp(session, profile, enabled=switch_value(form, SHOP_SWITCH) == "1")
        except ValueError as exc:
            return RedirectResponse(f"/shop-settings?tab=miniapp&err={quote(str(exc))}", status_code=303)
        schedule_shop_menu_sync([int(profile.id)])
        return RedirectResponse("/shop-settings?tab=miniapp&saved=1", status_code=303)

    @app.post("/shop-settings/menu-layout")
    async def shop_menu_layout_save(
        request: Request,
        staff: dict = Depends(shop_dep),
        session: AsyncSession = Depends(get_db),
    ):
        if _is_owner_settings_actor(staff):
            return RedirectResponse("/settings", status_code=303)
        from app.bot.keyboards import DEFAULT_MENU_ORDER

        rid = _rid(staff)
        if not rid:
            return _deny_scope()
        form = await request.form()
        order = [p.strip() for p in str(form.get("menu_order") or "").split(",") if p.strip()]
        order = [
            k
            for k in order
            if k in DEFAULT_MENU_ORDER and k not in {"reseller_apply", "miniapp"}
        ]
        if "shop" not in order:
            order.insert(0, "shop")
        layout = str(form.get("menu_layout") or "compact").strip()
        from app.bot.keyboards import sync_show_flags_for_order
        from app.services.users import set_settings_bulk

        payload = {"menu_order": ",".join(order), **sync_show_flags_for_order(order)}
        payload["show_reseller_apply"] = "0"
        payload["show_miniapp"] = "0"
        payload.update(chat_cleanup_payload(form))
        if layout in {"classic", "compact"}:
            payload["menu_layout"] = layout
        await set_settings_bulk(session, payload, reseller_id=rid)
        return RedirectResponse("/shop-settings?tab=menu&saved=1", status_code=303)

    @app.post("/shop-supports/save")
    async def shop_supports_save(
        request: Request,
        staff: dict = Depends(shop_dep),
        session: AsyncSession = Depends(get_db),
    ):
        if _is_owner_settings_actor(staff):
            return RedirectResponse("/tickets?supports=1&stab=contacts", status_code=303)
        from app.services.support_contacts import contacts_from_form_json, save_support_contacts

        rid = _rid(staff)
        if not rid:
            return _deny_scope()
        form = await request.form()
        raw = form.get("support_contacts")
        if raw is not None:
            contacts, err = contacts_from_form_json(str(raw))
            if err:
                return RedirectResponse(
                    f"/tickets?supports=1&stab=contacts&err={quote(err)}",
                    status_code=303,
                )
            await save_support_contacts(session, contacts or [], reseller_id=rid)
            return RedirectResponse("/tickets?supports=1&stab=contacts&saved=1", status_code=303)

        from app.services.button_styles import parse_item_button_style_form
        from app.services.support_contacts import upsert_support_contact

        contact_id = str(form.get("id") or "").strip() or None
        title = str(form.get("title") or "").strip()
        telegram = str(form.get("telegram") or "").strip()
        try:
            sort = int(str(form.get("sort") or "0").strip() or "0")
        except ValueError:
            sort = 0
        enabled = str(form.get("enabled") or "") in {"1", "on", "true", "yes"}
        if contact_id and "enabled" not in form:
            enabled = False
        button_style = parse_item_button_style_form(form)
        _, err = await upsert_support_contact(
            session,
            contact_id=contact_id,
            title=title,
            telegram=telegram,
            sort=sort,
            enabled=enabled,
            button_style=button_style,
            reseller_id=rid,
        )
        if err:
            return RedirectResponse(
                f"/tickets?supports=1&stab=contacts&err={quote(err)}",
                status_code=303,
            )
        return RedirectResponse("/tickets?supports=1&stab=contacts&saved=1", status_code=303)

    @app.post("/shop-supports/delete")
    async def shop_supports_delete(
        request: Request,
        staff: dict = Depends(shop_dep),
        session: AsyncSession = Depends(get_db),
    ):
        if _is_owner_settings_actor(staff):
            return RedirectResponse("/tickets?supports=1&stab=contacts", status_code=303)
        from app.services.support_contacts import delete_support_contact

        rid = _rid(staff)
        if not rid:
            return _deny_scope()
        form = await request.form()
        contact_id = str(form.get("id") or "").strip()
        if contact_id:
            await delete_support_contact(session, contact_id, reseller_id=rid)
        return RedirectResponse("/tickets?supports=1&stab=contacts&saved=1", status_code=303)
