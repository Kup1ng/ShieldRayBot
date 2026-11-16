"""JSON data of the React shop settings, support and setup pages: permissions, shop isolation, no secrets, bounded lists."""

from __future__ import annotations

import tempfile
import unittest
from collections.abc import AsyncIterator, Callable
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import FastAPI, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.api import spa_pages
from app.api.panel_ops_api import register_panel_ops_api
from app.api.panel_tickets_pages import register_panel_tickets_pages
from app.api.shop_settings import register_shop_settings
from app.db.models import (
    Base,
    BotUser,
    PanelTicket,
    PanelTicketMessage,
    ResellerProfile,
    ResellerSetting,
    Setting,
    Ticket,
    TicketMessage,
)
from app.services import tickets_panel
from app.services.authz import authz_from_staff, can_shop
from app.services.settings_form_payload import field_payload, media_url
from tests.pgtest import pg_engine

OWNER = {"role": "admin", "org_principal_id": 1, "org_depth": 0, "org_parent_id": None, "org_status": "active", "permissions": []}
SHOP_A, SHOP_B = 10, 20
BOT_TOKEN_SECRET = "123456:ABCDEFSECRETTOKENVALUE"
SCRIPT = "<script>alert(1)</script>"


def shop_staff(shop_id: int | None, permissions: list[str] | None = None, **extra: Any) -> dict[str, Any]:
    perms = ["shop_settings", "tickets"] if permissions is None else permissions
    return {"role": "reseller", "bot_user_id": shop_id, "permissions": perms, **extra}


class OpsApiCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.engine = pg_engine()
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        self.session = async_sessionmaker(self.engine, expire_on_commit=False)()
        await self.seed()
        self.staff: dict[str, Any] = dict(OWNER)
        self.app = FastAPI()

        async def get_db() -> AsyncIterator[AsyncSession]:
            yield self.session

        async def require_staff() -> dict[str, Any]:
            return self.staff

        def require_perm(perm: str) -> Callable[..., Any]:
            async def dependency() -> dict[str, Any]:
                if not can_shop(authz_from_staff(self.staff), perm):
                    raise HTTPException(403)
                return self.staff

            return dependency

        register_panel_ops_api(
            self.app, require_staff=require_staff, require_admin=require_staff, require_perm=require_perm,
            require_pg_perm=require_perm, get_db=get_db,
        )
        register_shop_settings(self.app, render=lambda *a, **k: None, require_staff=require_staff, get_db=get_db, require_shop_settings=require_perm("shop_settings"))
        register_panel_tickets_pages(self.app, render=lambda *a, **k: None, require_staff=require_staff, get_db=get_db)
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://panel.test", follow_redirects=False)

    async def asyncTearDown(self) -> None:
        await self.client.aclose()
        await self.session.close()
        await self.engine.dispose()

    async def seed(self) -> None:
        s = self.session
        s.add_all([
            BotUser(id=SHOP_A, telegram_id=5010, referral_code="shopa", role="reseller"),
            BotUser(id=SHOP_B, telegram_id=5020, referral_code="shopb", role="reseller"),
        ])
        await s.flush()
        s.add_all([
            BotUser(id=1, telegram_id=9001, referral_code="c1", full_name="Platform buyer", username="pbuyer"),
            BotUser(id=11, telegram_id=9011, referral_code="c11", full_name="Shop A buyer", reseller_id=SHOP_A),
            BotUser(id=21, telegram_id=9021, referral_code="c21", full_name="Shop B buyer", reseller_id=SHOP_B),
            ResellerProfile(user_id=SHOP_A, is_active=True, bot_token=BOT_TOKEN_SECRET, bot_username="shopabot"),
            ResellerProfile(user_id=SHOP_B, is_active=True, bot_username="shopbbot"),
            ResellerSetting(reseller_user_id=SHOP_A, key="shop_title", value="Shop A title"),
            ResellerSetting(reseller_user_id=SHOP_B, key="shop_title", value="Shop B title"),
            ResellerSetting(reseller_user_id=SHOP_A, key="support_contacts", value='[{"id":"a1","title":"Support A","telegram":"@supporta1","sort":0,"enabled":true}]'),
            ResellerSetting(reseller_user_id=SHOP_B, key="support_contacts", value='[{"id":"b1","title":"Support B","telegram":"@supportb1","sort":0,"enabled":true}]'),
            Setting(key="support_contacts", value='[{"id":"p1","title":"Platform support","telegram":"@platformsup","sort":0,"enabled":true}]'),
        ])
        await s.flush()
        s.add_all([
            PanelTicket(id=1, subject="Shop A ticket", opener_role="reseller", opener_reseller_user_id=SHOP_A, opener_label="shop a", owner_unread=True),
            PanelTicket(id=2, subject="Shop B ticket", opener_role="reseller", opener_reseller_user_id=SHOP_B, opener_label="shop b", owner_unread=True),
            Ticket(id=1, user_id=1, reseller_id=None, subject="Platform customer ticket", status="open"),
            Ticket(id=2, user_id=11, reseller_id=SHOP_A, subject="Shop A customer ticket", status="open"),
            Ticket(id=3, user_id=21, reseller_id=SHOP_B, subject="Shop B customer ticket", status="open"),
        ])
        await s.flush()
        s.add_all([
            PanelTicketMessage(ticket_id=1, sender_role="reseller", sender_label="shop a", body=SCRIPT, attachment_path="private/tickets/t1_secretname.png", attachment_name="shot.png", attachment_mime="image/png"),
            PanelTicketMessage(ticket_id=2, sender_role="reseller", sender_label="shop b", body="B message"),
            TicketMessage(ticket_id=1, sender_id=1, is_staff=False, body="platform hello"),
            TicketMessage(ticket_id=2, sender_id=11, is_staff=False, body=SCRIPT),
            TicketMessage(ticket_id=3, sender_id=21, is_staff=False, body="B customer hello"),
        ])
        await s.commit()

    async def get(self, path: str, staff: dict[str, Any] | None = None) -> httpx.Response:
        if staff is not None:
            self.staff = staff
        return await self.client.get(path)


