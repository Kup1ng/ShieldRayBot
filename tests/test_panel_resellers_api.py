"""JSON data of the React reseller screens: owner/representative scope, guards and no secrets."""

from __future__ import annotations

import json
import tempfile
import unittest
from collections.abc import AsyncIterator
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import FastAPI, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api import spa_pages
from app.api.panel_resellers_api import register_panel_resellers_api
from app.api.reseller_pages import register_reseller_pages
from app.api.reseller_subscription_pages import register_reseller_subscription_pages
from app.api.service_shop_review_pages import register_service_shop_review_pages
from app.db import Base
from app.db.models import (
    BotUser,
    OrgPrincipal,
    PgAdminSubscription,
    ResellerApplication,
    ResellerBillingTransaction,
    ResellerPlan,
    ResellerProfile,
    UserService,
    WalletTransaction,
)
from app.services.org_principals import attach_org_principal_fields, create_principal, ensure_owner_principal
from app.services.platform_identity import is_explicit_owner_staff
from app.services.principal_web_identity import ROLE_PRINCIPAL
from app.services.reseller_panel_list import LIST_SCAN_LIMIT
from app.services.secret_box import encrypt_secret

SECRETS = {
    "pg_admin_password_enc": "PGPASSWORDSECRET",
    "pg_api_key_enc": "PGAPIKEYSECRET",
    "web_password_hash": "WEBHASHSECRET",
    "bot_token": "BOTTOKENSECRET",
    "setup_token": "SETUPTOKENSECRET",
}
HOSTILE_NAME = '<script>alert("x")</script>'
PERMS = "orders,payments"
PG_ROLES = [
    {"id": 10, "name": "Operator", "is_owner": False},
    {"id": 1, "name": "Owner", "is_owner": True},
]


def owner_staff(owner: OrgPrincipal) -> dict[str, Any]:
    return attach_org_principal_fields(
        {"role": "admin", "web_owner": True, "username": "owner", "pg_is_owner": True, "pg_can_create_admin": True},
        owner,
        visible_principal_ids=frozenset({int(owner.id)}),
    )


def l1_staff(principal: OrgPrincipal, *, capable: bool = True) -> dict[str, Any]:
    staff = attach_org_principal_fields(
        {"role": ROLE_PRINCIPAL, "username": f"web_{principal.id}", "pg_is_owner": False, "web_owner": False},
        principal,
        visible_principal_ids=frozenset({int(principal.id)}),
    )
    staff["pg_can_create_admin"] = capable
    staff["pg_actions"] = {"admins": {"create": capable}}
    return staff


def shop_staff(shop_id: int) -> dict[str, Any]:
    return {"role": "reseller", "bot_user_id": shop_id, "permissions": ["dashboard"]}


class PanelResellersApiCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        self.Session = async_sessionmaker(self.engine, expire_on_commit=False, class_=AsyncSession)
        self.session = self.Session()
        await self._seed()
        self.staff: dict[str, Any] = owner_staff(self.owner)

        self.pg = AsyncMock()
        self.pg.get_admin_roles = AsyncMock(return_value=list(PG_ROLES))
        self.pg.get_admins = AsyncMock(
            return_value=[{"username": "shop_a_admin", "total_users": 3, "used_traffic": 5 * 1024**3, "data_limit": 50 * 1024**3}]
        )
        self.pg.get_admins_simple = AsyncMock(return_value=[])
        self.child_pg = AsyncMock()
        self.child_pg.get_admin_roles = AsyncMock(return_value=list(PG_ROLES))
        self.overview = AsyncMock(return_value={"ready": False})
        for target, replacement in (
            ("app.services.reseller_panel_list.get_pg", lambda: self.pg),
            ("app.services.reseller_panel_edit.get_pg", lambda: self.pg),
            ("app.services.reseller_panel_list.get_pg_for_principal", AsyncMock(return_value=self.child_pg)),
            ("app.services.reseller_panel_edit.build_reseller_pg_overview", self.overview),
        ):
            patcher = patch(target, replacement)
            patcher.start()
            self.addCleanup(patcher.stop)

        self.app = FastAPI()

        async def get_db() -> AsyncIterator[AsyncSession]:
            yield self.session

        async def require_staff() -> dict[str, Any]:
            return self.staff

        async def require_admin() -> dict[str, Any]:
            if self.staff.get("role") != "admin" or not is_explicit_owner_staff(self.staff):
                raise HTTPException(status_code=403, detail="forbidden")
            return self.staff

        def render(*_args: Any, **_kwargs: Any) -> None:
            raise AssertionError("the pages are served by the React export, not rendered")

        register_panel_resellers_api(
            self.app, require_staff=require_staff, require_admin=require_admin,
            require_perm=lambda _perm: require_staff, require_pg_perm=lambda _perm: require_staff, get_db=get_db,
        )
        register_reseller_pages(self.app, render=render, require_admin=require_admin, require_staff=require_staff, get_db=get_db)
        register_reseller_subscription_pages(self.app, render=render, require_staff=require_staff, get_db=get_db)
        register_service_shop_review_pages(self.app, render=render, require_admin=require_admin, get_db=get_db)
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://test")

    async def asyncTearDown(self) -> None:
        await self.client.aclose()
        await self.session.close()
        await self.engine.dispose()

    async def _seed(self) -> None:
        session = self.session
        self.owner = await ensure_owner_principal(session)
        session.add_all([
            BotUser(id=3, telegram_id=303, referral_code="s3", role="reseller", full_name=HOSTILE_NAME, username="shopa",
                    wallet_balance=70_000, color_tag="red"),
            BotUser(id=4, telegram_id=404, referral_code="s4", role="reseller", full_name="Shop B owner", username="shopb"),
            BotUser(id=5, telegram_id=505, referral_code="s5", role="user", full_name="Applicant", username="applicant"),
            ResellerPlan(id=1, name="Fixed pack", price=100_000, included_users=10, included_gb=100, duration_days=30,
                         plan_kind="subscription", billing_mode="fixed", is_active=True, sort_order=1,
                         allow_buy_extra=True, extra_gb_price=1000, extra_user_price=5000),
            ResellerPlan(id=2, name="Pay as you go", price=0, plan_kind="subscription", billing_mode="payg",
                         price_per_gb=900, is_active=True, sort_order=2),
        ])
        await session.flush()
        session.add_all([
            ResellerProfile(id=1, user_id=3, pg_admin_username="shop_a_admin", plan_id=1, web_permissions=PERMS,
                            bot_permissions=PERMS, is_active=True, web_username="shop_a_web", bot_username="shop_a_bot",
                            bot_admin_ids="111,222", billing_mode="fixed", **SECRETS),
            ResellerProfile(id=2, user_id=4, pg_admin_username="shop_b_admin", plan_id=2, web_permissions=PERMS,
                            bot_permissions=PERMS, is_active=True, billing_mode="payg", payg_wallet_linked=True),
            ResellerApplication(id=1, user_id=5, plan_id=1, status="awaiting_approval"),
            ResellerApplication(id=2, user_id=5, plan_id=1, status="pending_payment"),
            ResellerApplication(id=3, user_id=5, plan_id=1, status="approved"),
            PgAdminSubscription(pg_username="shop_a_admin", plan_id=1, access_status="active", base_users=10, base_gb=100,
                                renew_generation=2, expires_at=datetime.now(timezone.utc) + timedelta(days=9)),
            UserService(id=1, bot_user_id=5, plan_id=None, pg_username="needs_review", shop_needs_review=True),
        ])
        await session.flush()
        self.l1_a = await create_principal(session, parent_id=int(self.owner.id), depth=1, pg_username="l1_a",
                                           pg_password_enc=encrypt_secret("L1PASSWORD-a1"))
        self.l1_b = await create_principal(session, parent_id=int(self.owner.id), depth=1, pg_username="l1_b",
                                           pg_password_enc=encrypt_secret("L1PASSWORD-b1"))
        await create_principal(session, parent_id=int(self.l1_a.id), depth=2, pg_username="child_a", reseller_profile_id=1)
        await create_principal(session, parent_id=int(self.l1_b.id), depth=2, pg_username="child_b", reseller_profile_id=2)
        session.add(ResellerBillingTransaction(reseller_user_id=4, kind="topup", amount=50_000, balance_after=50_000,
                                               idempotency_key="k1", note="first"))
        session.add(WalletTransaction(user_id=4, amount=50_000, balance_after=50_000, reason="manual", reseller_id=None))
        await session.commit()

    async def get_json(self, url: str, status: int = 200) -> dict[str, Any]:
        response = await self.client.get(url)
        self.assertEqual(response.status_code, status, response.text)
        return response.json()

    def assert_no_secrets(self, body: Any) -> None:
        text = json.dumps(body, ensure_ascii=False)
        for secret in (*SECRETS.values(), "L1PASSWORD"):
            self.assertNotIn(secret, text)


