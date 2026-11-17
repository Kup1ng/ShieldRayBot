"""A wallet gift code without its own per-user cap credits one customer once, even in parallel."""

from __future__ import annotations

import tempfile
import unittest
from unittest.mock import patch

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.db.models import Base, BotUser, ChargeCode, ChargeCodeUse, WalletTransaction
from app.services import gift_codes
from app.services.users import reset_shop_reseller_id, set_shop_reseller_id
from app.services.ux20 import redeem_charge_code
from tests.pgtest import pg_engine


class GiftCodeRedeemRaceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.engine = pg_engine()
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        self.session = async_sessionmaker(self.engine, expire_on_commit=False)()
        self.user = BotUser(id=1, telegram_id=1001, referral_code="buyer", wallet_balance=0)
        self.code = ChargeCode(id=1, code="YALDA", amount=500, kind="wallet", max_uses=100)
        self.session.add_all([self.user, self.code])
        await self.session.commit()
        self.shop_token = set_shop_reseller_id(None)

    async def asyncTearDown(self):
        reset_shop_reseller_id(self.shop_token)
        await self.session.close()
        await self.engine.dispose()
        self.tmp.cleanup()

    async def test_use_committed_by_a_parallel_redeem_blocks_the_second_credit(self):
        real_claim = gift_codes.claim_use

        async def claim_after_parallel_redeem(session, row, **kwargs):
            # The customer's other request finished between this request's checks and the lock.
            session.add(ChargeCodeUse(charge_code_id=row.id, user_id=self.user.id, status="consumed"))
            await session.flush()
            await real_claim(session, row, **kwargs)

        with patch.object(gift_codes, "claim_use", claim_after_parallel_redeem):
            with self.assertRaisesRegex(ValueError, "قبلاً استفاده"):
                await redeem_charge_code(self.session, user=self.user, code="yalda")
        credits = await self.session.scalar(select(func.count(WalletTransaction.id)))
        self.assertEqual(credits, 0)

    async def test_second_redeem_by_same_customer_is_refused(self):
        await redeem_charge_code(self.session, user=self.user, code="YALDA")
        with self.assertRaisesRegex(ValueError, "قبلاً استفاده"):
            await redeem_charge_code(self.session, user=self.user, code="YALDA")
        await self.session.refresh(self.user)
        self.assertEqual(self.user.wallet_balance, 500)

    async def test_explicit_per_user_cap_still_allows_its_count(self):
        self.code.max_uses_per_user = 2
        await self.session.commit()
        await redeem_charge_code(self.session, user=self.user, code="YALDA")
        await redeem_charge_code(self.session, user=self.user, code="YALDA")
        with self.assertRaisesRegex(ValueError, "سقف استفاده شما"):
            await redeem_charge_code(self.session, user=self.user, code="YALDA")
        await self.session.refresh(self.user)
        self.assertEqual(self.user.wallet_balance, 1000)


if __name__ == "__main__":
    unittest.main()