class FieldPayloadTests(unittest.TestCase):
    def test_secret_values_are_never_sent_only_whether_one_is_saved(self) -> None:
        field = field_payload(("bbc_api_key", "Key", "text"), {"bbc_api_key": "TOP-SECRET"})
        self.assertEqual((field["value"], field["has_value"]), ("", True))
        password = field_payload(("anything", "Pw", "password"), {"anything": "TOP-SECRET"})
        self.assertEqual((password["value"], password["has_value"]), ("", True))

    def test_toggle_select_and_visibility_rules(self) -> None:
        self.assertIs(field_payload(("qr_enabled", "QR", "toggle"), {"qr_enabled": "1"})["value"], True)
        self.assertIs(field_payload(("qr_enabled", "QR", "toggle"), {"qr_enabled": "0"})["value"], False)
        select = field_payload(("receipt_dup_policy", "Policy", "select", "", [("warn", "W"), ("block", "B")]), {})
        self.assertEqual(select["value"], "warn")
        gated = field_payload(("auto_approve_after_minutes", "Min", "number"), {})
        self.assertEqual(gated["show_when"], {"key": "auto_approve_payments", "values": ["1"]})

    def test_uploaded_file_urls_never_leave_the_uploads_folder(self) -> None:
        self.assertEqual(media_url("uploads/r5_qr_background_ab12.png"), "/media/uploads/r5_qr_background_ab12.png")
        for bad in ("../etc/passwd", "/etc/passwd", "uploads/../x", "http://evil.example/x", ""):
            self.assertEqual(media_url(bad), "", bad)

    def test_force_channels_arrive_in_the_json_form_even_from_old_line_lists(self) -> None:
        field = field_payload(("force_join_channel", "Channels", "force_channels"), {"force_join_channel": "@one\n@two"})
        self.assertEqual([entry["id"] for entry in __import__("json").loads(field["value"])], ["@one", "@two"])


