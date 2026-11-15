"""Small correctness fixes: env values with backslashes, the payment-check throttle, shop bot links."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from dotenv import dotenv_values

from app.services import payment_settlement, setup_wizard
from app.services.payment_settlement import claim_psp_check_slot


class EnvBackslashTests(unittest.TestCase):
    def test_updating_a_value_keeps_its_backslashes(self):
        with tempfile.TemporaryDirectory() as tmp:
            env = Path(tmp) / ".env"
            env.write_text('PG_PASSWORD="old"\n', encoding="utf-8")
            with patch.object(setup_wizard, "ENV_PATH", env):
                setup_wizard.update_env_keys({"PG_PASSWORD": "p\\tq\\\\z"})
            self.assertEqual(dotenv_values(env)["PG_PASSWORD"], "p\\tq\\\\z")


class PspCheckSlotTests(unittest.TestCase):
    def setUp(self):
        payment_settlement._recent_psp_checks.clear()
        self.addCleanup(payment_settlement._recent_psp_checks.clear)

    def test_another_customer_cannot_use_up_the_payers_slot(self):
        self.assertTrue(claim_psp_check_slot(5, user_id=2))
        self.assertTrue(claim_psp_check_slot(5, user_id=1))
        self.assertFalse(claim_psp_check_slot(5, user_id=1))


class ShopBotLinkTests(unittest.IsolatedAsyncioTestCase):
    async def test_the_stored_token_is_opened_before_asking_telegram(self):
        from app.services import ux20
        from app.services.secret_box import seal_bot_token

        profile = SimpleNamespace(bot_username=None, bot_token=seal_bot_token("123:PLAIN"))
        result = SimpleNamespace(scalar_one_or_none=lambda: profile)
        session = SimpleNamespace(execute=AsyncMock(return_value=result))
        check = AsyncMock(return_value={"username": "shop_bot"})
        with patch("app.services.home_overview.check_bot_connection", check):
            await ux20.build_magic_links_context(session, {"role": "reseller", "bot_user_id": 5})
        check.assert_awaited_once_with("123:PLAIN")


if __name__ == "__main__":
    unittest.main()