class ResellerListTests(PanelResellersApiCase):
    async def test_the_owner_sees_every_shop_with_usage_and_no_secrets(self) -> None:
        body = await self.get_json("/api/panel/resellers")
        self.assertTrue(body["owner_view"])
        self.assertEqual([row["user_id"] for row in body["rows"]], [4, 3])
        shop_a = next(row for row in body["rows"] if row["user_id"] == 3)
        self.assertEqual(shop_a["name"], HOSTILE_NAME, "text is returned raw; the page escapes it")
        self.assertEqual(shop_a["tag"], {"key": "red", "title": "ریسک بالا"})
        self.assertEqual(shop_a["wallet_balance"], 70_000)
        self.assertIn("3", shop_a["usage"]["users_text"])
        self.assertEqual(shop_a["status"], "active")
        self.assertEqual(body["can_create"], "owner")
        self.assert_no_secrets(body)

    async def test_a_representative_sees_only_the_shops_under_it(self) -> None:
        self.staff = l1_staff(self.l1_a)
        body = await self.get_json("/api/panel/resellers")
        self.assertFalse(body["owner_view"])
        self.assertEqual([row["user_id"] for row in body["rows"]], [3])
        self.assertIsNone(body["rows"][0]["wallet_balance"], "the wallet is the owner's business")
        self.assertEqual(body["can_create"], "child")
        self.assertNotIn("Shop B owner", json.dumps(body, ensure_ascii=False))
        self.assertEqual(body["oversold_ids"], [])
        self.pg.get_admins.assert_not_awaited()
        self.staff = l1_staff(self.l1_b)
        self.assertEqual([row["user_id"] for row in (await self.get_json("/api/panel/resellers"))["rows"]], [4])

    async def test_staff_without_the_right_to_manage_representatives_is_refused(self) -> None:
        for staff in (
            l1_staff(self.l1_a, capable=False),
            shop_staff(3),
            {"role": "pg_staff", "permissions": []},
        ):
            with self.subTest(staff=staff):
                self.staff = staff
                self.assertEqual((await self.client.get("/api/panel/resellers")).status_code, 403)
                self.assertEqual((await self.client.get("/api/panel/resellers/create-options")).status_code, 403)

    async def test_a_disabled_parent_sees_nothing(self) -> None:
        row = await self.session.get(OrgPrincipal, int(self.l1_a.id))
        row.status = "disabled"
        await self.session.commit()
        self.staff = l1_staff(self.l1_a)
        self.assertEqual((await self.client.get("/api/panel/resellers")).status_code, 403)

    async def test_search_and_color_filters_keep_the_scope(self) -> None:
        by_name = await self.get_json("/api/panel/resellers?q=shop_b_admin")
        self.assertEqual([row["user_id"] for row in by_name["rows"]], [4])
        by_color = await self.get_json("/api/panel/resellers?color=red")
        self.assertEqual([row["user_id"] for row in by_color["rows"]], [3])
        self.assertEqual(by_color["color"], "red")
        junk = await self.get_json("/api/panel/resellers?color=%3Cb%3E&page=abc")
        self.assertEqual(junk["color"], "")
        self.assertEqual(junk["pager"]["page"], 1)
        self.staff = l1_staff(self.l1_a)
        self.assertEqual((await self.get_json("/api/panel/resellers?q=shop_b_admin"))["rows"], [])

    async def test_a_page_is_bounded_and_the_pager_says_so(self) -> None:
        async with self.Session() as session:
            for offset in range(60):
                user = BotUser(id=100 + offset, telegram_id=9000 + offset, referral_code=f"x{offset}", role="reseller")
                session.add(user)
                await session.flush()
                session.add(ResellerProfile(user_id=user.id, is_active=True, payg_wallet_linked=True))
            await session.commit()
        first = await self.get_json("/api/panel/resellers")
        self.assertEqual(len(first["rows"]), 50)
        self.assertTrue(first["pager"]["has_next"])
        self.assertEqual(first["pager"]["total"], 62)
        second = await self.get_json("/api/panel/resellers?page=2")
        self.assertEqual(len(second["rows"]), 12)
        self.assertFalse(second["pager"]["has_next"])
        self.assertLessEqual(LIST_SCAN_LIMIT, 5000)

    async def test_the_list_survives_an_unreachable_panel(self) -> None:
        self.pg.get_admins.side_effect = RuntimeError("panel down")
        body = await self.get_json("/api/panel/resellers")
        self.assertEqual(len(body["rows"]), 2)
        self.assertEqual(body["rows"][0]["usage"]["users_text"], "—")

    async def test_a_payg_shop_is_linked_to_its_wallet_on_first_sight(self) -> None:
        async with self.Session() as session:
            profile = await session.get(ResellerProfile, 2)
            profile.payg_wallet_linked = False
            await session.commit()
        await self.get_json("/api/panel/resellers")
        async with self.Session() as session:
            self.assertTrue((await session.get(ResellerProfile, 2)).payg_wallet_linked)


