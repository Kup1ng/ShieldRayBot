"""Rejecting a receipt frees an order's discount only when that order is the one rejected."""

from __future__ import annotations

import unittest

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.db.models import Base, BotUser, Order, Payment
from app.services.orders import reject_payment
from tests.pgtest import pg_engine


class RejectPaymentReleaseTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = pg_engine()
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        self.Session = async_sessionmaker(self.engine, expire_on_commit=False)
        async with self.Session() as session:
            session.add(BotUser(id=1, telegram_id=9401, referral_code="R9401"))
            await session.commit()

    async def asyncTearDown(self):
        await self.engine.dispose()

    async def add_order(self, status: str, *payments: Payment) -> None:
        async with self.Session() as session:
            session.add(Order(
                id=1, user_id=1, amount=800, discount_amount=200, discount_code="YALDA", status=status,
            ))
            await session.flush()
            session.add_all(payments)
            await session.commit()

    async def reject(self, payment_id: int) -> None:
        async with self.Session() as session:
            await reject_payment(session, await session.get(Payment, payment_id), reviewer_tg=1)

    async def load(self) -> tuple[Order, dict[int, str]]:
        async with self.Session() as session:
            order = await session.get(Order, 1)
            pays = {p: (await session.get(Payment, p)).status for p in (1, 2)}
            return order, pays

    async def test_leftover_receipt_of_a_wallet_paid_order_keeps_the_discount(self):
        await self.add_order(
            "delivered",
            Payment(id=1, order_id=1, user_id=1, amount=800, method="card", status="pending"),
            Payment(id=2, order_id=1, user_id=1, amount=800, method="wallet", status="approved"),
        )
        await self.reject(1)
        order, pays = await self.load()
        self.assertEqual((order.status, order.amount, order.discount_code), ("delivered", 800, "YALDA"))
        self.assertEqual(pays, {1: "rejected", 2: "approved"})

    async def test_rejected_order_frees_its_discount_and_closes_its_discounted_checkout(self):
        await self.add_order(
            "awaiting_approval",
            Payment(id=1, order_id=1, user_id=1, amount=800, method="card", status="pending"),
            Payment(id=2, order_id=1, user_id=1, amount=800, method="zarinpal", status="pending"),
        )
        await self.reject(1)
        order, pays = await self.load()
        self.assertEqual((order.status, order.amount, order.discount_code), ("rejected", 1000, None))
        self.assertEqual(pays, {1: "rejected", 2: "rejected"})


if __name__ == "__main__":
    unittest.main()
