"""Loyalty transactions tab shows user labels, not internal ids."""

from __future__ import annotations

import unittest
from pathlib import Path
from types import SimpleNamespace
from tests.pgtest import pg_engine


ROOT = Path(__file__).resolve().parents[1]
LOYALTY = ROOT / "app/web/templates/loyalty.html"


class BotUserPanelLabelTests(unittest.TestCase):
    def test_prefers_username_with_at(self):
        from app.services.formatting import bot_user_panel_label

        u = SimpleNamespace(
            id=7,
            username="alice",
            full_name="Alice",
            telegram_id=123456789,
        )
        self.assertEqual(bot_user_panel_label(u), "Alice (@alice)")

    def test_username_only(self):
        from app.services.formatting import bot_user_panel_label

        u = SimpleNamespace(id=7, username="bob", full_name="", telegram_id=99)
        self.assertEqual(bot_user_panel_label(u), "@bob")

    def test_telegram_id_before_internal_id(self):
        from app.services.formatting import bot_user_panel_label

        u = SimpleNamespace(id=7, username=None, full_name=None, telegram_id=555)
        self.assertEqual(bot_user_panel_label(u), "555")
        self.assertEqual(bot_user_panel_label(None, fallback_id=7), "7")


class LoyaltyTransactionsTemplateTests(unittest.TestCase):
    def test_transactions_column_uses_user_label(self):
        html = LOYALTY.read_text(encoding="utf-8")
        self.assertIn("{{ t.user_label }}", html)
        self.assertNotIn("{{ t.user_id }}", html)


class LoyaltyTransactionsPayloadTests(unittest.IsolatedAsyncioTestCase):
    async def test_ledger_rows_carry_a_user_label_and_the_id_that_opens_the_card(self):
        import tempfile

        from sqlalchemy.ext.asyncio import async_sessionmaker

        from app.db.models import Base, BotUser, PointsTransaction
        from app.services.loyalty_panel import loyalty_transactions

        with tempfile.TemporaryDirectory():
            engine = pg_engine()
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            try:
                async with async_sessionmaker(engine, expire_on_commit=False)() as session:
                    session.add(BotUser(id=7, telegram_id=555, referral_code="c7", username="alice", full_name="Alice"))
                    await session.flush()
                    session.add(
                        PointsTransaction(
                            user_id=7, amount=5, balance_after=5, tx_type="earn", source="x",
                            description="d", idempotency_key="k", reseller_id=None,
                        )
                    )
                    await session.commit()
                    rows = await loyalty_transactions(session, None)
            finally:
                await engine.dispose()
        self.assertEqual(rows[0]["user_label"], "Alice (@alice)")
        # The id is not shown: it only lets the label open the user card.
        self.assertEqual(rows[0]["user_id"], 7)


if __name__ == "__main__":
    unittest.main()