class CreateOptionsTests(PanelResellersApiCase):
    async def test_the_owner_gets_roles_packages_and_switches(self) -> None:
        body = await self.get_json("/api/panel/resellers/create-options")
        self.assertEqual(body["mode"], "owner")
        self.assertEqual([role["id"] for role in body["roles"]], [10, 1])
        self.assertEqual([plan["id"] for plan in body["plans"]], [1, 2])
        self.assertEqual(body["plans"][1]["price_per_gb"], 900)
        self.assertIn("orders", [perm["key"] for perm in body["feature_perms"]])
        self.assert_no_secrets(body)

    async def test_a_representative_gets_its_own_roles_without_owner_roles(self) -> None:
        self.staff = l1_staff(self.l1_a)
        body = await self.get_json("/api/panel/resellers/create-options")
        self.assertEqual(body["mode"], "child")
        self.assertEqual([role["id"] for role in body["roles"]], [10])
        self.assertNotIn("plans", body)
        self.pg.get_admin_roles.assert_not_awaited()


class SettingsAndApplicationsTests(PanelResellersApiCase):
    async def test_the_address_settings_are_the_owners_only(self) -> None:
        body = await self.get_json("/api/panel/resellers/settings")
        self.assertIn("panel_url", body)
        self.assertIn("default_pg_panel_url", body)
        self.assertIsInstance(body["show_reseller_apply"], bool)
        self.staff = l1_staff(self.l1_a)
        self.assertEqual((await self.client.get("/api/panel/resellers/settings")).status_code, 403)

    async def test_applications_list_what_a_reviewer_may_do_per_status(self) -> None:
        body = await self.get_json("/api/panel/resellers/applications")
        ops = {row["id"]: row["ops"] for row in body["rows"]}
        self.assertEqual(ops, {3: [], 2: [], 1: ["approve", "reject"]})
        statuses = {row["id"]: row["status"] for row in body["rows"]}
        self.assertEqual(statuses[2], "cancelled", "a payment that never started is released first, as before")
        first = next(row for row in body["rows"] if row["id"] == 1)
        self.assertEqual((first["user_name"], first["plan_name"], first["price"]), ("Applicant", "Fixed pack", 100_000))

    async def test_applications_are_refused_to_everyone_but_the_owner_who_may_manage(self) -> None:
        for staff in (l1_staff(self.l1_a), shop_staff(3)):
            self.staff = staff
            self.assertEqual((await self.client.get("/api/panel/resellers/applications")).status_code, 403)
        self.staff = owner_staff(self.owner)
        self.staff.update(pg_is_owner=False, pg_can_create_admin=False, pg_actions={"admins": {"create": False}})
        self.assertEqual((await self.client.get("/api/panel/resellers/applications")).status_code, 403)


