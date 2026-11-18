"""The rows behind a customer's name in a panel table carry the id that opens the user card, in the right shop."""

from __future__ import annotations

import unittest

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.db.models import Base, BotUser, PointsTransaction
from app.services.loyalty import overview_metrics
from app.services.loyalty_panel import loyalty_overview, loyalty_transactions
from tests.pgtest import pg_engine
from tests.test_panel_finance_api import OWNER, SHOP_B, FinanceApiCase, shop_staff

PLATFORM_REFERRER, SHOP, SHOP_REFERRER = 1, 2, 3


class DeliveryNameTests(FinanceApiCase):
    async def test_a_delivery_row_names_the_customer_whose_order_it_is(self) -> None:
        row = (await self.get("/api/panel/finance/delivery", dict(OWNER))).json()["rows"][0]
        self.assertEqual((row["order_id"], row["user_id"]), (101, 1))

    async def test_another_shops_queue_carries_only_its_own_customers(self) -> None:
        rows = (await self.get("/api/panel/finance/delivery", shop_staff(SHOP_B))).json()["rows"]
        self.assertEqual([row["order_id"] for row in rows], [120])
        self.assertNotEqual(rows[0]["user_id"], 1, "the platform customer is not in this shop's queue")


class LoyaltyNameTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.engine = pg_engine()
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        self.Session = async_sessionmaker(self.engine, expire_on_commit=False)
        async with self.Session() as session:
            session.add_all([
                BotUser(id=PLATFORM_REFERRER, telegram_id=1001, referral_code="r1", username="plat_ref"),
                BotUser(id=SHOP, telegram_id=1002, referral_code="r2", role="reseller"),
            ])
            await session.flush()
            session.add_all([
                BotUser(id=SHOP_REFERRER, telegram_id=1003, referral_code="r3", reseller_id=SHOP, full_name="Shop referrer"),
                BotUser(id=20, telegram_id=1020, referral_code="n20", referred_by_id=PLATFORM_REFERRER),
                BotUser(id=21, telegram_id=1021, referral_code="n21", referred_by_id=SHOP_REFERRER, referral_shop_id=SHOP,
                        reseller_id=SHOP),
            ])
            await session.flush()
            session.add_all([
                PointsTransaction(user_id=PLATFORM_REFERRER, amount=5, balance_after=5, tx_type="earn", source="x",
                                  description="platform", idempotency_key="p1", reseller_id=None),
                PointsTransaction(user_id=SHOP_REFERRER, amount=7, balance_after=7, tx_type="earn", source="x",
                                  description="shop", idempotency_key="s1", reseller_id=SHOP),
            ])
            await session.commit()

    async def asyncTearDown(self) -> None:
        await self.engine.dispose()

    async def test_top_referrers_carry_the_id_that_opens_the_card(self) -> None:
        async with self.Session() as session:
            payload = await loyalty_overview(session, dict(OWNER), None)
            metrics = await overview_metrics(session, reseller_id=None)
        self.assertEqual([row["user_id"] for row in payload["metrics"]["top_referrers"]], [PLATFORM_REFERRER])
        self.assertEqual([row["user_id"] for row in metrics["top_referrers"]], [PLATFORM_REFERRER])

    async def test_a_shop_sees_only_its_own_referrers(self) -> None:
        async with self.Session() as session:
            payload = await loyalty_overview(session, shop_staff(SHOP), SHOP)
        self.assertEqual([row["user_id"] for row in payload["metrics"]["top_referrers"]], [SHOP_REFERRER])

    async def test_ledger_rows_name_each_customer_in_the_shops_own_purse_only(self) -> None:
        async with self.Session() as session:
            platform = await loyalty_transactions(session, None)
            shop = await loyalty_transactions(session, SHOP)
        self.assertEqual([row["user_id"] for row in platform], [PLATFORM_REFERRER])
        self.assertEqual([row["user_id"] for row in shop], [SHOP_REFERRER])


if __name__ == "__main__":
    unittest.main()
