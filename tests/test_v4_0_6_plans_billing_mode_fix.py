"""v4.0.6 — plans page 500 fix (billing_mode migrate) + remove reseller Plans tab."""

from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class BillingModeMigrateTests(unittest.TestCase):
    def test_alembic_revision_exists(self):
        path = ROOT / "alembic/versions/0003_reseller_plan_billing_mode.py"
        self.assertTrue(path.is_file())
        src = path.read_text(encoding="utf-8")
        self.assertIn("billing_mode", src)
        self.assertIn("0002_pg_staff_credentials", src)
        self.assertIn("reseller_plans", src)

    def test_plans_data_soft_fails_reseller_list(self):
        import asyncio
        from unittest.mock import AsyncMock, patch

        from app.services import panel_catalog_plans

        session = AsyncMock()
        with patch("app.services.resellers.list_reseller_plans", AsyncMock(side_effect=RuntimeError("no column"))), patch(
            "app.services.resellers.ensure_current_capacity_reseller_plan", AsyncMock()
        ):
            plans, error = asyncio.run(panel_catalog_plans._reseller_plan_section(session))
        self.assertEqual(plans, [])
        self.assertEqual(error, panel_catalog_plans.RESELLER_PLANS_LOAD_ERROR)


class ResellerPlansTabRemovedTests(unittest.IsolatedAsyncioTestCase):
    """The reseller area has no «پلن‌ها» tab (its two tabs are checked in labels.test.ts); the old URL leads to the unified plans."""

    async def test_old_reseller_plans_url_leads_to_the_unified_plans_page(self):
        import httpx
        from fastapi import FastAPI

        from app.api.reseller_pages import register_reseller_pages

        async def staff():
            return {"role": "admin"}

        app = FastAPI()
        register_reseller_pages(app, render=None, require_admin=staff, get_db=staff)
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/resellers/plans", follow_redirects=False)
        self.assertEqual(response.status_code, 303)
        self.assertEqual(response.headers["location"], "/plans#reseller-plans")

    def test_unified_plans_still_has_reseller_section(self):
        html = (ROOT / "app/web/templates/plans.html").read_text(encoding="utf-8")
        self.assertIn('id="reseller-plans"', html)
        self.assertIn("پلن‌های نمایندگان", html)
        self.assertIn("reseller_plans_err", html)


class VersionTests(unittest.TestCase):
    def test_version(self):
        from app.version import __version__
        from app.services.updates import is_same_or_newer

        self.assertTrue(is_same_or_newer(__version__, "0.1.0"))
        self.assertEqual((ROOT / "VERSION").read_text(encoding="utf-8").strip(), __version__)


if __name__ == "__main__":
    unittest.main()
