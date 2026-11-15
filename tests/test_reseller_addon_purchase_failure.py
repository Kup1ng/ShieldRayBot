"""A reseller capacity pack that fails is undone as a whole; an unanswered write keeps the purchase."""

from __future__ import annotations

import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from sqlalchemy import update
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db.models import Base, BotUser, PgAdminSubscription, ResellerPlan
from app.services.pasarguard import PasarGuardError
from app.services.pg_admin_subscription import apply_addon_plan

GB = 1024**3


class ResellerAddonPurchaseFailureTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.engine = create_async_engine(f"sqlite+aiosqlite:///{Path(self.tmp.name) / 'addon.db'}")
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        self.session = async_sessionmaker(self.engine, expire_on_commit=False)()
        self.payer = BotUser(id=1, telegram_id=1001, referral_code="reseller", wallet_balance=5000)
        self.sub = PgAdminSubscription(
            id=1, pg_username="child-a", access_status="active", base_gb=30, base_users=10,
            expires_at=datetime.now(timezone.utc) + timedelta(days=10),
        )
        self.pack = ResellerPlan(id=9, name="10 GB", plan_kind="addon_volume", addon_gb=10, price=1000, is_active=True)
        self.session.add_all([self.payer, self.sub, self.pack])
        await self.session.commit()
        self.pg = AsyncMock()
        self.pg.get_admin = AsyncMock(return_value={"username": "owner", "data_limit": 1000 * GB, "max_users": 500})
        self.pg.modify_admin = AsyncMock()
        self.patches = [
            patch("app.config.get_settings", return_value=SimpleNamespace(pg_username="owner")),
            patch("app.services.pasarguard.get_pg", return_value=self.pg),
        ]
        for p in self.patches:
            p.start()

    async def asyncTearDown(self):
        for p in reversed(self.patches):
            p.stop()
        await self.session.close()
        await self.engine.dispose()
        self.tmp.cleanup()

    async def buy(self):
        return await apply_addon_plan(self.session, sub=self.sub, addon_plan=self.pack, payer=self.payer)

    async def stored(self) -> tuple[int, int]:
        await self.session.refresh(self.sub)
        await self.session.refresh(self.payer)
        return int(self.sub.extra_gb_purchased or 0), int(self.payer.wallet_balance)

    async def test_owner_budget_refusal_keeps_capacity_and_money_unchanged(self):
        self.pg.get_admin.return_value = {"username": "owner", "data_limit": 35 * GB, "max_users": 500}
        for _ in range(3):
            with self.assertRaisesRegex(ValueError, "سقف حجم"):
                await self.buy()
        self.assertEqual(await self.stored(), (0, 5000))
        self.pg.modify_admin.assert_not_awaited()

    async def test_panel_refusal_keeps_capacity_and_money_unchanged(self):
        self.pg.modify_admin.side_effect = PasarGuardError("denied", status_code=403)
        with self.assertRaisesRegex(ValueError, "مبلغی کسر نشد"):
            await self.buy()
        self.assertEqual(await self.stored(), (0, 5000))

    async def test_unanswered_panel_write_keeps_the_paid_capacity(self):
        self.pg.modify_admin.side_effect = TimeoutError("lost panel response")
        with self.assertRaisesRegex(ValueError, "دوباره خرید نکنید"):
            await self.buy()
        self.assertEqual(await self.stored(), (10, 4000))

    async def test_a_purchase_that_raced_another_is_refused_without_charge(self):
        # Another tap bought a pack after this request read the subscription.
        async with async_sessionmaker(self.engine, expire_on_commit=False)() as other:
            await other.execute(
                update(PgAdminSubscription).where(PgAdminSubscription.id == 1).values(extra_gb_purchased=10)
            )
            await other.commit()
        with self.assertRaisesRegex(ValueError, "هم‌زمان"):
            await self.buy()
        self.assertEqual(await self.stored(), (10, 5000))

    async def test_successful_purchase_charges_and_adds_once(self):
        result = await self.buy()
        self.assertEqual(result["amount"], 1000)
        self.assertEqual(await self.stored(), (10, 4000))


if __name__ == "__main__":
    unittest.main()
