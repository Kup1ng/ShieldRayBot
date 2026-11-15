"""JSON data of the React bot-settings screens: Owner only, no secrets, same fields and values the old page showed."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

from fastapi.responses import HTMLResponse
from sqlalchemy import update
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.db.models import ResellerSetting, Setting
from app.services import settings_panel
from app.services.rich_text import pack_rich_text
from app.services.users import (
    DEFAULT_SETTINGS,
    SETTING_VISIBILITY,
    SETTINGS_DOMAIN_REDIRECTS,
    SETTINGS_TABS,
    clear_settings_cache,
)
from tests.settings_json import settings_fields, settings_group, settings_url
from tests.test_update_owner_only import OWNER_SESSION, PG_STAFF_SESSION, PRINCIPAL_SESSION, SHOP_SESSION, RoutesHarness

BOT_TOKEN = "123456:SECRET-BOT-TOKEN-VALUE"
PG_PASSWORD = "PG-PASSWORD-SECRET"
PG_API_KEY = "PG-API-KEY-SECRET-0123456789"
BBC_SECRET = "BBC-KEY-SECRET"
SHOP_TEXT = "SHOP-ONLY-WELCOME-TEXT"
TG_FILE_ID = "TG-FILE-ID-SECRET"
MEDIA_PHOTO, MEDIA_VIDEO = "a1b2c3d4e5f6", "0a1b2c3d4e5f"
STORED_FILE = "0123456789abcdef0123456789abcdef.jpg"
ENV = {
    "BOT_TOKEN": BOT_TOKEN,
    "BOT_USERNAME": "my_bot",
    "ADMIN_IDS": "11,22",
    "PG_BASE_URL": "https://pg.example.com",
    "PG_SUBSCRIPTION_PATH": "/sub",
    "PG_USERNAME": "robot",
    "PG_PASSWORD": PG_PASSWORD,
    "PG_API_KEY": PG_API_KEY,
    "PUBLIC_BASE_URL": "https://panel.example.com",
    "WEBHOOK_URL": "",
    "WEBHOOK_PATH": "/telegram/webhook",
    "BOT_UPDATE_MODE": "polling",
}
BOT_TABS = [key for key, _label in SETTINGS_TABS]


class SettingsApiCase(RoutesHarness):
    async def asyncSetUp(self) -> None:
        await super().asyncSetUp()
        clear_settings_cache()
        self.addCleanup(clear_settings_cache)
        self.Session = async_sessionmaker(self.engine, expire_on_commit=False)
        async with self.Session() as session:
            session.add_all(
                [
                    Setting(key="bbc_api_key", value=BBC_SECRET),
                    ResellerSetting(reseller_user_id=5, key="welcome_text", value=SHOP_TEXT),
                ]
            )
            await session.commit()
        clear_settings_cache()
        for target, value in (
            ("app.services.settings_panel.current_setup_values", lambda: dict(ENV)),
            ("app.api.panel_settings_api.current_setup_values", lambda: dict(ENV)),
            ("app.services.settings_panel.check_bot_connection", AsyncMock(return_value={"ok": True, "username": "my_bot", "id": 7, "error": None})),
            ("app.services.settings_panel.build_magic_links_context", AsyncMock(return_value={"bot_username": "my_bot", "links": {"renew": "https://t.me/my_bot?start=renew", "wallet": None}})),
        ):
            patcher = patch(target, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    async def tab(self, tab: str, session: dict | None = None):
        return await self.call(session or OWNER_SESSION, "GET", settings_url(tab))

    async def body(self, tab: str) -> dict:
        response = await self.tab(tab)
        self.assertEqual(response.status_code, 200, tab)
        return response.json()


class AccessTests(SettingsApiCase):
    async def test_a_shop_owner_cannot_read_the_platform_settings(self) -> None:
        response = await self.tab("welcome", SHOP_SESSION)
        self.assertEqual(response.status_code, 303)
        self.assertEqual(response.headers["location"], "/home")
        self.assertNotIn(SHOP_TEXT, response.text)

    async def test_other_staff_roles_are_turned_away(self) -> None:
        for payload in (PRINCIPAL_SESSION, PG_STAFF_SESSION):
            response = await self.tab("bot", payload)
            self.assertEqual(response.status_code, 303, payload["role"])
            self.assertTrue(response.headers["location"].startswith("/login"), payload["role"])

    async def test_without_a_session_nothing_is_served(self) -> None:
        response = await self.client.get(settings_url("bot"))
        self.assertIn(response.status_code, {303, 401, 403})
        self.assertNotIn(BOT_TOKEN, response.text)

    async def test_the_owner_never_sees_a_shops_own_settings(self) -> None:
        for tab in ("welcome", "messages", "limits"):
            self.assertNotIn(SHOP_TEXT, (await self.tab(tab)).text, tab)
        self.assertEqual(settings_fields(await self.body("welcome"))["welcome_text"]["value"], DEFAULT_SETTINGS["welcome_text"])


class PageShellTests(SettingsApiCase):
    async def test_the_page_serves_the_react_shell_and_keeps_the_legacy_redirects(self) -> None:
        with patch("app.api.app.spa_response", lambda page: HTMLResponse(f"shell:{page}")):
            page = await self.call(OWNER_SESSION, "GET", "/settings?tab=messages")
            moved = await self.call(OWNER_SESSION, "GET", "/settings?tab=payment&saved=1")
            security = await self.call(OWNER_SESSION, "GET", "/settings?tab=security")
            shop = await self.call(SHOP_SESSION, "GET", "/settings?tab=messages")
        self.assertEqual(page.text, "shell:settings")
        self.assertEqual(moved.status_code, 303)
        self.assertTrue(moved.headers["location"].startswith("/finance?tab=orders&settings=payment"))
        self.assertIn("saved=1", moved.headers["location"])
        self.assertEqual(security.headers["location"], "/security")
        self.assertEqual((shop.status_code, shop.headers["location"]), (303, "/home"))


class TabRoutingTests(SettingsApiCase):
    async def test_every_bot_tab_answers_with_its_navigation(self) -> None:
        for tab in BOT_TABS:
            body = await self.body(tab)
            self.assertEqual(body["tab"], tab)
            self.assertEqual(body["nav"]["kind"], "bot")
            active = [group for group in body["nav"]["groups"] if group["is_active"]]
            self.assertEqual(len(active), 1, tab)
            self.assertIn(tab, [item["key"] for item in active[0]["tabs"]])

    async def test_the_nav_offers_every_tab_once_and_the_variables_page_as_a_link(self) -> None:
        nav = (await self.body("welcome"))["nav"]
        tabs = [item for group in nav["groups"] for item in group["tabs"]]
        self.assertEqual(sorted(item["key"] for item in tabs if item["href"] is None), sorted(BOT_TABS))
        variables = [item for item in tabs if item["href"]]
        self.assertEqual([(item["key"], item["href"]) for item in variables], [("variables", "/message-variables")])

    async def test_a_panel_tab_gets_only_the_navigation(self) -> None:
        body = await self.body("general")
        self.assertEqual(set(body), {"tab", "nav"})
        self.assertEqual([item["key"] for item in body["nav"]["panel_tabs"]], ["general", "backup", "pwa", "ssl", "update"])
        self.assertEqual(body["nav"]["security_href"], "/security")

    async def test_legacy_tabs_redirect_to_the_page_that_owns_them(self) -> None:
        for tab, target in SETTINGS_DOMAIN_REDIRECTS.items():
            self.assertEqual((await self.body(tab)), {"redirect": target}, tab)
        self.assertEqual(await self.body("users"), {"redirect": "/settings?tab=naming"})
        self.assertEqual(await self.body("security"), {"redirect": "/security"})

    async def test_an_unknown_tab_shows_the_first_one(self) -> None:
        self.assertEqual((await self.body("nonsense"))["tab"], "welcome")
        self.assertEqual((await self.body(""))["tab"], "welcome")


class FieldTests(SettingsApiCase):
    async def test_a_tabs_fields_carry_kind_help_and_the_saved_value(self) -> None:
        async with self.Session() as session:
            session.add(Setting(key="shop_title", value="فروشگاه من"))
            await session.commit()
        clear_settings_cache()
        fields = settings_fields(await self.body("welcome"))
        self.assertEqual(fields["shop_title"]["value"], "فروشگاه من")
        self.assertEqual(fields["welcome_text"]["kind"], "textarea")
        self.assertTrue(fields["welcome_text"]["help"])
        # Placeholders the text accepts, for the editor's validation hint.
        self.assertIn("user_name", fields["welcome_text"]["variables"])

    async def test_switches_selects_and_numbers_keep_their_types(self) -> None:
        body = await self.body("service_import")
        fields = settings_fields(body)
        self.assertIsInstance(fields["service_import_enabled"]["value"], bool)
        self.assertEqual({option["value"] for option in fields["service_import_mode"]["options"]}, {"instant", "approval"})
        self.assertEqual(fields["service_import_max_per_user"]["kind"], "number")
        self.assertEqual(fields["service_import_paths"]["kind"], "list")
        notifications = settings_fields(await self.body("notifications"))
        self.assertEqual((notifications["user_alert_low_traffic_pct"]["min"], notifications["user_alert_low_traffic_pct"]["max"]), (1, 99))

    async def test_a_field_tied_to_another_carries_its_rule(self) -> None:
        key, (controller, values) = next(iter(SETTING_VISIBILITY.items()))
        group = (key, "برچسب", "number", "")
        payload = settings_panel.field_payload(group, {controller: "0", key: "5"}, {})
        self.assertEqual(payload["show_when"], {"key": controller, "values": list(values)})
        self.assertEqual(payload["value"], "5")

    async def test_a_saved_secret_is_never_sent_only_that_one_exists(self) -> None:
        payload = settings_panel.field_payload(("bbc_api_key", "کلید", "password", ""), {"bbc_api_key": BBC_SECRET}, {})
        self.assertEqual((payload["value"], payload["has_value"]), ("", True))
        empty = settings_panel.field_payload(("bbc_api_key", "کلید", "password", ""), {}, {})
        self.assertFalse(empty["has_value"])

    async def test_premium_emoji_texts_arrive_as_plain_text(self) -> None:
        async with self.Session() as session:
            session.add(Setting(key="btn_wallet", value=pack_rich_text("👍 کیف پول من", [])))
            await session.commit()
        clear_settings_cache()
        text = (await self.tab("buttons")).text
        self.assertNotIn("RICH1", text)

    async def test_a_group_warning_travels_with_its_group(self) -> None:
        body = await self.body("limits")
        self.assertIn("ادمین", settings_group(body, "کانال اجباری")["notice"]["title"])
        self.assertTrue(settings_group(body, "کانال اجباری")["notice"]["items"])
        self.assertIsNone(settings_group(body, "اکانت تست")["notice"])

    async def test_resettable_tabs_say_so_with_their_confirmation(self) -> None:
        for tab, expected in (("welcome", True), ("messages", True), ("buttons", True), ("colors", True), ("menu", True), ("screens", True), ("limits", False), ("bot", False)):
            self.assertEqual((await self.body(tab))["can_reset"], expected, tab)
        self.assertIn("چیدمان", (await self.body("menu"))["reset_confirm"])

    async def test_no_tab_leaks_a_secret_setting_or_the_environment(self) -> None:
        for tab in BOT_TABS:
            text = (await self.tab(tab)).text
            for secret in (BBC_SECRET, BOT_TOKEN, PG_PASSWORD, PG_API_KEY):
                self.assertNotIn(secret, text, (tab, secret))


class SpecialTabTests(SettingsApiCase):
    async def test_the_colors_tab_sends_the_catalog_sections_not_the_generic_groups(self) -> None:
        body = await self.body("colors")
        self.assertEqual(body["groups"], [])
        sections = body["extra"]["sections"]
        self.assertTrue(sections)
        keys = [item["key"] for section in sections for group in section["groups"] for item in group["items"]]
        self.assertIn("btn_style_home", keys)
        self.assertTrue(all(key.startswith("btn_style_") for key in keys))
        self.assertEqual({option["value"] for option in body["extra"]["style_options"]}, {"", "primary", "success", "danger"})

    async def test_the_menu_tab_lists_the_active_buttons_and_the_storage(self) -> None:
        async with self.Session() as session:
            session.add(Setting(key="menu_order", value="wallet,bogus"))
            await session.commit()
        clear_settings_cache()
        extra = (await self.body("menu"))["extra"]
        # The shop button is always present and first; unknown entries are dropped.
        self.assertEqual([item["key"] for item in extra["items"]], ["shop", "wallet"])
        self.assertTrue(extra["items"][0]["required"])
        self.assertNotIn("shop", [item["key"] for item in extra["pool"]])
        self.assertIn("support", [item["key"] for item in extra["pool"]])
        self.assertEqual({item["key"] for item in extra["switches"]}, {"chat_cleanup_enabled", "menu_keyboard_persistent", "show_restart_button"})
        self.assertIn(extra["layout"], {"classic", "compact"})

    async def test_the_notifications_tab_reports_the_saved_switches(self) -> None:
        extra = (await self.body("notifications"))["extra"]
        self.assertTrue(extra["items"])
        self.assertTrue(all(set(item) == {"key", "title", "help", "on"} for item in extra["items"]))
        self.assertTrue(all(item["key"].startswith("notify_") for item in extra["items"]))

    async def test_the_daily_report_tab_fills_an_empty_template_and_lists_the_metrics(self) -> None:
        async with self.Session() as session:
            session.add(Setting(key="admin_daily_report_template", value=""))
            await session.commit()
        clear_settings_cache()
        body = await self.body("daily_report")
        self.assertTrue(settings_fields(body)["admin_daily_report_template"]["value"].strip())
        metrics = [metric for group in body["extra"]["metric_groups"] for metric in group["metrics"]]
        self.assertTrue(metrics)
        self.assertTrue(set(body["extra"]["enabled_metrics"]) <= {metric["key"] for metric in metrics})
        self.assertIn("admin_daily_report_template", body["preview_values"])

    async def test_the_miniapp_tab_shows_a_preset_accent_and_ignores_anything_else(self) -> None:
        extra = (await self.body("miniapp"))["extra"]
        preset = extra["presets"][0]["value"]
        async with self.Session() as session:
            session.add(Setting(key="miniapp_accent_color", value=preset.upper()))
            await session.commit()
        clear_settings_cache()
        self.assertEqual((await self.body("miniapp"))["extra"]["accent"], preset)
        async with self.Session() as session:
            await session.execute(update(Setting).where(Setting.key == "miniapp_accent_color").values(value="#123456"))
            await session.commit()
        clear_settings_cache()
        self.assertEqual((await self.body("miniapp"))["extra"]["accent"], "")

    async def test_the_links_tab_carries_the_bots_deep_links(self) -> None:
        extra = (await self.body("links"))["extra"]
        self.assertEqual(extra["bot_username"], "my_bot")
        self.assertEqual(extra["links"]["renew"], "https://t.me/my_bot?start=renew")

    async def test_the_bot_tab_shows_the_connection_without_its_secrets(self) -> None:
        response = await self.tab("bot")
        extra = response.json()["extra"]
        self.assertEqual(extra["bot_username"], "my_bot")
        self.assertEqual(extra["admin_ids"], "11,22")
        self.assertEqual(extra["pg_username"], "robot")
        self.assertTrue(extra["has_pg_api_key"])
        self.assertEqual(extra["bot_status"], {"ok": True, "username": "my_bot", "id": 7, "error": ""})
        self.assertEqual(extra["update_mode"], "polling")
        self.assertEqual(extra["token_masked"], "••••" + BOT_TOKEN[-6:])
        for secret in (BOT_TOKEN, PG_PASSWORD, PG_API_KEY):
            self.assertNotIn(secret, response.text)

    async def test_an_offline_bot_shows_the_reason_and_a_webhook_mode_shows_its_address(self) -> None:
        env = {**ENV, "WEBHOOK_URL": "https://bot.example.com", "WEBHOOK_PATH": "/hook", "BOT_UPDATE_MODE": "webhook"}
        offline = AsyncMock(return_value={"ok": False, "error": "عدم اتصال به تلگرام", "detail": f"raw {BOT_TOKEN}"})
        with patch("app.services.settings_panel.current_setup_values", lambda: env), patch("app.services.settings_panel.check_bot_connection", offline):
            response = await self.tab("bot")
        extra = response.json()["extra"]
        self.assertEqual(extra["bot_status"]["error"], "عدم اتصال به تلگرام")
        self.assertEqual((extra["update_mode"], extra["webhook_full_url"]), ("webhook", "https://bot.example.com/hook"))
        self.assertNotIn(BOT_TOKEN, response.text)

    async def test_the_appearance_tab_reads_the_bots_profile_and_survives_telegram_being_down(self) -> None:
        down = AsyncMock(
            return_value={
                "appearance": {"bot_tg_name": "نام", "bot_tg_short_description": "کپشن", "bot_tg_description": "متن", "bot_tg_photo": "uploads/p.jpg", "bot_username": "my_bot"},
                "appearance_sync_ok": False,
                "appearance_sync_err": "خواندن از تلگرام ناموفق",
            }
        )
        with patch("app.api.panel_settings_api.load_appearance_context", down):
            extra = (await self.body("appearance"))["extra"]
        self.assertEqual((extra["name"], extra["short_description"], extra["description"]), ("نام", "کپشن", "متن"))
        self.assertEqual(extra["photo_url"], "/media/uploads/p.jpg")
        self.assertFalse(extra["sync_ok"])
        self.assertTrue(extra["sync_error"])

    async def test_the_guides_tab_never_sends_stored_media_ids_or_files(self) -> None:
        guides = [{"id": "g1", "title": "V2Box", "body": "متن", "audience": "user", "enabled": True, "sort": 0, "deep_link": True, "style": "primary",
                   "media": [{"id": MEDIA_PHOTO, "kind": "photo", "file": STORED_FILE}, {"id": MEDIA_VIDEO, "kind": "video", "tg": {"1": TG_FILE_ID}}]}]
        async with self.Session() as session:
            session.add(Setting(key="connection_guides", value=json.dumps(guides)))
            await session.commit()
        clear_settings_cache()
        response = await self.tab("guides")
        body = response.json()
        shown = json.loads(settings_fields(body)["connection_guides"]["value"])
        self.assertEqual([guide["id"] for guide in shown], ["g1"])
        self.assertNotIn("media", shown[0])
        self.assertNotIn(TG_FILE_ID, response.text)
        self.assertEqual(body["extra"]["media_base"], "/settings/guides/media")
        self.assertEqual({item["id"] for item in body["extra"]["media"]["g1"]}, {MEDIA_PHOTO, MEDIA_VIDEO})
        self.assertNotIn(STORED_FILE, json.dumps(settings_fields(body)))

    async def test_the_guides_tab_starts_from_the_starter_guides_when_none_are_saved(self) -> None:
        shown = json.loads(settings_fields(await self.body("guides"))["connection_guides"]["value"])
        self.assertTrue(shown)
        self.assertTrue(all("media" not in guide for guide in shown))

    async def test_chat_preview_tabs_get_only_the_values_the_preview_reads(self) -> None:
        for tab in ("welcome", "messages", "buttons", "qr", "menu", "daily_report"):
            body = await self.body(tab)
            self.assertEqual(body["preview"], "chat", tab)
            self.assertTrue(set(body["preview_values"]) <= set(settings_panel.PREVIEW_KEYS), tab)
        self.assertEqual((await self.body("appearance"))["preview"], "profile")
        self.assertIsNone((await self.body("limits"))["preview"])
        self.assertEqual((await self.body("limits"))["preview_values"], {})