class ShopSettingsDataTests(OpsApiCase):
    async def test_a_shop_reads_only_its_own_values(self) -> None:
        body = (await self.get("/api/panel/shop-settings?tab=welcome", shop_staff(SHOP_A))).json()
        fields = {field["key"]: field for section in body["sections"] for field in section["fields"]}
        self.assertEqual(fields["shop_title"]["value"], "Shop A title")
        other = await self.get("/api/panel/shop-settings?tab=welcome", shop_staff(SHOP_B))
        self.assertNotIn("Shop A title", other.text)
        self.assertEqual({f["key"]: f for s in other.json()["sections"] for f in s["fields"]}["shop_title"]["value"], "Shop B title")

    async def test_the_owner_staff_without_a_shop_and_moved_tabs_are_sent_elsewhere(self) -> None:
        owner = await self.get("/api/panel/shop-settings?tab=welcome", dict(OWNER) | {"permissions": ["shop_settings"]})
        self.assertEqual(owner.json(), {"redirect": "/settings"})
        no_shop = await self.get("/api/panel/shop-settings", shop_staff(None))
        self.assertTrue(no_shop.json()["redirect"].startswith("/dashboard?err="))
        self.assertEqual((await self.get("/api/panel/shop-settings?tab=security", shop_staff(SHOP_A))).json(), {"redirect": "/security"})
        moved = await self.get("/api/panel/shop-settings?tab=payment&saved=1&msg=ok", shop_staff(SHOP_A))
        self.assertEqual(moved.json()["redirect"], "/finance?tab=orders&settings=payment&saved=1&msg=ok")

    async def test_staff_without_the_shop_settings_permission_are_refused(self) -> None:
        response = await self.get("/api/panel/shop-settings", shop_staff(SHOP_A, ["tickets"]))
        self.assertEqual(response.status_code, 403)

    async def test_an_unknown_tab_opens_the_first_one(self) -> None:
        body = (await self.get("/api/panel/shop-settings?tab=nope", shop_staff(SHOP_A))).json()
        self.assertEqual(body["tab"], "welcome")
        self.assertTrue(any(tab["key"] == "variables" for group in body["nav"] for tab in group["tabs"]))

    async def test_the_bot_tab_masks_the_token_and_never_sends_it(self) -> None:
        status = {"ok": True, "username": "shopabot", "id": 1, "name": "Shop"}
        with patch("app.api.shop_settings_panel.bot_token_status", new=AsyncMock(return_value=status)):
            response = await self.get("/api/panel/shop-settings?tab=bot", shop_staff(SHOP_A))
        self.assertNotIn(BOT_TOKEN_SECRET, response.text)
        self.assertNotIn("ABCDEF", response.text)
        extra = response.json()["extra"]
        self.assertEqual(extra["token_masked"], "••••" + BOT_TOKEN_SECRET[-6:])
        self.assertEqual(extra["username"], "shopabot")
        self.assertTrue(extra["status"]["ok"])

    async def test_platform_only_buttons_and_colours_never_reach_a_shop(self) -> None:
        from app.services.settings_button_labels import PLATFORM_ONLY_BTN_KEYS

        buttons = await self.get("/api/panel/shop-settings?tab=buttons", shop_staff(SHOP_A))
        keys = {field["key"] for section in buttons.json()["sections"] for field in section["fields"]}
        self.assertFalse(keys & PLATFORM_ONLY_BTN_KEYS)
        colors = (await self.get("/api/panel/shop-settings?tab=colors", shop_staff(SHOP_A))).json()["extra"]
        color_keys = [item["key"] for group in colors["groups"] for item in group["items"]]
        self.assertTrue(color_keys)
        self.assertFalse([key for key in color_keys if key.startswith("btn_style_adm_")])

    async def test_platform_only_setting_groups_never_reach_a_shop(self) -> None:
        from app.services.users import PLATFORM_ONLY_SETTING_GROUPS, PLATFORM_ONLY_SETTING_KEYS

        naming = (await self.get("/api/panel/shop-settings?tab=naming", shop_staff(SHOP_A))).json()
        self.assertTrue(naming["sections"])
        self.assertFalse({section["title"] for section in naming["sections"]} & PLATFORM_ONLY_SETTING_GROUPS)
        keys = {field["key"] for section in naming["sections"] for field in section["fields"]}
        self.assertFalse(keys & PLATFORM_ONLY_SETTING_KEYS)

    async def test_menu_tab_keeps_the_required_shop_button_and_hides_the_apply_button(self) -> None:
        extra = (await self.get("/api/panel/shop-settings?tab=menu", shop_staff(SHOP_A))).json()["extra"]
        keys = [item["key"] for item in extra["items"]]
        self.assertEqual(keys[0], "shop")
        self.assertTrue(extra["items"][0]["required"])
        self.assertNotIn("reseller_apply", keys + [item["key"] for item in extra["pool"]])
        self.assertEqual(extra["layout"], "compact")

    async def test_links_use_the_shops_own_bot(self) -> None:
        extra = (await self.get("/api/panel/shop-settings?tab=links", shop_staff(SHOP_A))).json()["extra"]
        self.assertEqual(extra["bot_username"], "shopabot")
        self.assertTrue(all("shopabot" in link for link in extra["links"].values() if link))

    async def test_the_brand_tab_has_the_shops_own_values_only(self) -> None:
        self.session.add(ResellerSetting(reseller_user_id=SHOP_B, key="panel_brand_name", value="Other Shop Brand"))
        await self.session.commit()
        response = await self.get("/api/panel/shop-settings?tab=brand", shop_staff(SHOP_A))
        self.assertNotIn("Other Shop Brand", response.text)

    async def test_notifications_list_only_what_the_permissions_allow(self) -> None:
        none = (await self.get("/api/panel/shop-settings?tab=notifications", shop_staff(SHOP_A, ["shop_settings"]))).json()
        allowed = {item["key"] for item in none["extra"]["items"]}
        orders = (await self.get("/api/panel/shop-settings?tab=notifications", shop_staff(SHOP_A, ["shop_settings", "orders"]))).json()
        self.assertLessEqual(allowed, {item["key"] for item in orders["extra"]["items"]})
        self.assertEqual([section["title"] for section in orders["sections"]], ["هشدار سرویس کاربر"])

    async def test_guides_start_from_the_default_guides_with_a_media_map(self) -> None:
        body = (await self.get("/api/panel/shop-settings?tab=guides", shop_staff(SHOP_A))).json()
        guides = {field["key"]: field for section in body["sections"] for field in section["fields"]}["connection_guides"]
        self.assertTrue(__import__("json").loads(guides["value"]))
        self.assertEqual(body["extra"]["media_base"], "/shop-settings/guides/media")
        self.assertEqual({option["value"] for option in body["style_options"]}, {"", "primary", "success", "danger"})


