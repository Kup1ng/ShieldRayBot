"""A shop's plan name is free text; the delivery card escapes it for Telegram HTML."""

from __future__ import annotations

import unittest
from types import SimpleNamespace

from app.services.delivery import _plan_delivery_line

HOSTILE = '<a href="https://evil.example">✅ پرداخت تأیید شد</a> & <b'


class DeliveryPlanNameEscapingTests(unittest.TestCase):
    def test_plan_name_markup_is_shown_as_text(self):
        order = SimpleNamespace(plan=SimpleNamespace(name=HOSTILE, plan_kind="subscription", billing_mode="fixed"))
        line = _plan_delivery_line(order)
        self.assertNotIn("<a ", line)
        self.assertNotIn("<b\n", line + "\n")
        self.assertIn("&lt;a href=&quot;https://evil.example&quot;&gt;", line)
        self.assertIn("&amp;", line)


if __name__ == "__main__":
    unittest.main()
