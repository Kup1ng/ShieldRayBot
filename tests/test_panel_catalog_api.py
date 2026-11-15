"""JSON endpoints behind the React catalog pages: permissions, shop isolation, secrets, bounds."""

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")

import httpx
from fastapi import FastAPI, HTTPException
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api import spa_pages
from app.api.panel_catalog_api import register_panel_catalog_api
from app.db import Base
from app.db.models import (
    BotUser,
    CatalogDiscount,
    ChargeCode,
    Plan,
    PlanCategory,
    ResellerPlan,
    ServiceAddonPack,
    Setting,
)
from app.services.authz import authz_from_staff, can_shop
from app.services.panel_catalog_plans import DEFAULT_WHOLESALE_TIERS, parse_wholesale_tiers, serialize_custom
from app.services.platform_identity import is_explicit_owner_staff
from app.services.users import _SETTINGS_CACHE

OWNER = {"role": "admin", "permissions": [], "org_principal_id": 1, "org_depth": 0, "org_parent_id": None, "org_status": "active"}
SHOP2 = {"role": "reseller", "permissions": ["plans", "catalog_discounts", "shop_settings"], "bot_user_id": 2}
SHOP3 = {"role": "reseller", "permissions": ["plans", "catalog_discounts"], "bot_user_id": 3}
SHOP_NO_PLANS = {"role": "reseller", "permissions": ["orders"], "bot_user_id": 2}

PLAN_ROW_KEYS = {
    "id", "name", "price", "duration_days", "data_limit_gb", "pg_template_id", "pg_group_ids", "category_id",
    "category_name", "is_active", "template_missing", "source_empty", "limit_issue",
}
RESELLER_ROW_KEYS = {
    "id", "group", "name", "description", "price", "plan_kind", "billing_mode", "price_per_gb", "pg_group_ids",
    "addon_gb", "addon_users", "is_system", "is_active", "category_id", "category_name",
}


class CatalogApiCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.engine = create_async_engine(f"sqlite+aiosqlite:///{Path(self._tmp.name) / 'c.db'}")
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        self.Session = async_sessionmaker(self.engine, expire_on_commit=False)
        _SETTINGS_CACHE.clear()
        await self._seed()

        self.staff: dict = {}

        def require_perm(permission: str):
            def dependency() -> dict:
                if not can_shop(authz_from_staff(self.staff), permission):
                    raise HTTPException(403, "forbidden")
                return self.staff

            return dependency

        def require_admin() -> dict:
            if self.staff.get("role") != "admin" or not is_explicit_owner_staff(self.staff):
                raise HTTPException(403, "forbidden")
            return self.staff

        async def get_db():
            async with self.Session() as session:
                yield session

        app = FastAPI()
        register_panel_catalog_api(
            app,
            require_staff=lambda: self.staff,
            require_admin=require_admin,
            require_perm=require_perm,
            require_pg_perm=require_perm,
            get_db=get_db,
        )
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")

        pg = MagicMock()
        pg.get_groups_simple = AsyncMock(return_value=[{"id": 1, "name": "G1", "secret": "x"}])
        pg.get_admin_roles = AsyncMock(return_value=[{"id": 4, "name": "R4", "token": "y"}])
        for target, value in (
            ("app.services.panel_catalog_plans.load_pg_plan_options", AsyncMock(return_value=([{"id": 5, "name": "T5", "extra": "z"}], [{"id": 1, "name": "G1"}], None))),
            ("app.services.panel_catalog_plans.load_staff_limit_snapshot", AsyncMock(return_value={"restricted": False})),
            ("app.services.panel_catalog_plans.plan_limit_issue", AsyncMock(return_value=None)),
            ("app.services.pasarguard.get_pg", MagicMock(return_value=pg)),
        ):
            patcher = patch(target, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    async def asyncTearDown(self) -> None:
        await self.client.aclose()
        await self.engine.dispose()
        self._tmp.cleanup()
        _SETTINGS_CACHE.clear()

    async def _seed(self) -> None:
        async with self.Session() as session:
            session.add_all(
                [
                    BotUser(id=2, telegram_id=102, referral_code="shop2", role="reseller"),
                    BotUser(id=3, telegram_id=103, referral_code="shop3", role="reseller"),
                ]
            )
            await session.flush()
            session.add_all(
                [
                    PlanCategory(id=1, name="PlatformCat", owner_reseller_id=None),
                    PlanCategory(id=2, name="Shop2Cat", owner_reseller_id=2),
                    Plan(id=1, name="PlatformPlan", price=100, duration_days=30, owner_reseller_id=None, pg_template_id=99),
                    Plan(id=2, name="Shop2Plan", price=200, duration_days=30, owner_reseller_id=2, category_id=2, pg_group_ids="1,2"),
                    Plan(id=3, name="Shop3Plan", price=300, duration_days=30, owner_reseller_id=3),
                    ResellerPlan(id=1, name="ResellerPackage", price=500, plan_kind="subscription", billing_mode="payg", price_per_gb=7, pg_group_ids="1"),
                    ResellerPlan(id=2, name="ResellerPack", price=50, plan_kind="addon_volume", addon_gb=5),
                    ServiceAddonPack(id=1, name="PlatformPack", kind="volume", amount=10, price=10, owner_reseller_id=None),
                    ServiceAddonPack(id=2, name="Shop2Pack", kind="duration", amount=7, price=20, owner_reseller_id=2, category_id=2, is_general=False),
                    Setting(key="bot_token", value="SECRET-TOKEN-VALUE"),
                    Setting(key="trial_enabled", value="1"),
                ]
            )
            await session.commit()

    async def get(self, staff: dict, path: str) -> httpx.Response:
        self.staff.clear()
        self.staff.update(staff)
        return await self.client.get(path)


class PlansOverviewTests(CatalogApiCase):
    async def test_owner_sees_platform_catalog_only_with_explicit_fields(self) -> None:
        response = await self.get(OWNER, "/api/panel/plans")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["cache-control"], "no-store")
        body = response.json()
        self.assertTrue(body["is_platform_admin"])
        self.assertEqual([p["name"] for p in body["plans"]], ["PlatformPlan"])
        for row in body["plans"]:
            self.assertEqual(set(row), PLAN_ROW_KEYS)
        self.assertEqual([c["name"] for c in body["categories"]], ["PlatformCat"])
        self.assertEqual([a["name"] for a in body["addon_packs"]], ["PlatformPack"])
        # The reseller plans, PasarGuard roles and permission list are Owner-only data.
        self.assertTrue(body["reseller_plans"])
        for row in body["reseller_plans"]:
            self.assertEqual(set(row), RESELLER_ROW_KEYS)
        self.assertEqual(body["pg_roles"], [{"id": 4, "name": "R4"}])
        self.assertEqual(body["templates"], [{"id": 5, "name": "T5"}])

    async def test_a_shop_never_sees_another_shop_or_the_platform(self) -> None:
        body = (await self.get(SHOP2, "/api/panel/plans")).json()
        self.assertFalse(body["is_platform_admin"])
        self.assertEqual([p["name"] for p in body["plans"]], ["Shop2Plan"])
        self.assertEqual([c["name"] for c in body["categories"]], ["Shop2Cat"])
        self.assertEqual([a["name"] for a in body["addon_packs"]], ["Shop2Pack"])
        self.assertEqual(body["plans"][0]["category_name"], "Shop2Cat")
        self.assertEqual(body["categories"][0]["linked_plans"], ["Shop2Plan"])
        self.assertEqual(body["categories"][0]["linked_packs"], ["Shop2Pack"])
        self.assertEqual((body["reseller_plans"], body["pg_roles"], body["feature_perms"]), ([], [], []))
        other = (await self.get(SHOP3, "/api/panel/plans")).json()
        self.assertEqual([p["name"] for p in other["plans"]], ["Shop3Plan"])
        self.assertEqual(other["categories"], [])

    async def test_settings_and_secrets_do_not_leak(self) -> None:
        for staff in (OWNER, SHOP2):
            text = (await self.get(staff, "/api/panel/plans")).text
            for secret in ("SECRET-TOKEN-VALUE", "bot_token", '"extra"', '"secret"', '"token"'):
                self.assertNotIn(secret, text, (staff["role"], secret))

    async def test_missing_permission_is_refused(self) -> None:
        self.assertEqual((await self.get(SHOP_NO_PLANS, "/api/panel/plans")).status_code, 403)
        self.assertEqual((await self.get({"role": "pg_staff", "permissions": []}, "/api/panel/plans")).status_code, 403)

    async def test_trial_custom_and_wholesale_carry_their_defaults(self) -> None:
        body = (await self.get(OWNER, "/api/panel/plans")).json()
        self.assertTrue(body["trial"]["enabled"])
        self.assertFalse(body["trial"]["exists"])
        self.assertEqual(body["custom"]["min_gb"], "1")
        self.assertEqual(body["custom"]["max_days"], "365")
        self.assertEqual(body["wholesale"]["tiers"], DEFAULT_WHOLESALE_TIERS)
        self.assertEqual(body["naming_defaults"]["pattern"], "{prefix}_{random}{suffix}")

    async def test_a_plan_whose_template_is_gone_or_has_no_source_is_flagged(self) -> None:
        body = (await self.get(OWNER, "/api/panel/plans")).json()
        row = body["plans"][0]
        self.assertTrue(row["template_missing"])
        self.assertFalse(row["source_empty"])
        shop = (await self.get(SHOP3, "/api/panel/plans")).json()["plans"][0]
        self.assertTrue(shop["source_empty"])


