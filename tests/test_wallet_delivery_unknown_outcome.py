"""Wallet purchases keep the payment when the panel may already hold what was bought."""

from __future__ import annotations

import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db.models import (
    Base, BotUser, DeliveryFailure, Order, Payment, Plan, ServiceAddonPack, UserService,
)
from app.services.orders import DeliveryPendingReview, create_order, pay_with_wallet
from app.services.pasarguard import PasarGuardError
from app.services.service_addons import AddonPendingReview, create_addon_order
from app.services.users import reset_shop_reseller_id, set_shop_reseller_id

GB = 1024**3
DAY = 86400


class FakePanel:
    """One panel user for add-ons, plus template creates for new purchases."""

    def __init__(self) -> None:
        self.info = {"status": "active", "data_limit": 10 * GB, "used_traffic": GB, "expire": int(time.time()) + 5 * DAY}
        self.writes: list[dict] = []
        self.creates: list[dict] = []
        self.lose_response = False
        self.reject = False

    async def get_user_by_id(self, user_id):
        return dict(self.info)

    async def modify_user_by_id(self, user_id, payload):
        if self.reject:
            raise PasarGuardError("denied", status_code=403)
        self.writes.append(dict(payload))
        self.info.update(payload)
        if self.lose_response:
            raise TimeoutError("lost panel response")
        return dict(self.info)

    async def create_user_from_template(self, payload):
        if self.reject:
            raise PasarGuardError("denied", status_code=403)
        if any(c["username"] == payload["username"] for c in self.creates):
            raise PasarGuardError("User already exists", status_code=409)
        self.creates.append(dict(payload))
        if self.lose_response:
            raise TimeoutError("lost panel response")
        return {"id": 100 + len(self.creates), "username": payload["username"]}

    async def get_user_by_username(self, username):
        index = next(i for i, c in enumerate(self.creates) if c["username"] == username)
        return {"id": 101 + index, "username": username}


class WalletDeliveryFixture(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.engine = create_async_engine(f"sqlite+aiosqlite:///{Path(self.tmp.name) / 'wallet.db'}")
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        self.session = async_sessionmaker(self.engine, expire_on_commit=False)()
        self.user = BotUser(id=1, telegram_id=1001, referral_code="buyer", wallet_balance=1000)
        self.plan = Plan(id=1, name="Monthly", price=200, data_limit_gb=10, duration_days=30, pg_template_id=7)
        self.service = UserService(id=1, bot_user_id=1, pg_user_id=10, pg_username="svc", plan_id=1)
        self.pack = ServiceAddonPack(id=1, name="extra", kind="volume", amount=5, price=50)
        self.session.add_all([self.user, self.plan, self.service, self.pack])
        await self.session.commit()
        self.shop_token = set_shop_reseller_id(None)
        self.pg = FakePanel()
        self.patches = [
            patch("app.services.orders.get_pg", return_value=self.pg),
            patch("app.services.pasarguard.get_pg", return_value=self.pg),
            patch("app.services.loyalty.consume_loyalty_discount_for_order", AsyncMock()),
            patch("app.services.loyalty.on_order_delivered", AsyncMock()),
            patch("app.services.orders.purchase_contact_needed", AsyncMock(return_value=False)),
        ]
        for p in self.patches:
            p.start()

    async def asyncTearDown(self):
        for p in reversed(self.patches):
            p.stop()
        reset_shop_reseller_id(self.shop_token)
        await self.session.close()
        await self.engine.dispose()
        self.tmp.cleanup()

    async def balance(self) -> int:
        await self.session.refresh(self.user)
        return int(self.user.wallet_balance)

    async def payment_status(self, order: Order) -> str:
        payment = await self.session.scalar(select(Payment).where(Payment.order_id == order.id))
        return payment.status


class AddonUnknownOutcomeTests(WalletDeliveryFixture):
    async def addon_order(self) -> Order:
        return await create_addon_order(self.session, user_id=1, service=self.service, pack=self.pack)

    async def test_lost_panel_response_keeps_payment_and_retry_does_not_add_twice(self):
        order = await self.addon_order()
        self.pg.lose_response = True
        with self.assertRaises(AddonPendingReview):
            await pay_with_wallet(self.session, order, self.user)
        await self.session.refresh(order)
        self.assertEqual(await self.balance(), 950)
        self.assertEqual((order.status, order.service_mutation_pending), ("paid", True))
        self.assertEqual(await self.payment_status(order), "approved")
        self.assertEqual(json.loads(order.renewal_snapshot)["target"]["data_limit"], 15 * GB)

        self.pg.lose_response = False
        await pay_with_wallet(self.session, order, self.user)
        await self.session.refresh(order)
        self.assertEqual(order.status, "delivered")
        self.assertEqual(self.pg.info["data_limit"], 15 * GB)
        self.assertEqual(self.pg.writes[0], self.pg.writes[1])
        self.assertEqual(await self.balance(), 950)

    async def test_panel_refusal_refunds_and_frees_the_service(self):
        order = await self.addon_order()
        self.pg.reject = True
        with self.assertRaises(PasarGuardError):
            await pay_with_wallet(self.session, order, self.user)
        await self.session.refresh(order)
        self.assertEqual(await self.balance(), 1000)
        self.assertEqual((order.status, order.service_mutation_pending), ("pending", False))
        self.assertIsNone(order.renewal_snapshot)
        self.assertEqual(await self.payment_status(order), "rejected")


class NewPurchaseUnknownOutcomeTests(WalletDeliveryFixture):
    async def test_lost_create_response_keeps_payment_for_staff(self):
        order = await create_order(self.session, user_id=1, plan_id=1)
        self.pg.lose_response = True
        with self.assertRaises(DeliveryPendingReview):
            await pay_with_wallet(self.session, order, self.user)
        await self.session.refresh(order)
        self.assertEqual(await self.balance(), 800)
        self.assertEqual(order.status, "paid")
        self.assertEqual(await self.payment_status(order), "approved")
        failures = await self.session.scalar(
            select(func.count(DeliveryFailure.id)).where(DeliveryFailure.order_id == order.id)
        )
        self.assertEqual(failures, 1)

    async def test_retry_after_a_lost_create_response_delivers_the_same_panel_user(self):
        order = await create_order(self.session, user_id=1, plan_id=1)
        self.pg.lose_response = True
        with self.assertRaises(DeliveryPendingReview):
            await pay_with_wallet(self.session, order, self.user)
        self.pg.lose_response = False
        await pay_with_wallet(self.session, order, self.user)
        await self.session.refresh(order)
        self.assertEqual(order.status, "delivered")
        self.assertEqual(len(self.pg.creates), 1, "a retry must not create a second panel user")
        service = await self.session.get(UserService, order.service_id)
        self.assertEqual(service.pg_username, self.pg.creates[0]["username"])
        self.assertEqual(await self.balance(), 800)

    async def test_panel_refusal_refunds_new_purchase(self):
        order = await create_order(self.session, user_id=1, plan_id=1)
        self.pg.reject = True
        with self.assertRaises(PasarGuardError):
            await pay_with_wallet(self.session, order, self.user)
        await self.session.refresh(order)
        self.assertEqual(await self.balance(), 1000)
        self.assertEqual(order.status, "pending")
        self.assertEqual(await self.payment_status(order), "rejected")


if __name__ == "__main__":
    unittest.main()