class ResellerEditTests(PanelResellersApiCase):
    async def test_the_edit_data_has_no_secret_and_says_a_key_is_stored(self) -> None:
        body = await self.get_json("/api/panel/resellers/3/edit")
        self.assertEqual(body["user"]["name"], HOSTILE_NAME)
        self.assertEqual(body["profile"]["web_username"], "shop_a_web")
        self.assertEqual(body["profile"]["bot_admin_ids"], "111,222")
        self.assertTrue(body["pg_api_key_stored"])
        self.assertTrue({"orders", "payments"} <= set(body["selected_perms"]))
        self.assertFalse(body["is_payg"])
        self.assertIsNone(body["payg"])
        self.assertEqual(len(body["topup_nonce"]), 16)
        self.assertEqual(body["pg_subscription"]["total_gb_text"], "100 گیگ")
        self.assertTrue(body["pg_subscription"]["expires_at"])
        self.assert_no_secrets(body)
        self.assertNotIn("password", json.dumps(body).lower().replace("pg_password", ""))

    async def test_a_payg_shop_shows_its_wallet_and_ledgers(self) -> None:
        body = await self.get_json("/api/panel/resellers/4/edit")
        self.assertTrue(body["is_payg"])
        self.assertEqual(body["payg"]["rate_per_gb"] >= 0, True)
        self.assertEqual(body["payg"]["billing_txs"][0]["amount"], 50_000)
        self.assertEqual(body["payg"]["billing_txs"][0]["label"], "topup")
        self.assertEqual(body["payg"]["wallet_txs"][0]["label"], "manual")

    async def test_limits_and_capacity_come_from_the_panel_overview_when_it_is_ready(self) -> None:
        self.overview.return_value = {
            "ready": True, "username": "shop_a_admin", "status_label": "فعال", "status_badge": "ok", "role_name": "Operator",
            "users": {"has_limit": True, "pct": 30.0, "remain_pct": 70.0, "tone": "ok", "exhausted": False,
                      "used_text": "3", "limit_text": "10", "remain_text": "7", "ratio_text": "3/10", "label": "internal"},
            "traffic": None, "lifetime_text": "9 GB", "error": "internal detail",
        }
        body = await self.get_json("/api/panel/resellers/3/edit")
        self.assertEqual(body["pg_limits"]["users"]["ratio_text"], "3/10")
        self.assertNotIn("label", body["pg_limits"]["users"])
        self.assertNotIn("internal detail", json.dumps(body))

    async def test_only_the_owner_opens_it_and_a_missing_shop_goes_back_to_the_list(self) -> None:
        missing = await self.get_json("/api/panel/resellers/999/edit")
        self.assertTrue(missing["redirect"].startswith("/resellers?err="))
        for staff in (l1_staff(self.l1_a), shop_staff(3)):
            self.staff = staff
            self.assertEqual((await self.client.get("/api/panel/resellers/3/edit")).status_code, 403)


class ColorTagTests(PanelResellersApiCase):
    async def test_the_picker_data_is_scoped_to_the_representatives_shops(self) -> None:
        self.staff = l1_staff(self.l1_a)
        own = await self.get_json("/api/panel/resellers/3/color-tag")
        self.assertEqual(own["color_tag"], "red")
        self.assertEqual([tag["key"] for tag in own["tags"]], ["green", "yellow", "orange", "red"])
        self.assertEqual((await self.client.get("/api/panel/resellers/4/color-tag")).status_code, 403)
        missing = await self.get_json("/api/panel/resellers/999/color-tag")
        self.assertTrue(missing["redirect"].startswith("/resellers?err="))

    async def test_the_owner_may_tag_any_shop_and_others_are_refused(self) -> None:
        self.assertEqual((await self.get_json("/api/panel/resellers/4/color-tag"))["color_tag"], "green")
        for staff in (shop_staff(3), l1_staff(self.l1_a, capable=False)):
            self.staff = staff
            self.assertEqual((await self.client.get("/api/panel/resellers/3/color-tag")).status_code, 403)