class ShopSettingsPageTests(OpsApiCase):
    async def asyncSetUp(self) -> None:
        await super().asyncSetUp()
        self.spa = tempfile.TemporaryDirectory()
        for page in ("shop-settings", "tickets"):
            folder = Path(self.spa.name) / page
            folder.mkdir()
            (folder / "index.html").write_text(f"<html>{page}</html>", encoding="utf-8")
        patcher = patch.object(spa_pages, "SPA_DIR", Path(self.spa.name))
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(self.spa.cleanup)

    async def test_a_shop_gets_the_react_shell(self) -> None:
        response = await self.get("/shop-settings?tab=menu", shop_staff(SHOP_A))
        self.assertEqual(response.status_code, 200)
        self.assertIn("shop-settings", response.text)
        self.assertEqual(response.headers["cache-control"], "no-store")

    async def test_the_old_redirects_still_happen_before_the_shell(self) -> None:
        owner = await self.get("/shop-settings", dict(OWNER) | {"permissions": ["shop_settings"]})
        self.assertEqual((owner.status_code, owner.headers["location"]), (303, "/settings"))
        no_shop = await self.get("/shop-settings", shop_staff(None))
        self.assertTrue(no_shop.headers["location"].startswith("/dashboard?err="))
        moved = await self.get("/shop-settings?tab=supports", shop_staff(SHOP_A))
        self.assertEqual(moved.headers["location"], "/tickets?supports=1")
        self.assertEqual((await self.get("/shop-settings?tab=security", shop_staff(SHOP_A))).headers["location"], "/security")

    async def test_the_tickets_page_is_the_shell_only_for_staff_who_may_open_it(self) -> None:
        response = await self.get("/tickets?view=1", shop_staff(SHOP_A))
        self.assertEqual((response.status_code, "tickets" in response.text), (200, True))
        denied = await self.get("/tickets", {"role": "user", "bot_user_id": 4})
        self.assertEqual((denied.status_code, denied.headers["location"]), (303, "/home"))


