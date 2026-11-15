"""A custom order built on a template holds the volume the buyer chose, not the template's."""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.services import orders

GB = 1024**3


class CustomOrderVolumeHoldTests(unittest.IsolatedAsyncioTestCase):
    async def hold(self, note: str) -> dict:
        order = SimpleNamespace(id=5, reseller_id=2, note=note)
        plan = SimpleNamespace(pg_template_id=7)
        with patch.object(orders, "hold_plan_create", AsyncMock()) as hold:
            await orders._hold_delivery_volume(None, order, plan, object(), data_limit=500 * GB, quantity=1)
        return hold.await_args.kwargs

    async def test_custom_order_holds_the_chosen_volume(self):
        kwargs = await self.hold(orders.CUSTOM_ORDER_NOTE)
        self.assertIsNone(kwargs["template_id"])
        self.assertEqual(kwargs["data_limit"], 500 * GB)

    async def test_catalog_template_order_still_holds_the_template_volume(self):
        kwargs = await self.hold("")
        self.assertEqual(kwargs["template_id"], 7)


if __name__ == "__main__":
    unittest.main()
