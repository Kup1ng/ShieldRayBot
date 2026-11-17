"""Mini App switch data and system-alert marks on the React shop settings: each shop sees only its own."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

from sqlalchemy import update

from app.db.models import ResellerProfile
from app.services.notifications import SYSTEM_NOTIFY_KEYS
from tests.test_panel_ops_api import OWNER, SHOP_A, SHOP_B, OpsApiCase, shop_staff

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

    async def test_a_shop_without_the_permission_gets_no_alert_items_at_all(self) -> None:
        body = (await self.get("/api/panel/shop-settings?tab=notifications", shop_staff(SHOP_A, ["shop_settings"]))).json()
        self.assertFalse(any(item["system"] and item["key"] == "notify_panel_delivery_failures" for item in body["extra"]["items"]))
