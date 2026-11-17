"""A shop that requires a service name gets it with a card/gateway order too, scoped to the buyer and the shop."""

from __future__ import annotations

import json

from sqlalchemy import update

from app.db.models import Order, ResellerProfile
from tests.test_miniapp_order_payments import SHOP_PLAN, OrderPaymentFixture, new_key
from tests.test_miniapp_shop_readonly import PERMS, SHOP


class OrderPayServiceNameTests(OrderPaymentFixture):
    async def require_name(self, enabled: bool = True) -> None:
        permissions = json.dumps([*json.loads(PERMS), *(["custom_service_name"] if enabled else [])])
        async with self.Session() as session:
            await session.execute(
                update(ResellerProfile)
                .where(ResellerProfile.user_id == SHOP)
                .values(web_permissions=permissions, bot_permissions=permissions)
            )
            await session.commit()

    async def test_a_missing_or_invalid_name_is_refused_before_any_order_exists(self) -> None:
        await self.require_name()
        for extra in ({}, {"service_name": ""}, {"service_name": "علی"}, {"service_name": "ab"}, {"service_name": 12}):
            with self.subTest(extra=extra):
                self.assertEqual((await self.pay(**extra)).status_code, 400)
        self.assertEqual(await self.count(Order), 0)

    async def test_the_name_is_stored_on_the_order_before_its_payment_opens(self) -> None:
        await self.require_name()
        response = await self.pay(service_name=" @Card_Svc ")
        self.assertEqual(response.status_code, 200, response.text)
        [order] = await self.rows(Order)
        self.assertEqual((order.requested_username, order.status), ("card_svc", "awaiting_receipt"))

    async def test_a_repeated_request_keeps_the_first_name_and_the_same_order(self) -> None:
        await self.require_name()
        key = new_key()
        first = await self.pay(request_key=key, service_name="first_name")
        again = await self.pay(request_key=key, service_name="second_name")
        self.assertEqual(again.json(), first.json())
        [order] = await self.rows(Order)
        self.assertEqual(order.requested_username, "first_name")

    async def test_a_name_is_ignored_where_the_shop_does_not_require_one(self) -> None:
        await self.require_name(False)
        self.assertEqual((await self.pay(service_name="ignored")).status_code, 200)
        [order] = await self.rows(Order)
        self.assertIsNone(order.requested_username)

    async def test_another_customers_checkout_order_is_neither_paid_nor_named(self) -> None:
        await self.require_name()
        async with self.Session() as session:
            theirs = Order(user_id=11, plan_id=SHOP_PLAN, reseller_id=SHOP, amount=4_000, discount_amount=1_000,
                           discount_code="OFF", status="pending")
            session.add(theirs)
            await session.commit()
            order_id = int(theirs.id)
        response = await self.pay(order_id=order_id, price=4_000, service_name="stolen_name")
        self.assertEqual(response.status_code, 404)
        [stored] = await self.rows(Order)
        self.assertIsNone(stored.requested_username)
        self.assertEqual(stored.status, "pending")
