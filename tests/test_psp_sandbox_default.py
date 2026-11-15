"""A gateway the shop never switched to sandbox takes real payments; sandbox stays opt-in."""

from __future__ import annotations

import unittest

from app.services.payment_providers import get_psp_adapter
from app.services.psp_gateways import all_psp_gateways
from app.services.users import DEFAULT_SETTINGS

BASE = "https://panel.example"


class PspSandboxDefaultTests(unittest.TestCase):
    def test_unset_sandbox_uses_the_real_zarinpal_gateway(self):
        adapter = get_psp_adapter("zarinpal", ui={"psp_merchant_id": "m-1"}, public_base_url=BASE)
        self.assertFalse(adapter.sandbox)

    def test_settings_default_is_not_sandbox(self):
        self.assertEqual(DEFAULT_SETTINGS["psp_sandbox"], "0")

    def test_older_single_gateway_settings_default_to_real_payments(self):
        gateways = all_psp_gateways({"psp_provider": "zarinpal", "psp_merchant_id": "m-1"})
        self.assertTrue(gateways)
        self.assertFalse(gateways[0].sandbox)

    def test_sandbox_still_works_when_the_shop_turns_it_on(self):
        adapter = get_psp_adapter("zarinpal", ui={"psp_merchant_id": "m-1", "psp_sandbox": "1"}, public_base_url=BASE)
        self.assertTrue(adapter.sandbox)


if __name__ == "__main__":
    unittest.main()