class TicketsDataTests(OpsApiCase):
    async def test_each_shop_lists_only_its_own_panel_tickets_and_the_owner_all(self) -> None:
        a = (await self.get("/api/panel/tickets", shop_staff(SHOP_A))).json()
        self.assertEqual([row["id"] for row in a["panel_tickets"]], [1])
        self.assertFalse(a["is_owner"])
        self.assertTrue(a["can_create"])
        owner = (await self.get("/api/panel/tickets", dict(OWNER))).json()
        self.assertEqual({row["id"] for row in owner["panel_tickets"]}, {1, 2})
        self.assertTrue(all(row["unread"] for row in owner["panel_tickets"]))

    async def test_staff_who_cannot_use_tickets_are_sent_home(self) -> None:
        response = await self.get("/api/panel/tickets", {"role": "user", "bot_user_id": 4})
        self.assertEqual(response.json(), {"redirect": "/home"})
        self.assertEqual((await self.get("/api/panel/tickets/1")).status_code, 403)

    async def test_customer_tickets_are_scoped_to_the_staff_members_shop(self) -> None:
        a = (await self.get("/api/panel/tickets", shop_staff(SHOP_A))).json()
        self.assertEqual([row["id"] for row in a["bot_tickets"]], [2])
        platform = (await self.get("/api/panel/tickets", dict(OWNER))).json()
        self.assertEqual([row["id"] for row in platform["bot_tickets"]], [1])
        no_permission = (await self.get("/api/panel/tickets", shop_staff(SHOP_A, ["shop_settings"]))).json()
        self.assertEqual((no_permission["show_bot_tickets"], no_permission["bot_tickets"]), (False, []))
        no_shop = (await self.get("/api/panel/tickets", shop_staff(None))).json()
        self.assertEqual(no_shop["bot_tickets"], [])

    async def test_a_second_shop_cannot_read_a_panel_ticket(self) -> None:
        own = await self.get("/api/panel/tickets/1", shop_staff(SHOP_A))
        self.assertEqual(own.status_code, 200)
        other = await self.get("/api/panel/tickets/1", shop_staff(SHOP_B))
        self.assertEqual(other.status_code, 404)
        self.assertNotIn("Shop A ticket", other.text)

    async def test_a_second_shop_cannot_read_a_customer_ticket(self) -> None:
        self.assertEqual((await self.get("/api/panel/tickets/bot/2", shop_staff(SHOP_A))).status_code, 200)
        other = await self.get("/api/panel/tickets/bot/2", shop_staff(SHOP_B))
        self.assertEqual(other.status_code, 404)
        self.assertNotIn("Shop A customer", other.text)
        # The platform's customers and other shops' customers are not the Owner's here either.
        self.assertEqual((await self.get("/api/panel/tickets/bot/3", dict(OWNER))).status_code, 404)
        self.assertEqual((await self.get("/api/panel/tickets/bot/1", shop_staff(SHOP_A))).status_code, 404)
        self.assertEqual((await self.get("/api/panel/tickets/bot/2", shop_staff(SHOP_A, ["shop_settings"]))).status_code, 404)

    async def test_opening_a_ticket_clears_the_owners_unread_mark_and_keeps_customer_text_plain(self) -> None:
        response = await self.get("/api/panel/tickets/1", dict(OWNER))
        data = response.json()
        self.assertTrue(data["was_unread"])
        self.assertEqual(data["messages"][0]["body"], SCRIPT)
        self.assertTrue(data["can_set_status"])
        self.assertEqual([s["value"] for s in data["statuses"]], ["open", "in_progress", "answered", "closed"])
        again = (await self.get("/api/panel/tickets/1", dict(OWNER))).json()
        self.assertFalse(again["was_unread"])
        self.assertFalse(again["unread"])

    async def test_attachments_are_links_never_stored_paths(self) -> None:
        response = await self.get("/api/panel/tickets/1", shop_staff(SHOP_A))
        message = response.json()["messages"][0]
        self.assertEqual(message["attachment"]["name"], "shot.png")
        self.assertEqual(message["attachment"]["url"], f"/tickets/panel/1/attachment/{message['id']}")
        self.assertNotIn("private/tickets", response.text)
        self.assertNotIn("secretname", response.text)

    async def test_a_shop_can_only_close_its_own_open_ticket(self) -> None:
        data = (await self.get("/api/panel/tickets/1", shop_staff(SHOP_A))).json()
        self.assertEqual((data["can_close"], data["can_set_status"], data["statuses"]), (True, False, []))

    async def test_the_ticket_list_is_bounded(self) -> None:
        with patch.object(tickets_panel, "PANEL_TICKET_LIMIT", 1):
            data = (await self.get("/api/panel/tickets", dict(OWNER))).json()
        self.assertEqual(len(data["panel_tickets"]), 1)

    async def test_long_threads_return_only_the_latest_messages(self) -> None:
        self.session.add_all([PanelTicketMessage(ticket_id=1, sender_role="reseller", sender_label="shop a", body=f"m{i}") for i in range(5)])
        await self.session.commit()
        with patch.object(tickets_panel, "MESSAGE_LIMIT", 3):
            data = (await self.get("/api/panel/tickets/1", shop_staff(SHOP_A))).json()
        self.assertEqual((len(data["messages"]), data["hidden_earlier"]), (3, 3))
        self.assertEqual(data["messages"][-1]["body"], "m4")


