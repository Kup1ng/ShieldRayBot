"""Mini App switch data and system-alert marks on the React shop settings: each shop sees only its own."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from sqlalchemy import update

from app.db.models import ResellerProfile
from app.services.miniapp_main_app import MainAppGuide
from app.services.miniapp_shop import SHOP_SWITCH
from app.services.notifications import SYSTEM_NOTIFY_KEYS
from app.services.users import clear_settings_cache, set_setting
from tests.test_panel_ops_api import BOT_TOKEN_SECRET, OWNER, SHOP_A, SHOP_B, OpsApiCase, shop_staff

KEY_A = "keyAAAA1111"
KEY_B = "keyBBBB2222"
MINIAPP_BASE = "https://panel.example/miniapp/"


class ShopMiniappTabTests(OpsApiCase):
    async def asyncSetUp(self) -> None:
        await super().asyncSetUp()
        await self.session.execute(update(ResellerProfile).where(ResellerProfile.user_id == SHOP_A).values(miniapp_key=KEY_A))
        await self.session.execute(update(ResellerProfile).where(ResellerProfile.user_id == SHOP_B).values(miniapp_key=KEY_B))
        await self.session.commit()
        patcher = patch("app.services.miniapp_shop.get_settings", return_value=SimpleNamespace(miniapp_url=MINIAPP_BASE))
        patcher.start()
        self.addCleanup(patcher.stop)

    async def extra_for(self, shop_id: int) -> dict:
        response = await self.get("/api/panel/shop-settings?tab=miniapp", shop_staff(shop_id))
        self.assertEqual(response.status_code, 200)
        return response.json()["extra"]

    async def test_a_shop_gets_its_own_address_and_never_another_shops_key(self) -> None:
        with patch("app.api.shop_settings_panel.shop_miniapp_available", return_value=True):
            response = await self.get("/api/panel/shop-settings?tab=miniapp", shop_staff(SHOP_A))
        extra = response.json()["extra"]
        self.assertTrue(extra["available"])
        self.assertEqual(extra["url"], f"{MINIAPP_BASE}s/{KEY_A}/")
        self.assertNotIn(KEY_B, response.text)

    async def test_a_shop_that_may_not_open_it_is_told_what_to_do_next(self) -> None:
        extra = await self.extra_for(SHOP_B)
        self.assertFalse(extra["available"])
        self.assertTrue(extra["blocker"])
        self.assertFalse(extra["on"])

    async def test_the_open_button_guide_is_this_shops_own_and_only_while_its_miniapp_is_on(self) -> None:
        await set_setting(self.session, SHOP_SWITCH, "1", reseller_id=SHOP_A)
        clear_settings_cache()
        self.addCleanup(clear_settings_cache)
        guide = AsyncMock(return_value=MainAppGuide(url=f"{MINIAPP_BASE}s/{KEY_A}/", bot_username="shopabot", enabled=True))
        with patch("app.api.shop_settings_panel.main_app_guide", guide), patch("app.api.shop_settings_panel.shop_miniapp_available", return_value=True):
            on = await self.get("/api/panel/shop-settings?tab=miniapp", shop_staff(SHOP_A))
            off = await self.get("/api/panel/shop-settings?tab=miniapp", shop_staff(SHOP_B))
        self.assertEqual(
            on.json()["extra"]["main_app"],
            {"url": f"{MINIAPP_BASE}s/{KEY_A}/", "bot_username": "shopabot", "enabled": True, "open_link": "https://t.me/shopabot?startapp"},
        )
        self.assertIsNone(off.json()["extra"]["main_app"])
        guide.assert_awaited_once()
        self.assertEqual(guide.await_args.kwargs["url"], f"{MINIAPP_BASE}s/{KEY_A}/")
        self.assertNotIn(KEY_B, on.text)
        self.assertNotIn(BOT_TOKEN_SECRET, on.text)

    async def test_the_owner_has_no_shop_miniapp_tab(self) -> None:
        response = await self.get("/api/panel/shop-settings?tab=miniapp", OWNER)
        self.assertNotIn(KEY_A, response.text)
        self.assertNotIn(KEY_B, response.text)
        self.assertNotIn("miniapp_shop_enabled", response.text)


class ShopNotificationMarksTests(OpsApiCase):
    async def test_only_panel_alerts_are_marked_as_system(self) -> None:
        body = (await self.get("/api/panel/shop-settings?tab=notifications", shop_staff(SHOP_A, ["shop_settings", "orders", "dashboard"]))).json()
        items = body["extra"]["items"]
        self.assertTrue(items)
        for item in items:
            with self.subTest(key=item["key"]):
                self.assertEqual(item["system"], item["key"] in SYSTEM_NOTIFY_KEYS)
        self.assertTrue(any(item["system"] for item in items))

    async def test_the_entry_request_alert_is_offered_only_with_the_approval_permission(self) -> None:
        async def keys(perms: list[str]) -> set[str]:
            body = (await self.get("/api/panel/shop-settings?tab=notifications", shop_staff(SHOP_A, perms))).json()
            return {item["key"] for item in body["extra"]["items"]}

        self.assertIn("notify_entry_approval", await keys(["shop_settings", "customers_approve"]))
        self.assertNotIn("notify_entry_approval", await keys(["shop_settings", "orders"]))

    async def test_a_shop_without_the_permission_gets_no_alert_items_at_all(self) -> None:
        body = (await self.get("/api/panel/shop-settings?tab=notifications", shop_staff(SHOP_A, ["shop_settings"]))).json()
        self.assertFalse(any(item["system"] and item["key"] == "notify_panel_delivery_failures" for item in body["extra"]["items"]))
