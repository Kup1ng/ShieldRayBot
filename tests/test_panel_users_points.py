"""The customer edit JSON carries the points balance and the points forms only to staff who may use them."""

from __future__ import annotations

from app.db.models import ShopPoints
from tests.test_panel_users_api import OWNER, SHOP_A, SHOP_B, PanelUsersApiTestCase, shop_staff

POINTS_PERMISSIONS = ["dashboard", "loyalty_adjust"]


class UserEditPointsTests(PanelUsersApiTestCase):
    async def asyncSetUp(self) -> None:
        await super().asyncSetUp()
        self.session.add_all([
            ShopPoints(user_id=11, reseller_id=SHOP_A, balance=340),
            ShopPoints(user_id=21, reseller_id=SHOP_B, balance=999),
        ])
        await self.session.commit()

    async def test_staff_see_the_balance_of_their_own_shop_only(self) -> None:
        body = await self.get_json("/api/panel/users/11/edit")
        self.assertEqual(body["points"], {"balance": 340})
        self.assertNotIn("999", str(body["points"]))

    async def test_shop_points_form_needs_the_loyalty_adjust_permission(self) -> None:
        self.assertIsNone((await self.get_json("/api/panel/users/11/edit"))["shop_points"])
        self.staff = shop_staff(SHOP_A, permissions=POINTS_PERMISSIONS)
        form = (await self.get_json("/api/panel/users/11/edit"))["shop_points"]
        self.assertEqual(form["max"], 10_000)
        self.assertEqual(form["daily"], 100_000)
        self.assertEqual(len(form["nonce"]), 32)

    async def test_each_open_of_the_screen_gets_a_fresh_nonce(self) -> None:
        self.staff = shop_staff(SHOP_A, permissions=POINTS_PERMISSIONS)
        first = (await self.get_json("/api/panel/users/11/edit"))["shop_points"]["nonce"]
        second = (await self.get_json("/api/panel/users/11/edit"))["shop_points"]["nonce"]
        self.assertNotEqual(first, second)

    async def test_another_shops_customer_gets_neither_balance_nor_form(self) -> None:
        self.staff = shop_staff(SHOP_B, permissions=POINTS_PERMISSIONS)
        response = await self.client.get("/api/panel/users/11/edit")
        self.assertEqual(response.status_code, 403)
        for leaked in ("340", "shop_points", "nonce"):
            self.assertNotIn(leaked, response.text)

    async def test_the_owner_gets_the_platform_form_and_never_a_shops_customer(self) -> None:
        self.staff = OWNER.copy()
        body = await self.get_json("/api/panel/users/1/edit")
        self.assertIsNone(body["shop_points"])
        self.assertEqual(len(body["platform_points"]["nonce"]), 32)
        # A shop's customer is managed in that shop's own panel, so no points data is offered here at all.
        shop_side = await self.client.get("/api/panel/users/11/edit")
        self.assertEqual(shop_side.status_code, 403)
        self.assertNotIn("340", shop_side.text)

    async def test_shop_staff_never_get_the_platform_form(self) -> None:
        self.staff = shop_staff(SHOP_A, permissions=POINTS_PERMISSIONS)
        self.assertIsNone((await self.get_json("/api/panel/users/11/edit"))["platform_points"])
