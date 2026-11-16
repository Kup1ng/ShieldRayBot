"""A reseller capacity pack the installer's budget cannot cover changes neither money nor capacity.

Also covered in tests/test_reseller_packs.py::PackPurchaseTests: a panel refusal
(test_panel_refusal_refunds_and_forgets_the_pack), an unanswered write
(test_unknown_outcome_keeps_the_purchase), a racing second tap
(test_repeated_tap_with_the_same_generation_buys_once) and a clean purchase
(test_purchase_raises_the_live_limit_and_charges_once).
"""

from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db.models import Base, BotUser, PgAdminSubscription, ResellerPlan, ResellerProfile, WalletTransaction
from app.services.billing import GB
from app.services.reseller_packs import buy_addon_pack

CHILD = "child-a"
OWNER = "owner"


class ResellerAddonOwnerBudgetTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        self.Session = async_sessionmaker(self.engine, expire_on_commit=False)
        async with self.Session() as session:
            session.add_all([
                BotUser(id=1, telegram_id=1001, referral_code="reseller", role="reseller", wallet_balance=5000),
                ResellerPlan(
                    id=1, name="base", plan_kind="subscription", billing_mode="fixed", included_gb=30,
                    included_users=10, price=1, is_active=True,
                ),
                ResellerPlan(id=9, name="10 GB", plan_kind="addon_volume", addon_gb=10, price=1000, is_active=True),
                ResellerProfile(id=1, user_id=1, pg_admin_username=CHILD, plan_id=1, is_active=True),
                PgAdminSubscription(
                    id=1, pg_username=CHILD, plan_id=1, access_status="active", base_gb=30, base_users=10,
                    expires_at=datetime.now(timezone.utc) + timedelta(days=10),
                ),
            ])
            await session.commit()
        # The installer admin sells 35 GB in all; the child already holds 30 of it.
        self.admins = {
            CHILD: {"username": CHILD, "data_limit": 30 * GB, "max_users": 10},
            OWNER: {"username": OWNER, "data_limit": 35 * GB, "max_users": 500},
        }
        self.pg = SimpleNamespace(
            get_admin=AsyncMock(side_effect=lambda name: dict(self.admins[name])),
            modify_admin=AsyncMock(return_value={}),
        )
        self.patches = [
            patch("app.config.get_settings", return_value=SimpleNamespace(pg_username=OWNER)),
            patch("app.services.pasarguard.get_pg", return_value=self.pg),
        ]
        for p in self.patches:
            p.start()

    async def asyncTearDown(self) -> None:
        for p in reversed(self.patches):
            p.stop()
        await self.engine.dispose()

    async def buy(self) -> dict:
        async with self.Session() as session:
            user = await session.get(BotUser, 1)
            profile = await session.get(ResellerProfile, 1)
            plan = await session.get(ResellerPlan, 1)
            sub = await session.scalar(select(PgAdminSubscription))
            return await buy_addon_pack(
                session, user=user, profile=profile, plan=plan, pack_id=9, generation=int(sub.renew_generation or 0),
            )

    async def stored(self) -> tuple[int, int, int, int]:
        async with self.Session() as session:
            sub = await session.scalar(select(PgAdminSubscription))
            wallet = int((await session.get(BotUser, 1)).wallet_balance)
            rows = len(list(await session.scalars(select(WalletTransaction))))
            return int(sub.extra_gb_purchased or 0), wallet, rows, int(sub.renew_generation or 0)

    async def test_owner_budget_refusal_keeps_capacity_and_money_unchanged(self) -> None:
        for _ in range(3):
            with self.assertRaisesRegex(ValueError, "سقف حجم"):
                await self.buy()
        self.assertEqual(await self.stored(), (0, 5000, 0, 0))
        self.pg.modify_admin.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
