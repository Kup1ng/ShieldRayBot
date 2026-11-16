"""Gift-code page: same access rule as the code routes, strict shop scoping, safe output."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path


from unittest.mock import patch

import httpx
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.api.gift_code_pages import legacy_gift_modal_redirect, register_gift_code_pages
from app.services.gift_codes import gift_code_scope
from tests.pgtest import pg_engine

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


class GiftCodeScopeTests(unittest.TestCase):
    def test_owner_manages_the_platform_shop(self):
        self.assertIsNone(gift_code_scope(OWNER))

    def test_shop_staff_with_gift_codes_get_their_own_shop(self):
        self.assertEqual(gift_code_scope(_reseller(["gift_codes"])), 5)
        self.assertEqual(gift_code_scope(_reseller(["gift_codes"], shop_id=9)), 9)

    def test_orders_or_plans_alone_no_longer_reach_gift_codes(self):
        for perms in (["plans"], ["orders"], ["plans", "orders"]):
            with self.subTest(perms=perms), self.assertRaises(PermissionError):
                gift_code_scope(_reseller(perms))

    def test_missing_permission_is_refused(self):
        with self.assertRaises(PermissionError):
            gift_code_scope(_reseller(["tickets", "loyalty"]))

    def test_staff_without_a_shop_never_reaches_any_codes(self):
        for staff in (
            _reseller(["gift_codes"], shop_id=None),
            _reseller(["gift_codes"], shop_id=0),
            {"role": "admin", "permissions": []},
            {"role": "pg_staff", "permissions": ["gift_codes", "plans", "orders"]},
        ):
            with self.subTest(staff=staff), self.assertRaises(PermissionError):
                gift_code_scope(staff)

    def test_forged_owner_flags_grant_nothing(self):
        staff = _reseller(["tickets"])
        staff.update({"is_owner": True, "web_owner": True})
        with self.assertRaises(PermissionError):
            gift_code_scope(staff)


class LegacyRedirectTests(unittest.TestCase):
    def test_old_modal_link_moves_to_the_page_and_keeps_flash(self):
        self.assertEqual(legacy_gift_modal_redirect({"gifts": "1"}), "/gift-codes")
        self.assertEqual(
            legacy_gift_modal_redirect({"gifts": "1", "ok": "x", "other": "y"}),
            "/gift-codes?ok=x",
        )

    def test_plain_plans_page_is_not_redirected(self):
        self.assertIsNone(legacy_gift_modal_redirect({}))
        self.assertIsNone(legacy_gift_modal_redirect({"gifts": "0"}))

    def test_redirect_never_leaves_the_panel(self):
        target = legacy_gift_modal_redirect({"gifts": "1", "ok": "//evil.test"})
        self.assertTrue(target.startswith("/gift-codes"))


def _deny_unless_allowed(staff_ref: dict, permission: str):
    """Stand-in for the app's ``require_perm`` that uses the real authorization rule."""
    from fastapi import HTTPException

    from app.services.authz import authz_from_staff, can_shop

    def dependency() -> dict:
        if not can_shop(authz_from_staff(staff_ref), permission):
            raise HTTPException(403, "forbidden")
        return staff_ref

    return dependency


class GiftCodeHarness(unittest.IsolatedAsyncioTestCase):
    """Real page and data routes over a temp database with codes for the platform and two shops."""

    async def asyncSetUp(self):
        from app.api import spa_pages
        from app.api.panel_catalog_api import register_panel_catalog_api
        from app.db import Base
        from app.db.models import BotUser, ChargeCode
        import app.db.models  # noqa: F401

        self._tmpdir = tempfile.TemporaryDirectory()
        engine = pg_engine()
        self.engine = engine
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        self.Session = async_sessionmaker(engine, expire_on_commit=False)
        async with self.Session() as session:
            session.add_all(
                [
                    BotUser(id=5, telegram_id=105, referral_code="shop5", role="reseller"),
                    BotUser(id=6, telegram_id=106, referral_code="shop6", role="reseller"),
                    ChargeCode(code="PLATFORMCODE", amount=1000, reseller_id=None, note="<script>x</script>"),
                    ChargeCode(code="SHOPFIVECODE", amount=2000, reseller_id=5),
                    ChargeCode(code="SHOPSIXCODE", amount=3000, reseller_id=6),
                ]
            )
            await session.commit()

        spa_dir = Path(self._tmpdir.name) / "spa"
        (spa_dir / "gift-codes").mkdir(parents=True)
        (spa_dir / "gift-codes" / "index.html").write_text("<html><body>gift-codes-shell</body></html>", encoding="utf-8")
        self._spa_patch = patch.object(spa_pages, "SPA_DIR", spa_dir)
        self._spa_patch.start()
        spa_pages._cache.clear()

        from app.api.app import render

        self.staff: dict = {}

        async def get_db():
            async with self.Session() as session:
                yield session

        app = FastAPI()
        register_gift_code_pages(app, render=render, require_staff=lambda: self.staff, get_db=get_db)
        register_panel_catalog_api(
            app,
            require_staff=lambda: self.staff,
            require_admin=lambda: self.staff,
            require_perm=lambda permission: _deny_unless_allowed(self.staff, permission),
            require_pg_perm=lambda permission: _deny_unless_allowed(self.staff, permission),
            get_db=get_db,
        )
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        )

    async def asyncTearDown(self):
        from app.api import spa_pages

        self._spa_patch.stop()
        spa_pages._cache.clear()
        await self.client.aclose()
        await self.engine.dispose()
        self._tmpdir.cleanup()

    async def _get(self, staff: dict, url: str = "/api/panel/gift-codes"):
        self.staff.clear()
        self.staff.update(staff)
        return await self.client.get(url)