class PlanEditTests(CatalogApiCase):
    async def test_a_plan_of_another_shop_or_the_platform_is_not_found(self) -> None:
        self.assertEqual((await self.get(SHOP2, "/api/panel/plans/1")).status_code, 404)
        self.assertEqual((await self.get(SHOP2, "/api/panel/plans/3")).status_code, 404)
        self.assertEqual((await self.get(OWNER, "/api/panel/plans/2")).status_code, 404)
        self.assertEqual((await self.get(OWNER, "/api/panel/plans/404")).status_code, 404)

    async def test_the_owner_of_a_plan_gets_its_form_data(self) -> None:
        body = (await self.get(SHOP2, "/api/panel/plans/2")).json()
        self.assertEqual(body["plan"]["name"], "Shop2Plan")
        self.assertEqual(body["plan"]["pg_group_ids"], ["1", "2"])
        self.assertEqual(body["plan"]["button_style"], "inherit")
        self.assertEqual([c["name"] for c in body["categories"]], ["Shop2Cat"])
        self.assertEqual(body["templates"], [{"id": 5, "name": "T5"}])

    async def test_permission_is_checked(self) -> None:
        self.assertEqual((await self.get(SHOP_NO_PLANS, "/api/panel/plans/2")).status_code, 403)


class ResellerPlanEditTests(CatalogApiCase):
    async def test_only_the_owner_reads_reseller_plans(self) -> None:
        self.assertEqual((await self.get(SHOP2, "/api/panel/plans/reseller/1")).status_code, 403)
        response = await self.get(OWNER, "/api/panel/plans/reseller/1")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["plan"]["billing_mode"], "payg")
        self.assertEqual(body["groups"], [{"id": 1, "name": "G1"}])
        self.assertEqual(body["pg_roles"], [{"id": 4, "name": "R4"}])
        self.assertIn(["plans", "پلن‌های فروش"], body["feature_perms"])
        self.assertNotIn("secret", response.text)
        self.assertNotIn('"token"', response.text)

    async def test_unknown_plan_is_not_found(self) -> None:
        self.assertEqual((await self.get(OWNER, "/api/panel/plans/reseller/999")).status_code, 404)


class DiscountsApiTests(CatalogApiCase):
    async def _add_history(self, count: int, shop_id: int) -> None:
        async with self.Session() as session:
            session.add_all(
                CatalogDiscount(
                    shop_key=shop_id, reseller_id=shop_id, title=f"d{i}", scope="all", mode="permanent",
                    reduction_kind="percent", reduction_value=5, is_active=False, request_key=f"k{shop_id}-{i}",
                )
                for i in range(count)
            )
            await session.commit()

    async def test_history_is_bounded_per_page_and_scoped_to_the_shop(self) -> None:
        await self._add_history(55, 2)
        await self._add_history(3, 3)
        first = (await self.get(SHOP2, "/api/panel/catalog-discounts")).json()
        self.assertEqual(len(first["rows"]), 50)
        self.assertIsNotNone(first["next_before"])
        self.assertEqual(len(first["request_key"]), 32)
        second = (await self.get(SHOP2, f"/api/panel/catalog-discounts?before={first['next_before']}")).json()
        self.assertEqual(len(second["rows"]), 5)
        self.assertIsNone(second["next_before"])
        other = (await self.get(SHOP3, "/api/panel/catalog-discounts")).json()
        self.assertEqual({r["title"] for r in other["rows"]}, {"d0", "d1", "d2"})

    async def test_a_bad_page_marker_is_a_400_and_missing_permission_a_403(self) -> None:
        self.assertEqual((await self.get(SHOP2, "/api/panel/catalog-discounts?before=abc")).status_code, 400)
        self.assertEqual((await self.get(SHOP2, "/api/panel/catalog-discounts?before=0")).status_code, 400)
        self.assertEqual((await self.get(SHOP_NO_PLANS, "/api/panel/catalog-discounts")).status_code, 403)

    async def test_plan_targets_are_the_shop_plans_only(self) -> None:
        body = (await self.get(SHOP2, "/api/panel/catalog-discounts")).json()
        self.assertEqual([p["name"] for p in body["plans"]], ["Shop2Plan"])
        self.assertEqual([c["name"] for c in body["categories"]], ["Shop2Cat"])


