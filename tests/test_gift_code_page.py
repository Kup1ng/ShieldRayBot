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
        for key in ("kind", "amount", "percent", "max_uses", "max_uses_per_user", "used_count", "state", "expiry_label", "expiry_days", "plans_label", "plan_ids", "purchase_types"):
            self.assertIn(key, row)
        self.assertEqual(row["state"], "فعال")

    async def test_tab_strip_marks_gift_codes_active(self):
        tabs = (await self._get(_reseller(["gift_codes", "loyalty"], shop_id=5))).json()["tabs"]
        active = [t["key"] for t in tabs if t["active"]]
        self.assertEqual(active, ["gift_codes"])
        self.assertIn("/gift-codes", [t["href"] for t in tabs])


class GiftCodeFormDataTests(GiftCodeHarness):
    """What the React form needs: the days left, the plans a code can be limited to, and the caps."""

    async def test_expiry_is_given_in_whole_days_left_and_empty_without_one(self):
        from datetime import datetime, timedelta, timezone

        from app.db.models import ChargeCode

        now = datetime.now(timezone.utc)
        async with self.Session() as session:
            session.add_all(
                [
                    ChargeCode(code="IN4DAYS", amount=1, reseller_id=5, expires_at=now + timedelta(days=3, hours=20)),
                    ChargeCode(code="GONE", amount=1, reseller_id=5, expires_at=now - timedelta(hours=2)),
                ]
            )
            await session.commit()
        rows = {row["code"]: row for row in (await self._get(_reseller(["gift_codes"], shop_id=5))).json()["codes"]}
        self.assertEqual(rows["IN4DAYS"]["expiry_days"], "4")
        self.assertEqual(rows["GONE"]["expiry_days"], "0")
        self.assertEqual(rows["GONE"]["state"], "منقضی")
        self.assertEqual(rows["SHOPFIVECODE"]["expiry_days"], "")
        self.assertNotIn("expiry_input", rows["IN4DAYS"])

    async def test_a_shop_is_offered_only_its_own_sellable_plans_and_names_them_on_a_limited_code(self):
        from app.db.models import ChargeCode, Plan

        async with self.Session() as session:
            session.add_all(
                [
                    Plan(id=71, name="پلن پنج", price=10, duration_days=30, owner_reseller_id=5),
                    Plan(id=72, name="پلن پنج خاموش", price=10, duration_days=30, owner_reseller_id=5, is_active=False),
                    Plan(id=73, name="تست پنج", price=0, duration_days=1, owner_reseller_id=5, is_trial=True),
                    Plan(id=74, name="پلن شش", price=10, duration_days=30, owner_reseller_id=6),
                ]
            )
            await session.flush()
            session.add(ChargeCode(code="LIMITED", kind="discount", percent=10, reseller_id=5, plan_ids="71,72", purchase_types="new"))
            await session.commit()
        body = (await self._get(_reseller(["gift_codes"], shop_id=5))).json()
        self.assertEqual({p["id"]: p["active"] for p in body["plans"]}, {71: True, 72: False})
        limited = next(row for row in body["codes"] if row["code"] == "LIMITED")
        self.assertEqual(limited["plan_ids"], [71, 72])
        self.assertEqual(limited["plans_label"], "پلن پنج، پلن پنج خاموش")
        other = (await self._get(_reseller(["gift_codes"], shop_id=6))).json()
        self.assertEqual([p["id"] for p in other["plans"]], [74])
        self.assertTrue(all(row["plan_ids"] == [] for row in other["codes"]))

    async def test_the_caps_the_form_validates_against_come_from_the_service(self):
        from app.services.gift_codes import MAX_AMOUNT, MAX_EXPIRY_DAYS, MAX_USES

        limits = (await self._get(OWNER)).json()["limits"]
        self.assertEqual((limits["max_amount"], limits["max_uses"], limits["max_expiry_days"]), (MAX_AMOUNT, MAX_USES, MAX_EXPIRY_DAYS))


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

    async def test_the_react_form_fields_create_and_edit_a_code_in_days_limited_to_a_plan(self):
        from app.db.models import ChargeCode, Plan

        async with self.Session() as session:
            session.add(Plan(id=81, name="پلن", price=10, duration_days=30, owner_reseller_id=None))
            await session.commit()
        self.staff.update(OWNER)
        created = await self.post_client.post(
            "/plans/gift-codes",
            data={
                "kind": "discount", "percent": "15", "max_discount_toman": "", "first_purchase_only": "1",
                "purchase_types": ["new"], "plan_ids": ["81"], "max_uses": "", "max_uses_per_user": "2",
                "expires_in_days": "30", "expires_in_days_shown": "", "code": "REACTDAYS", "note": "n",
            },
        )
        self.assertTrue(created.headers["location"].startswith("/gift-codes?ok="), created.headers["location"])
        row = next(c for c in (await self._get(OWNER)).json()["codes"] if c["code"] == "REACTDAYS")
        self.assertEqual((row["expiry_days"], row["plan_ids"], row["max_uses"], row["max_uses_per_user"]), ("30", [81], None, 2))
        shown = row["expiry_days"]
        async with self.Session() as session:
            before = (await session.get(ChargeCode, row["id"])).expires_at
        # Saving the days the form showed keeps the exact expiry; clearing the field removes it.
        edit_fields = {
            "kind": "discount", "percent": "20", "purchase_types": ["new"], "first_purchase_only": "1", "plan_ids": ["81"],
            "max_uses": "", "max_uses_per_user": "2", "expires_in_days_shown": shown,
        }
        edited = await self.post_client.post(
            f"/plans/gift-codes/{row['id']}/edit", data={**edit_fields, "expires_in_days": shown}
        )
        self.assertTrue(edited.headers["location"].startswith("/gift-codes?ok="), edited.headers["location"])
        async with self.Session() as session:
            kept = await session.get(ChargeCode, row["id"])
            self.assertEqual((kept.percent, kept.expires_at), (20, before))
        await self.post_client.post(f"/plans/gift-codes/{row['id']}/edit", data={**edit_fields, "expires_in_days": ""})
        row = next(c for c in (await self._get(OWNER)).json()["codes"] if c["code"] == "REACTDAYS")
        self.assertEqual(row["expiry_days"], "")

    async def test_a_date_time_or_out_of_range_expiry_is_refused(self):
        from app.services.gift_codes import MAX_EXPIRY_DAYS

        self.staff.update(OWNER)
        for raw in ("2030-01-01 23:59", "0", "-1", str(MAX_EXPIRY_DAYS + 1)):
            with self.subTest(raw=raw):
                response = await self.post_client.post(
                    "/plans/gift-codes", data={"kind": "wallet", "amount": "1000", "expires_in_days": raw}
                )
                self.assertTrue(response.headers["location"].startswith("/gift-codes?err="), raw)

    async def test_a_shop_cannot_limit_its_code_to_another_shops_plan(self):
        from app.db.models import Plan

        async with self.Session() as session:
            session.add(Plan(id=82, name="پلن شش", price=10, duration_days=30, owner_reseller_id=6))
            await session.commit()
        shop = _reseller(["gift_codes"], shop_id=5)
        self.staff.update(shop)
        response = await self.post_client.post(
            "/plans/gift-codes",
            data={"kind": "discount", "percent": "10", "plan_ids": ["82"], "purchase_types": ["new"], "code": "FOREIGNPLAN"},
        )
        self.assertTrue(response.headers["location"].startswith("/gift-codes?err="))
        codes = (await self._get(shop)).json()["codes"]
        self.assertFalse(any(c["code"] == "FOREIGNPLAN" for c in codes))

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