class GiftCodePageTests(GiftCodeHarness):

    async def test_owner_sees_only_platform_codes_and_notes_stay_data(self):
        response = await self._get(OWNER)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.headers["content-type"].startswith("application/json"))
        codes = {row["code"]: row for row in response.json()["codes"]}
        self.assertEqual(set(codes), {"PLATFORMCODE"})
        # A note is returned as data; the React page renders it as text, never as markup.
        self.assertEqual(codes["PLATFORMCODE"]["note"], "<script>x</script>")

    async def test_shop_staff_see_only_their_own_shop(self):
        response = await self._get(_reseller(["gift_codes"], shop_id=5))
        self.assertEqual([c["code"] for c in response.json()["codes"]], ["SHOPFIVECODE"])
        other = await self._get(_reseller(["gift_codes"], shop_id=6))
        self.assertEqual([c["code"] for c in other.json()["codes"]], ["SHOPSIXCODE"])

    async def test_staff_without_permission_or_shop_get_403_from_the_data_and_home_from_the_page(self):
        for staff in (
            _reseller(["tickets"]),
            _reseller(["gift_codes"], shop_id=None),
            {"role": "pg_staff", "permissions": ["gift_codes"]},
            {"role": "admin", "permissions": []},
        ):
            with self.subTest(staff=staff):
                self.assertEqual((await self._get(staff)).status_code, 403)
                page = await self._get(staff, "/gift-codes")
                self.assertEqual(page.status_code, 303)
                self.assertEqual(page.headers["location"], "/home")

    async def test_the_page_is_the_exported_react_shell_for_allowed_staff(self):
        page = await self._get(_reseller(["gift_codes"], shop_id=5), "/gift-codes")
        self.assertEqual(page.status_code, 200)
        self.assertIn("gift-codes-shell", page.text)
        self.assertEqual(page.headers["cache-control"], "no-store")

    async def test_rules_and_state_labels_are_part_of_each_row(self):
        row = (await self._get(OWNER)).json()["codes"][0]
        for key in ("kind", "amount", "percent", "max_uses", "max_uses_per_user", "used_count", "state", "expiry_label", "expiry_input", "purchase_types"):
            self.assertIn(key, row)
        self.assertEqual(row["state"], "فعال")

    async def test_tab_strip_marks_gift_codes_active(self):
        tabs = (await self._get(_reseller(["gift_codes", "loyalty"], shop_id=5))).json()["tabs"]
        active = [t["key"] for t in tabs if t["active"]]
        self.assertEqual(active, ["gift_codes"])
        self.assertIn("/gift-codes", [t["href"] for t in tabs])


class GiftCodeRedirectTests(GiftCodeHarness):
    """The create, edit and toggle routes now return to the gift-code page."""

    async def asyncSetUp(self):
        await super().asyncSetUp()
        from app.api.app import render
        from app.api.ux20_pages import register_ux20_pages

        async def get_db():
            async with self.Session() as session:
                yield session

        app = FastAPI()
        register_ux20_pages(
            app, render=render, require_staff=lambda: self.staff, require_admin=lambda: self.staff, get_db=get_db
        )
        self.post_client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        )

    async def asyncTearDown(self):
        await self.post_client.aclose()
        await super().asyncTearDown()

    async def test_create_and_toggle_return_to_the_gift_code_page(self):
        self.staff.update(OWNER)
        created = await self.post_client.post("/plans/gift-codes", data={"kind": "wallet", "amount": "1000", "code": "NEWCODE1"})
        self.assertTrue(created.headers["location"].startswith("/gift-codes?ok="))
        failed = await self.post_client.post("/plans/gift-codes", data={"kind": "discount", "percent": "101"})
        self.assertTrue(failed.headers["location"].startswith("/gift-codes?err="))
        toggled = await self.post_client.post("/plans/gift-codes/1/toggle")
        self.assertEqual(toggled.headers["location"], "/gift-codes?ok=1")


if __name__ == "__main__":
    unittest.main()