class GiftCodeListTests(CatalogApiCase):
    async def test_codes_are_bounded_to_the_list_limit(self) -> None:
        async with self.Session() as session:
            session.add_all(ChargeCode(code=f"C{i:04d}", amount=10, reseller_id=2) for i in range(230))
            await session.commit()
        owner_shop = {"role": "reseller", "permissions": ["gift_codes"], "bot_user_id": 2}
        body = (await self.get(owner_shop, "/api/panel/gift-codes")).json()
        self.assertEqual(len(body["codes"]), body["limits"]["list_limit"])
        self.assertEqual(body["codes"][0]["code"], "C0229")


class PureHelperTests(unittest.TestCase):
    def test_broken_wholesale_tiers_fall_back_to_the_defaults(self) -> None:
        for raw in (None, "", "not json", "{}", "[{}]", '[{"min": "x", "percent": 1}]'):
            self.assertEqual(parse_wholesale_tiers(raw), DEFAULT_WHOLESALE_TIERS, raw)
        self.assertEqual(parse_wholesale_tiers('[{"min": 3, "percent": "15"}]'), [{"min": 3, "percent": 15}])

    def test_custom_plan_colour_override_is_only_a_real_colour(self) -> None:
        for stored, expected in (("", "inherit"), (None, "inherit"), ("inherit", "inherit"), ("danger", "danger")):
            values = {} if stored is None else {"custom_plan_button_style": stored}
            self.assertEqual(serialize_custom(values, limit_issue=None)["button_style"], expected)


class PageRouteTests(unittest.IsolatedAsyncioTestCase):
    """The old page URLs serve the exported React pages behind their old guards."""

    async def asyncSetUp(self) -> None:
        from tests.test_update_owner_only import RoutesHarness

        class Harness(RoutesHarness):
            async def runTest(self) -> None:  # pragma: no cover - never run directly
                return None

        self.harness = Harness()
        await self.harness.asyncSetUp()
        self.addCleanup(self.harness.asyncTearDown)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        spa = Path(self.tmp.name)
        for page in ("plans", "plans/edit", "resellers/plans/edit", "gift-codes", "catalog-discounts", "message-variables"):
            (spa / page).mkdir(parents=True, exist_ok=True)
            (spa / page / "index.html").write_text(f"<html>shell:{page}</html>", encoding="utf-8")
        patcher = patch.object(spa_pages, "SPA_DIR", spa)
        patcher.start()
        self.addCleanup(patcher.stop)
        spa_pages._cache.clear()
        self.addCleanup(spa_pages._cache.clear)

    async def test_the_owner_gets_the_exported_pages(self) -> None:
        from tests.test_update_owner_only import OWNER_SESSION

        for path, shell in (
            ("/plans", "plans"),
            ("/gift-codes", "gift-codes"),
            ("/message-variables", "message-variables"),
        ):
            response = await self.harness.call(OWNER_SESSION, "GET", path)
            self.assertEqual(response.status_code, 200, path)
            self.assertIn(f"shell:{shell}", response.text)
            self.assertIn("no-store", response.headers["cache-control"])

    async def test_the_old_gift_modal_link_still_moves_to_the_gift_code_page(self) -> None:
        from tests.test_update_owner_only import OWNER_SESSION

        response = await self.harness.call(OWNER_SESSION, "GET", "/plans?gifts=1&ok=x")
        self.assertEqual(response.status_code, 303)
        self.assertEqual(response.headers["location"], "/gift-codes?ok=x")

    async def test_the_edit_page_of_a_missing_plan_goes_back_to_the_list(self) -> None:
        from tests.test_update_owner_only import OWNER_SESSION

        response = await self.harness.call(OWNER_SESSION, "GET", "/plans/999/edit")
        self.assertEqual(response.status_code, 303)
        self.assertTrue(response.headers["location"].startswith("/plans?err="))

    async def test_staff_without_the_permission_never_get_the_shell_or_the_data(self) -> None:
        from tests.test_update_owner_only import PG_STAFF_SESSION

        for path in ("/plans", "/api/panel/plans", "/api/panel/plans/reseller/1"):
            response = await self.harness.call(PG_STAFF_SESSION, "GET", path)
            self.assertNotEqual(response.status_code, 200, path)
            self.assertNotIn("shell:", response.text)


if __name__ == "__main__":
    unittest.main()
