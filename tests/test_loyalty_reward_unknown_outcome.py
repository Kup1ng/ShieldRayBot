"""A traffic reward whose panel write got no answer stays spent and is recorded for review."""

from __future__ import annotations

import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db.models import Base, BotUser, LoyaltyReward, RewardRedemption, UserService
from app.services.loyalty import RewardPendingReview, redeem_reward
from app.services.pasarguard import PasarGuardError
from app.services.users import reset_shop_reseller_id, set_shop_reseller_id

GB = 1024**3


class FakePanel:
    def __init__(self) -> None:
        self.info = {"status": "active", "data_limit": 10 * GB, "expire": int(time.time()) + 86400}
        self.failure: BaseException | None = None
        self.writes: list[dict] = []

    async def get_user_by_id(self, user_id):
        return dict(self.info)

    async def modify_user_by_id(self, user_id, payload):
        self.writes.append(dict(payload))
        if self.failure is not None:
            raise self.failure
        self.info.update(payload)
        return dict(self.info)


class LoyaltyRewardUnknownOutcomeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.engine = create_async_engine(f"sqlite+aiosqlite:///{Path(self.tmp.name) / 'loyalty.db'}")
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        self.Session = async_sessionmaker(self.engine, expire_on_commit=False)
        async with self.Session() as session:
            session.add_all([
                BotUser(id=1, telegram_id=101, referral_code="a", role="user", points_balance=500),
                UserService(id=1, bot_user_id=1, pg_user_id=10, pg_username="svc"),
                LoyaltyReward(id=1, name="5 GB", reward_type="traffic_gb", reward_value=5, points_cost=100,
                              enabled=True, archived=False, redemption_count=0, max_redemptions_per_user=1),
            ])
            await session.commit()
        self.shop_token = set_shop_reseller_id(None)
        self.pg = FakePanel()
        self.patch = patch("app.services.pasarguard.get_pg", return_value=self.pg)
        self.patch.start()

    async def asyncTearDown(self) -> None:
        self.patch.stop()
        reset_shop_reseller_id(self.shop_token)
        await self.engine.dispose()
        self.tmp.cleanup()

    async def redeem(self, key: str):
        async with self.Session() as session:
            user = await session.get(BotUser, 1)
            return await redeem_reward(session, user, 1, service_id=1, idempotency_key=key)

    async def state(self) -> tuple[int, list[str]]:
        async with self.Session() as session:
            user = await session.get(BotUser, 1)
            statuses = (await session.scalars(select(RewardRedemption.status))).all()
            return int(user.points_balance), list(statuses)

    async def test_lost_answer_keeps_points_spent_and_blocks_a_second_redeem(self) -> None:
        self.pg.failure = TimeoutError("lost panel response")
        with self.assertRaises(RewardPendingReview):
            await self.redeem("tap-1")
        self.assertEqual(await self.state(), (400, ["review"]))
        self.pg.failure = None
        with self.assertRaises(ValueError):
            await self.redeem("tap-2")
        self.assertEqual(len(self.pg.writes), 1, "the reward is not granted a second time")

    async def test_panel_refusal_gives_the_points_back(self) -> None:
        self.pg.failure = PasarGuardError("denied", status_code=403)
        with self.assertRaises(PasarGuardError):
            await self.redeem("tap-1")
        self.assertEqual(await self.state(), (500, []))


if __name__ == "__main__":
    unittest.main()
