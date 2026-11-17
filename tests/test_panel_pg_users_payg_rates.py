"""The PAYG rate summary on the React PasarGuard users list: own shop only, nothing for staff who are not charged."""

from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.db.models import Base, BotUser, ResellerPlan, ResellerProfile
from app.services import pg_users_panel
from tests.pgtest import pg_engine

SHOP_A = 5
SHOP_B = 6
PRICE_A = 11_000
PRICE_B = 22_000
OWNER = {
    "role": "admin", "pg_is_owner": True, "org_principal_id": 1, "org_depth": 0, "org_parent_id": None,
    "org_status": "active", "pg_user_actions": {"read": True},
}


def digits(text: str) -> str:
    """ASCII digits only, so the assertion does not depend on the display formatting."""
    table = str.maketrans("۰۱۲۳۴۵۶۷۸۹", "0123456789")
    return "".join(ch for ch in text.translate(table) if ch.isdigit())


def shop(shop_id: int) -> dict:
    return {"role": "reseller", "bot_user_id": shop_id, "pg_admin_username": f"shop_{shop_id}", "pg_user_actions": {"read": True}}


class RatesCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.engine = pg_engine()
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        self.Session = async_sessionmaker(self.engine, expire_on_commit=False)
        async with self.Session() as session:
            session.add_all([
                BotUser(id=SHOP_A, telegram_id=5, referral_code="a", role="reseller"),
                BotUser(id=SHOP_B, telegram_id=6, referral_code="b", role="reseller"),
                BotUser(id=7, telegram_id=7, referral_code="c", role="reseller"),
                ResellerPlan(id=1, name="a", billing_mode="payg", price_per_gb=PRICE_A, payg_basis="traffic", payg_charge_upfront=True),
                ResellerPlan(id=2, name="b", billing_mode="payg", price_per_gb=PRICE_B, payg_basis="traffic", payg_charge_upfront=True),
            ])
            session.add_all([
                ResellerProfile(id=1, user_id=SHOP_A, plan_id=1, billing_mode="payg", payg_wallet_linked=True, pg_admin_username="shop_5"),
                ResellerProfile(id=2, user_id=SHOP_B, plan_id=2, billing_mode="payg", payg_wallet_linked=True, pg_admin_username="shop_6"),
                ResellerProfile(id=3, user_id=7, plan_id=None, billing_mode="plan", pg_admin_username="shop_7"),
            ])
            await session.commit()
        pg = MagicMock()
        pg.get_users = AsyncMock(return_value={"users": [], "total": 0})
        pg.get_user_templates = AsyncMock(return_value=[])
        pg.get_groups_simple = AsyncMock(return_value=[])
        patcher = patch("app.services.pg_users_panel.staff_pg_read_client", AsyncMock(return_value=pg))
        patcher.start()
        self.addCleanup(patcher.stop)

    async def asyncTearDown(self) -> None:
        await self.engine.dispose()

    async def rates_for(self, staff: dict) -> dict | None:
        async with self.Session() as session:
            return (await pg_users_panel.users_page(session, staff, q=None, page=None))["payg_rates"]


class PaygRatesVisibilityTests(RatesCase):
    async def test_a_payg_shop_sees_its_own_prices_and_the_reset_charge_note(self) -> None:
        rates = await self.rates_for(shop(SHOP_A))
        self.assertIsNotNone(rates)
        self.assertTrue(any("هر گیگ" in line for line in rates["lines"]))
        self.assertIn("کل حجم", rates["reset_note"])

    async def test_a_second_shop_never_sees_the_first_shops_prices(self) -> None:
        text_a = digits(" ".join((await self.rates_for(shop(SHOP_A)))["lines"]))
        text_b = digits(" ".join((await self.rates_for(shop(SHOP_B)))["lines"]))
        self.assertIn(str(PRICE_A), text_a)
        self.assertIn(str(PRICE_B), text_b)
        self.assertNotIn(str(PRICE_A), text_b)
        self.assertNotIn(str(PRICE_B), text_a)

    async def test_the_owner_and_a_shop_that_is_not_charged_get_no_rates(self) -> None:
        self.assertIsNone(await self.rates_for(OWNER))
        self.assertIsNone(await self.rates_for(shop(7)))

    async def test_staff_without_a_shop_get_no_rates(self) -> None:
        self.assertIsNone(await self.rates_for({"role": "pg_staff", "pg_user_actions": {"read": True}}))

    async def test_an_unreadable_price_table_keeps_the_list_and_drops_the_note(self) -> None:
        with patch("app.services.pg_users_panel.shop_rate_summary", AsyncMock(side_effect=RuntimeError("db down"))):
            page = await self.rates_for(shop(SHOP_A))
        self.assertIsNone(page)


if __name__ == "__main__":
    unittest.main()
