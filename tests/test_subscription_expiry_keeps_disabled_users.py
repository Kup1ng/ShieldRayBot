"""Expiring and renewing a reseller never re-enables a panel user that was disabled for another reason."""

from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

from sqlalchemy import update
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db.models import Base, PgAdminSubscription
from app.services.pg_admin_subscription import expire_subscription, restore_subscription_access


class FakePanel:
    def __init__(self) -> None:
        # User 2's service was cancelled and refunded: it is disabled on purpose.
        self.status = {1: "active", 2: "disabled", 3: "limited"}

    async def get_users(self, *, admin, limit, offset):
        rows = [{"id": uid, "status": status} for uid, status in sorted(self.status.items())]
        return {"users": rows[offset:offset + limit]}

    async def set_disabled_by_id(self, uid, disabled):
        self.status[uid] = "disabled" if disabled else "active"
        return {}


class SubscriptionExpiryTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        self.session = async_sessionmaker(self.engine, expire_on_commit=False)()
        self.sub = PgAdminSubscription(
            pg_username="shop1", access_status="active", base_gb=10, base_users=5,
            expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        )
        self.session.add(self.sub)
        await self.session.commit()
        self.pg = FakePanel()
        self.patches = [
            patch("app.services.pasarguard.get_pg", return_value=self.pg),
            patch("app.services.billing_suspend._set_admin_enabled", AsyncMock()),
        ]
        for p in self.patches:
            p.start()

    async def asyncTearDown(self):
        for p in reversed(self.patches):
            p.stop()
        await self.session.close()
        await self.engine.dispose()

    async def test_expiry_cuts_only_enabled_users_and_restore_leaves_others_disabled(self):
        stats = await expire_subscription(self.session, self.sub)
        self.assertEqual(stats["users_cut"], 2)
        self.assertEqual(self.sub.expiry_disabled_user_ids, "[1,3]")

        await restore_subscription_access(self.session, self.sub, commit=True)
        self.assertEqual(self.pg.status, {1: "active", 2: "disabled", 3: "active"})
        self.assertEqual(self.sub.access_status, "active")

    async def test_a_renewal_that_lands_during_the_cut_wins(self):
        Session = async_sessionmaker(self.engine, expire_on_commit=False)
        real_disable = self.pg.set_disabled_by_id

        async def disable_while_renewing(uid, disabled):
            if disabled and uid == 1:
                # The reseller's renewal commits while the expiry is still cutting users.
                async with Session() as other:
                    await other.execute(
                        update(PgAdminSubscription).values(
                            renew_generation=PgAdminSubscription.renew_generation + 1,
                            expires_at=datetime.now(timezone.utc) + timedelta(days=30),
                        )
                    )
                    await other.commit()
            return await real_disable(uid, disabled)

        self.pg.set_disabled_by_id = disable_while_renewing
        stats = await expire_subscription(self.session, self.sub)
        self.assertEqual(stats.get("renewed"), 1)
        self.assertEqual(self.sub.access_status, "active")
        self.assertIsNone(self.sub.expiry_disabled_user_ids)
        self.assertEqual(self.pg.status, {1: "active", 2: "disabled", 3: "active"})


if __name__ == "__main__":
    unittest.main()