class MySubscriptionTests(PanelResellersApiCase):
    async def test_the_owner_sees_only_its_own_package_and_wallet(self) -> None:
        self.staff = shop_staff(3)
        with patch("app.services.reseller_package.read_admin_usage", AsyncMock(return_value=None)):
            body = await self.get_json("/api/panel/my-subscription")
        self.assertEqual(body["wallet"], 70_000)
        self.assertEqual(body["overview"]["current_name"], "Fixed pack")
        self.assertEqual(body["overview"]["generation"], 2)
        self.assertEqual(body["overview"]["users_total"], 10)
        self.assertIsNone(body["overview"]["users_used"])
        self.assertEqual(body["overview"]["choices"][0]["plan_id"], 1)
        self.assertEqual(body["overview"]["choices"][0]["price"], 100_000)
        self.assertEqual(body["extras"]["gb_price"], 1000)
        self.assertEqual(body["extras"]["gb_options"], [1, 5, 10, 50])
        payg = next(choice for choice in body["overview"]["choices"] if choice["plan_id"] == 2)
        self.assertTrue(payg["blocked"], "a package the owner cannot switch to is listed with the reason")
        self.assert_no_secrets(body)

    async def test_a_payg_shop_is_told_there_is_nothing_to_renew(self) -> None:
        self.staff = shop_staff(4)
        body = await self.get_json("/api/panel/my-subscription")
        self.assertIsNone(body["overview"])
        self.assertIn("PAYG", body["unavailable"])

    async def test_only_the_shop_owner_reaches_it(self) -> None:
        for staff in (owner_staff(self.owner), l1_staff(self.l1_a), {"role": "reseller"}, {"role": "principal", "bot_user_id": 3}):
            with self.subTest(staff=staff.get("role")):
                self.staff = staff
                self.assertEqual((await self.client.get("/api/panel/my-subscription")).status_code, 403)


class ShopReviewTests(PanelResellersApiCase):
    async def test_the_owner_sees_the_queue_and_the_shops_to_choose(self) -> None:
        body = await self.get_json("/api/panel/service-shop-review")
        self.assertEqual(body["rows"][0]["pg_username"], "needs_review")
        self.assertEqual({shop["id"] for shop in body["shops"]}, {3, 4})

    async def test_nobody_but_the_owner_sees_it(self) -> None:
        for staff in (l1_staff(self.l1_a), shop_staff(3)):
            self.staff = staff
            self.assertEqual((await self.client.get("/api/panel/service-shop-review")).status_code, 403)


class PageShellTests(PanelResellersApiCase):
    async def asyncSetUp(self) -> None:
        await super().asyncSetUp()
        self.spa = tempfile.TemporaryDirectory()
        for page in ("resellers", "resellers/edit", "resellers/applications", "my-subscription", "service-shop-review"):
            folder = Path(self.spa.name) / page
            folder.mkdir(parents=True)
            (folder / "index.html").write_text(f"<html>{page}</html>", encoding="utf-8")
        patcher = patch.object(spa_pages, "SPA_DIR", Path(self.spa.name))
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(self.spa.cleanup)

    async def test_each_page_is_served_to_the_staff_that_may_open_it(self) -> None:
        for path, expected in (
            ("/resellers", "resellers"),
            ("/resellers/3/edit", "resellers/edit"),
            ("/resellers/applications", "resellers/applications"),
            ("/service-shop-review", "service-shop-review"),
        ):
            response = await self.client.get(path)
            self.assertEqual(response.status_code, 200, path)
            self.assertIn(expected, response.text)
        self.staff = shop_staff(3)
        self.assertIn("my-subscription", (await self.client.get("/my-subscription")).text)

    async def test_the_shells_keep_their_guards(self) -> None:
        self.staff = l1_staff(self.l1_a)
        self.assertEqual((await self.client.get("/resellers")).status_code, 200)
        for path in ("/resellers/3/edit", "/resellers/applications", "/service-shop-review", "/my-subscription"):
            self.assertEqual((await self.client.get(path)).status_code, 403, path)
        self.staff = l1_staff(self.l1_a, capable=False)
        self.assertEqual((await self.client.get("/resellers")).status_code, 403)

    async def test_a_missing_shop_redirects_to_the_list_with_the_old_message(self) -> None:
        response = await self.client.get("/resellers/999/edit", follow_redirects=False)
        self.assertEqual(response.status_code, 303)
        self.assertTrue(response.headers["location"].startswith("/resellers?err="))

    async def test_the_color_tag_url_keeps_its_scope_and_leads_to_the_list(self) -> None:
        ok = await self.client.get("/resellers/3/color-tag", follow_redirects=False)
        self.assertEqual((ok.status_code, ok.headers["location"]), (303, "/resellers"))
        self.staff = l1_staff(self.l1_a)
        self.assertEqual((await self.client.get("/resellers/4/color-tag", follow_redirects=False)).status_code, 403)
