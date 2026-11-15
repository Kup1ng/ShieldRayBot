"""Customer-behaviour page: same access as the finance reports it came from, shop-scoped data."""

from __future__ import annotations

import os
import unittest
from unittest.mock import AsyncMock, patch

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse

from app.api.funnel_pages import register_funnel_pages
from app.services.funnel_access import funnel_shop_scope

OWNER = {
    "role": "admin",
    "permissions": [],
    "org_principal_id": 1,
    "org_depth": 0,
    "org_parent_id": None,
    "org_status": "active",
}


def _reseller(permissions: list[str], shop_id: int | None = 5) -> dict:
    return {"role": "reseller", "permissions": permissions, "bot_user_id": shop_id}


class FunnelScopeTests(unittest.TestCase):
    def test_owner_reads_the_platform_shop(self):
        self.assertIsNone(funnel_shop_scope(OWNER))

    def test_shop_staff_read_only_their_own_shop(self):
        self.assertEqual(funnel_shop_scope(_reseller(["orders"])), 5)
        self.assertEqual(funnel_shop_scope(_reseller(["payments"], shop_id=9)), 9)

    def test_missing_permission_or_shop_is_refused(self):
        for staff in (
            _reseller(["tickets", "plans"]),
            _reseller(["orders"], shop_id=None),
            _reseller(["orders"], shop_id=0),
            {"role": "admin", "permissions": []},
            {"role": "pg_staff", "permissions": ["orders", "payments"]},
        ):
            with self.subTest(staff=staff), self.assertRaises(PermissionError):
                funnel_shop_scope(staff)

    def test_forged_owner_flags_grant_nothing(self):
        staff = _reseller(["tickets"])
        staff.update({"is_owner": True, "web_owner": True})
        with self.assertRaises(PermissionError):
            funnel_shop_scope(staff)


def _marketing_app(staff: dict) -> FastAPI:
    from app.api.panel_marketing_api import register_panel_marketing_api
    from app.services.authz import authz_from_staff, can_shop

    async def get_db():
        yield AsyncMock()

    async def require_staff():
        return staff

    def require_perm(perm: str):
        async def dep():
            if not can_shop(authz_from_staff(staff), perm):
                raise HTTPException(403)
            return staff

        return dep

    app = FastAPI()
    register_panel_marketing_api(
        app, require_staff=require_staff, require_admin=require_staff, require_perm=require_perm,
        require_pg_perm=require_perm, get_db=get_db,
    )
    return app


class FunnelPageTests(unittest.IsolatedAsyncioTestCase):
    """The page route: access check, then the React shell; the data lives behind the JSON endpoint."""

    async def asyncSetUp(self):
        from app.api.app import render

        self.staff: dict = {}

        async def get_db():
            yield AsyncMock()

        app = FastAPI()
        register_funnel_pages(app, render=render, require_staff=lambda: self.staff, get_db=get_db)
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")
        patcher = patch("app.api.funnel_pages.spa_response", lambda page: HTMLResponse(f"shell:{page}"))
        patcher.start()
        self.addCleanup(patcher.stop)

    async def asyncTearDown(self):
        await self.client.aclose()

    async def test_owner_and_shop_staff_get_the_funnel_shell(self):
        for staff in (OWNER, _reseller(["payments"], shop_id=5)):
            self.staff.clear()
            self.staff.update(staff)
            response = await self.client.get("/funnel")
            self.assertEqual((response.status_code, response.text), (200, "shell:funnel"))

    async def test_staff_without_access_are_sent_home_and_never_see_the_shell(self):
        for staff in (_reseller(["tickets"]), _reseller(["orders"], shop_id=None), {"role": "pg_staff", "permissions": ["orders"]}):
            with self.subTest(staff=staff):
                self.staff.clear()
                self.staff.update(staff)
                response = await self.client.get("/funnel")
                self.assertEqual(response.status_code, 303)
                self.assertEqual(response.headers["location"], "/home")


class FunnelDataTests(unittest.IsolatedAsyncioTestCase):
    async def _get(self, staff: dict, summary: AsyncMock, url: str = "/api/panel/marketing/funnel"):
        app = _marketing_app(staff)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            with patch("app.services.marketing_panel.funnel_summary", summary):
                return await client.get(url)

    async def test_owner_gets_the_platform_funnel_only(self):
        summary = AsyncMock(return_value={"shop_open": 12, "delivered": 3})
        response = await self._get(OWNER, summary)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(summary.await_args.kwargs["reseller_id"], None)
        self.assertEqual(response.json()["counts"]["shop_open"], 12)

    async def test_shop_staff_get_their_own_shop_never_a_requested_one(self):
        summary = AsyncMock(return_value={})
        await self._get(_reseller(["payments"], shop_id=5), summary, "/api/panel/marketing/funnel?reseller_id=6&shop_id=6")
        self.assertEqual(summary.await_args.kwargs["reseller_id"], 5)

    async def test_staff_without_access_are_refused_and_nothing_is_read(self):
        for staff in (_reseller(["tickets"]), _reseller(["orders"], shop_id=None), {"role": "pg_staff", "permissions": ["orders"]}):
            with self.subTest(staff=staff):
                summary = AsyncMock(return_value={})
                response = await self._get(staff, summary)
                self.assertEqual(response.status_code, 403)
                summary.assert_not_awaited()

    async def test_empty_funnel_still_answers_with_every_step(self):
        response = await self._get(OWNER, AsyncMock(return_value=None))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.json()["counts"].values()), {0})

    async def test_tab_strip_marks_the_funnel_for_a_shop_with_orders(self):
        response = await self._get(_reseller(["orders", "gift_codes"]), AsyncMock(return_value={}))
        self.assertIn("funnel", [section["key"] for section in response.json()["sections"]])


class FinanceBehaviorRedirectTests(unittest.IsolatedAsyncioTestCase):
    async def test_old_behavior_tab_redirects_for_finance_staff_only(self):
        from app.api.app import render
        from app.api.finance_pages import register_finance_pages

        staff: dict = {}

        async def get_db():
            yield AsyncMock()

        app = FastAPI()
        register_finance_pages(app, render=render, require_staff=lambda: staff, get_db=get_db)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            staff.update(_reseller(["orders"]))
            moved = await client.get("/finance?tab=behavior")
            self.assertEqual((moved.status_code, moved.headers["location"]), (303, "/funnel"))
            staff.clear()
            staff.update(_reseller(["tickets"]))
            denied = await client.get("/finance?tab=behavior")
            self.assertEqual((denied.status_code, denied.headers["location"]), (303, "/home"))


if __name__ == "__main__":
    unittest.main()