class SupportsDataTests(OpsApiCase):
    async def test_each_shop_edits_its_own_contacts_and_the_owner_the_platforms(self) -> None:
        a = (await self.get("/api/panel/tickets/supports", shop_staff(SHOP_A))).json()
        self.assertEqual([c["title"] for c in a["contacts"]], ["Support A"])
        self.assertEqual((a["save_action"], a["text_action"]), ("/shop-supports/save", "/shop-settings?tab=supports"))
        owner = (await self.get("/api/panel/tickets/supports", dict(OWNER))).json()
        self.assertEqual([c["title"] for c in owner["contacts"]], ["Platform support"])
        self.assertEqual(owner["save_action"], "/supports/save")

    async def test_staff_without_shop_settings_or_a_shop_get_nothing(self) -> None:
        self.assertEqual((await self.get("/api/panel/tickets/supports", shop_staff(SHOP_A, ["tickets"]))).status_code, 403)
        # A shop-less reseller must never fall back to the Owner's contacts.
        payload = await tickets_panel.supports_payload(self.session, shop_staff(None))
        self.assertEqual((payload["contacts"], payload["sections"]), ([], []))
        self.assertNotIn("Platform support", str(payload))

    async def test_support_texts_come_from_the_shops_own_settings(self) -> None:
        body = (await self.get("/api/panel/tickets/supports", shop_staff(SHOP_A))).json()
        self.assertTrue(body["sections"])
        self.assertTrue(all(field["key"] for section in body["sections"] for field in section["fields"]))


class SetupDataTests(OpsApiCase):
    SECRET_VALUES = {
        "username": "admin", "BOT_TOKEN": "7000123456:SETUPTOKENSECRETvalue0123456789", "BOT_USERNAME": "shopbot", "ADMIN_IDS": "11,22",
        "PG_BASE_URL": "https://pg.example", "PG_SUBSCRIPTION_PATH": "/sub", "PG_USERNAME": "pgadmin", "PG_PASSWORD": "PG-PASSWORD-SECRET",
        "PG_API_KEY": "PG-API-KEY-SECRET-0123456789", "WEB_PORT": "9000", "PUBLIC_BASE_URL": "", "CURRENCY": "تومان",
    }

    def patched(self, *, complete: bool = False):
        return (
            patch("app.api.panel_ops_api.is_setup_complete", return_value=complete),
            patch("app.services.setup_wizard_panel.begin_setup"),
            patch("app.services.setup_wizard_panel.current_setup_values", return_value=dict(self.SECRET_VALUES)),
            patch("app.services.setup_wizard_panel.https_is_active", return_value=False),
            patch("app.services.setup_wizard_panel.setup_pg_access_audit", new=AsyncMock(return_value={"ok": True, "account_label": "Owner", "features": [{"label": "Users"}], "limits": [], "can_manage_representatives": True, "pg_is_owner": True, "username": "pgadmin"})),
        )

    async def test_the_wizard_never_receives_a_saved_secret(self) -> None:
        patches = self.patched()
        for patcher in patches:
            patcher.start()
            self.addCleanup(patcher.stop)
        response = await self.get("/setup/data")
        self.assertEqual(response.status_code, 200)
        for secret in ("SETUPTOKENSECRETvalue", "PG-PASSWORD-SECRET", "PG-API-KEY-SECRET"):
            self.assertNotIn(secret, response.text)
        body = response.json()
        self.assertEqual((body["has_bot_token"], body["has_pg_password"], body["has_pg_api_key"]), (True, True, True))
        self.assertEqual(body["values"]["bot_username"], "shopbot")
        self.assertIsNone(body["access_audit"])

    async def test_the_last_step_adds_the_access_report(self) -> None:
        for patcher in self.patched():
            patcher.start()
            self.addCleanup(patcher.stop)
        body = (await self.get("/setup/data?step=99")).json()
        self.assertEqual(body["step"], 4)
        self.assertEqual(body["access_audit"]["features"], ["Users"])

    async def test_a_finished_setup_sends_the_browser_away(self) -> None:
        for patcher in self.patched(complete=True):
            patcher.start()
            self.addCleanup(patcher.stop)
        self.assertEqual((await self.get("/setup/data")).json(), {"redirect": "/"})


if __name__ == "__main__":
    unittest.main()
