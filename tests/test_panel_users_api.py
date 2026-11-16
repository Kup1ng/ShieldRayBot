"""JSON data of the React customer screens: shop isolation, permissions and no secrets."""

from __future__ import annotations

import json
import tempfile
import unittest
from collections.abc import AsyncIterator, Callable
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from unittest.mock import patch

import httpx
from fastapi import FastAPI, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api import spa_pages
from app.api.panel_users_api import register_panel_users_api
from app.api.trial_users_pages import register_trial_users_pages
from app.api.user_pages import register_user_pages
from app.db.models import Base, BotUser, BotUserShop, Order, Plan, ShopWallet, UserService, WalletTransaction
from app.services.authz import authz_from_staff, can_shop
from app.services.users_list_view import LIST_LIMIT

OWNER = {"role": "admin", "org_principal_id": 1, "org_depth": 0, "org_status": "active", "permissions": []}
SHOP_A, SHOP_B = 10, 20
SECRET_URL = "https://panel.example/sub/SECRETTOKEN123"
HOSTILE_NAME = '<script>alert("x")</script>'


def shop_staff(shop_id: int, permissions: list[str] | None = None, **extra: Any) -> dict[str, Any]:
    return {
        "role": "reseller",
        "bot_user_id": shop_id,
        "permissions": ["dashboard"] if permissions is None else permissions,
        **extra,
    }


class PanelUsersApiTestCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        self.session = async_sessionmaker(self.engine, expire_on_commit=False)()
        now = datetime.now(timezone.utc)
        self.session.add_all([
            BotUser(id=SHOP_A, telegram_id=5010, referral_code="shopa", role="reseller"),
            BotUser(id=SHOP_B, telegram_id=5020, referral_code="shopb", role="reseller"),
            Plan(id=1, name="Monthly", price=100, duration_days=30, data_limit_gb=50),
            Plan(id=2, name="Shop A plan", price=100, duration_days=30, data_limit_gb=10, owner_reseller_id=SHOP_A),
        ])
        await self.session.flush()
        self.session.add_all([
            BotUser(id=11, telegram_id=9011, referral_code="c11", full_name=HOSTILE_NAME, username="alice",
                    reseller_id=SHOP_A, wallet_balance=50, created_at=now),
            BotUser(id=21, telegram_id=9021, referral_code="c21", full_name="Bob of shop B", reseller_id=SHOP_B,
                    wallet_balance=60, created_at=now),
            BotUser(id=1, telegram_id=9001, referral_code="c1", full_name="Platform customer", wallet_balance=70,
                    color_tag="red", created_at=now),
        ])
        await self.session.flush()
        self.session.add_all([
            ShopWallet(user_id=11, reseller_id=SHOP_A, balance=80),
            ShopWallet(user_id=21, reseller_id=SHOP_B, balance=90),
            BotUserShop(bot_user_id=11, shop_id=SHOP_A, color_tag="orange", staff_note="slow payer"),
            WalletTransaction(user_id=11, reseller_id=SHOP_A, amount=80, balance_after=80, reason="shop credit"),
            WalletTransaction(user_id=11, reseller_id=None, amount=50, balance_after=50, reason="platform credit"),
            UserService(id=1, bot_user_id=11, plan_id=2, pg_username="shop_a_service", shop_id=SHOP_A,
                        subscription_url=SECRET_URL, subscription_token="SECRETTOKEN123",
                        quota_synced_at=now, quota_expire_at=now + timedelta(days=2),
                        quota_data_limit_bytes=10 * 1024**3),
            UserService(id=2, bot_user_id=21, plan_id=1, pg_username="shop_b_service", shop_id=SHOP_B),
            UserService(id=3, bot_user_id=1, plan_id=1, pg_username="owner_service", shop_id=None),
        ])
        await self.session.commit()

        self.staff: dict[str, Any] = shop_staff(SHOP_A)
        self.app = FastAPI()

        async def get_db() -> AsyncIterator[AsyncSession]:
            yield self.session

        async def require_staff() -> dict[str, Any]:
            return self.staff

        def require_perm(perm: str) -> Callable[..., Any]:
            async def dependency() -> dict[str, Any]:
                if not can_shop(authz_from_staff(self.staff), perm):
                    raise HTTPException(403)
                return self.staff

            return dependency

        register_panel_users_api(
            self.app, require_staff=require_staff, require_admin=require_staff, require_perm=require_perm,
            require_pg_perm=require_perm, get_db=get_db,
        )
        register_user_pages(self.app, require_admin=require_staff, require_perm=require_perm, get_db=get_db)
        register_trial_users_pages(self.app, require_staff=require_staff, get_db=get_db)
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://test")

    async def asyncTearDown(self) -> None:
        await self.client.aclose()
        await self.session.close()
        await self.engine.dispose()

    async def get_json(self, url: str, status: int = 200) -> dict[str, Any]:
        response = await self.client.get(url)
        self.assertEqual(response.status_code, status, response.text)
        return response.json()

    def assert_no_secrets(self, text: str) -> None:
        self.assertNotIn("SECRETTOKEN123", text)
        self.assertNotIn(SECRET_URL, text)
        self.assertNotIn("subscription", text)


class UsersListTests(PanelUsersApiTestCase):
    async def test_a_shop_lists_only_its_own_customers_with_its_own_purse(self) -> None:
        body = await self.get_json("/api/panel/users")
        self.assertEqual([row["id"] for row in body["rows"]], [11])
        row = body["rows"][0]
        self.assertEqual(row["wallet_balance"], 80, "the shop purse, not the platform balance")
        self.assertEqual(row["name"], HOSTILE_NAME, "text is returned raw; the page escapes it")
        self.assertEqual(row["tag"]["key"], "orange", "the shop's own tag")
        self.assertEqual([s["pg_username"] for s in row["services"]], ["shop_a_service"])
        self.assertNotIn("shop_b_service", json.dumps(body))
        self.assertNotIn("Bob of shop B", json.dumps(body))

    async def test_the_owner_sees_platform_customers_and_the_platform_purse(self) -> None:
        self.staff = OWNER.copy()
        body = await self.get_json("/api/panel/users")
        self.assertEqual([row["id"] for row in body["rows"]], [1])
        self.assertEqual(body["rows"][0]["wallet_balance"], 70)
        self.assertEqual(body["rows"][0]["tag"]["key"], "red")
        self.assertTrue(body["can"]["manage"])
        self.assertIn("block", body["rows"][0]["bulk_ops"])

    async def test_staff_without_the_dashboard_permission_get_nothing(self) -> None:
        self.staff = shop_staff(SHOP_A, permissions=["orders"])
        self.assertEqual((await self.client.get("/api/panel/users")).status_code, 403)

    async def test_staff_without_a_shop_get_nothing(self) -> None:
        self.staff = {"role": "reseller", "bot_user_id": None, "permissions": ["dashboard"]}
        self.assertEqual((await self.client.get("/api/panel/users")).status_code, 403)

    async def test_a_shop_cannot_ask_for_another_shops_customer_by_uid_or_search(self) -> None:
        body = await self.get_json("/api/panel/users?uid=21&q=Bob")
        self.assertEqual(body["rows"], [])
        self.assertIsNone(body["focus_uid"])

    async def test_filters_search_and_colour_narrow_the_list(self) -> None:
        self.assertEqual([r["id"] for r in (await self.get_json("/api/panel/users?q=alice"))["rows"]], [11])
        self.assertEqual((await self.get_json("/api/panel/users?q=nobody"))["rows"], [])
        self.assertEqual([r["id"] for r in (await self.get_json("/api/panel/users?color=orange"))["rows"]], [11])
        self.assertEqual((await self.get_json("/api/panel/users?color=red"))["rows"], [])
        body = await self.get_json("/api/panel/users?filter=expiring")
        self.assertEqual(body["filter"], "expiring")
        self.assertEqual(body["counts"]["total"], 1)
        self.assertEqual((await self.get_json("/api/panel/users?filter=%27drop"))["filter"], "all")

    async def test_the_list_is_bounded(self) -> None:
        self.session.add_all(
            BotUser(telegram_id=100_000 + i, referral_code=f"bulk{i}", reseller_id=SHOP_A) for i in range(LIST_LIMIT + 20)
        )
        await self.session.commit()
        body = await self.get_json("/api/panel/users")
        self.assertEqual(len(body["rows"]), LIST_LIMIT)

    async def test_no_subscription_secrets_are_returned(self) -> None:
        response = await self.client.get("/api/panel/users")
        self.assert_no_secrets(response.text)

    async def test_abilities_follow_the_staff_members_panel_rights(self) -> None:
        plain = (await self.get_json("/api/panel/users"))["can"]
        self.assertEqual(plain, {"manage": False, "provision": True, "edit_services": False, "pg_update": False})
        # The panel role alone is not enough: changing a customer's services needs customer_services.
        self.staff = shop_staff(SHOP_A, pg_user_actions={"update": True})
        self.assertFalse((await self.get_json("/api/panel/users"))["can"]["edit_services"])
        self.staff = shop_staff(SHOP_A, ["dashboard", "customer_services"], pg_user_actions={"update": True})
        body = await self.get_json("/api/panel/users")
        self.assertTrue(body["can"]["edit_services"])
        self.assertEqual(body["rows"][0]["bulk_ops"], ["renew"])
        self.assertTrue(body["rows"][0]["can_renew"])


class UserCardTests(PanelUsersApiTestCase):
    async def test_the_card_shows_one_shops_view_of_the_customer(self) -> None:
        body = await self.get_json("/api/panel/users/11/card")
        self.assertEqual(body["wallet_balance"], 80)
        self.assertEqual(body["user"]["name"], HOSTILE_NAME)
        self.assertEqual(body["risk_tag"]["key"], "orange")
        self.assertEqual([s["pg_username"] for s in body["services"]], ["shop_a_service"])
        self.assert_no_secrets(json.dumps(body))

    async def test_another_shop_cannot_open_the_card(self) -> None:
        self.staff = shop_staff(SHOP_B)
        response = await self.client.get("/api/panel/users/11/card")
        self.assertEqual(response.status_code, 403)
        self.assertNotIn("9011", response.text)
        self.assertNotIn("shop_a_service", response.text)

    async def test_an_unknown_customer_is_not_found(self) -> None:
        self.assertEqual((await self.client.get("/api/panel/users/999/card")).status_code, 404)

    async def test_the_permission_is_required(self) -> None:
        self.staff = shop_staff(SHOP_A, permissions=[])
        self.assertEqual((await self.client.get("/api/panel/users/11/card")).status_code, 403)

    async def test_owner_sees_platform_figures(self) -> None:
        self.staff = OWNER.copy()
        body = await self.get_json("/api/panel/users/1/card")
        self.assertEqual(body["wallet_balance"], 70)
        self.assertEqual([s["pg_username"] for s in body["services"]], ["owner_service"])
        self.assertTrue(body["can_message"])


class UserEditTests(PanelUsersApiTestCase):
    async def test_the_edit_screen_shows_only_the_shops_purse_ledger_and_services(self) -> None:
        self.staff = shop_staff(SHOP_A, permissions=["dashboard", "customer_services"])
        body = await self.get_json("/api/panel/users/11/edit")
        self.assertEqual(body["wallet"]["balance"], 80)
        self.assertEqual([tx["reason"] for tx in body["wallet"]["transactions"]], ["shop credit"])
        self.assertEqual([s["pg_username"] for s in body["services"]], ["shop_a_service"])
        self.assertTrue(body["services"][0]["has_link"])
        self.assertEqual([p["id"] for p in body["plans"]], [2], "the shop's own catalog only")
        self.assertFalse(body["can"]["manage"])
        self.assertFalse(body["can"]["delete_user"])

    async def test_services_are_listed_only_with_the_customer_services_permission(self) -> None:
        body = await self.get_json("/api/panel/users/11/edit")
        self.assertEqual(body["services"], [])
        self.assertFalse(body["can"]["view_services"])
        self.staff = shop_staff(SHOP_A, permissions=["dashboard", "customer_services"])
        body = await self.get_json("/api/panel/users/11/edit")
        self.assertTrue(body["can"]["view_services"])
        self.assertEqual([s["pg_username"] for s in body["services"]], ["shop_a_service"])

    async def test_subscription_links_and_tokens_never_leave_the_edit_endpoint(self) -> None:
        # With the permission, so the service rows are in the answer and checked too.
        self.staff = shop_staff(SHOP_A, permissions=["dashboard", "customer_services"])
        response = await self.client.get("/api/panel/users/11/edit")
        self.assert_no_secrets(response.text)

    async def test_another_shop_cannot_open_the_edit_data(self) -> None:
        self.staff = shop_staff(SHOP_B)
        response = await self.client.get("/api/panel/users/11/edit")
        self.assertEqual(response.status_code, 403)
        self.assertNotIn("shop_a_service", response.text)
        self.assertNotIn("SECRETTOKEN123", response.text)

    async def test_the_note_needs_the_notes_permission(self) -> None:
        self.assertEqual((await self.get_json("/api/panel/users/11/edit"))["note"], "")
        self.staff = shop_staff(SHOP_A, permissions=["dashboard", "customer_notes"])
        body = await self.get_json("/api/panel/users/11/edit")
        self.assertEqual(body["note"], "slow payer")
        self.assertTrue(body["can"]["private_marks"])

    async def test_shop_wallet_and_block_forms_are_offered_only_with_their_permissions(self) -> None:
        plain = await self.get_json("/api/panel/users/11/edit")
        self.assertIsNone(plain["shop_wallet"])
        self.assertIsNone(plain["shop_block"])
        self.staff = shop_staff(SHOP_A, permissions=["dashboard", "wallet_adjust", "customers_block"])
        body = await self.get_json("/api/panel/users/11/edit")
        self.assertEqual(body["shop_wallet"]["max"], 5_000_000)
        self.assertEqual(len(body["shop_wallet"]["nonce"]), 32)
        self.assertEqual(body["shop_block"], {"blocked": False, "reason": ""})

    async def test_the_owner_may_manage_and_delete_a_platform_customer(self) -> None:
        self.staff = OWNER.copy()
        body = await self.get_json("/api/panel/users/1/edit")
        self.assertTrue(body["can"]["manage"])
        self.assertTrue(body["can"]["delete_user"])
        self.assertEqual(body["wallet"]["balance"], 70)


class EditPageShellTests(PanelUsersApiTestCase):
    async def asyncSetUp(self) -> None:
        await super().asyncSetUp()
        self.spa = tempfile.TemporaryDirectory()
        for page in ("users", "users/edit", "trial-users"):
            folder = Path(self.spa.name) / page
            folder.mkdir(parents=True)
            (folder / "index.html").write_text(f"<html>{page}</html>", encoding="utf-8")
        patcher = patch.object(spa_pages, "SPA_DIR", Path(self.spa.name))
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(self.spa.cleanup)

    async def test_the_edit_shell_is_served_only_for_a_customer_in_scope(self) -> None:
        response = await self.client.get("/users/11/edit")
        self.assertEqual(response.status_code, 200)
        self.assertIn("users/edit", response.text)
        self.staff = shop_staff(SHOP_B)
        foreign = await self.client.get("/users/11/edit")
        self.assertEqual(foreign.status_code, 303)
        self.assertTrue(foreign.headers["location"].startswith("/users?err="))
        missing = await self.client.get("/users/999/edit")
        self.assertEqual(missing.status_code, 303)

    async def test_the_trial_shell_needs_the_trial_permission(self) -> None:
        self.assertEqual((await self.client.get("/trial-users")).status_code, 403)
        self.staff = shop_staff(SHOP_A, permissions=["trial_users"])
        response = await self.client.get("/trial-users")
        self.assertEqual(response.status_code, 200)
        self.assertIn("trial-users", response.text)


class TrialUsersApiTests(PanelUsersApiTestCase):
    async def asyncSetUp(self) -> None:
        await super().asyncSetUp()
        self.session.add(Plan(id=9, name="trial", price=0, is_trial=True))
        await self.session.flush()
        self.session.add_all([
            Order(user_id=11, reseller_id=SHOP_A, plan_id=9, amount=0, status="delivered"),
            Order(user_id=21, reseller_id=SHOP_B, plan_id=9, amount=0, status="delivered"),
            Order(user_id=11, reseller_id=SHOP_A, plan_id=1, amount=500, status="delivered"),
        ])
        await self.session.commit()
        self.staff = shop_staff(SHOP_A, permissions=["trial_users"])

    async def test_a_shop_sees_only_its_own_trial_takers(self) -> None:
        body = await self.get_json("/api/panel/trial-users?shop_id=20&reseller_id=20")
        self.assertEqual([r["user_id"] for r in body["rows"]], [11])
        self.assertEqual(body["rows"][0]["total_spent"], 500)
        self.assertTrue(body["rows"][0]["is_buyer"])
        self.assertEqual(body["summary"], {"trials": 1, "buyers": 1, "non_buyers": 0, "conversion_percent": 100})
        self.assertNotIn("Bob of shop B", json.dumps(body))
        self.assertNotIn("9021", json.dumps(body))

    async def test_missing_permission_or_shop_is_refused(self) -> None:
        for staff in (
            shop_staff(SHOP_A, permissions=["orders"]),
            shop_staff(SHOP_A, permissions=["trial_users_manage"]),
            {"role": "pg_staff", "permissions": ["trial_users"]},
            {"role": "reseller", "permissions": ["trial_users"], "bot_user_id": None},
        ):
            with self.subTest(staff=staff):
                self.staff = staff
                self.assertEqual((await self.client.get("/api/panel/trial-users")).status_code, 403)

    async def test_row_actions_follow_the_manage_permission(self) -> None:
        self.assertEqual((await self.get_json("/api/panel/trial-users"))["rows"][0]["ops"], [])
        self.staff = shop_staff(SHOP_A, permissions=["trial_users", "trial_users_manage"])
        body = await self.get_json("/api/panel/trial-users")
        self.assertEqual(body["rows"][0]["ops"], ["message"])
        self.assertFalse(body["can_block"], "block is the Owner's")

    async def test_filters_search_and_a_malformed_cursor_are_tolerated(self) -> None:
        body = await self.get_json("/api/panel/trial-users?filter=non_buyers")
        self.assertEqual(body["rows"], [])
        body = await self.get_json("/api/panel/trial-users?before=abc&filter=%27%3B--&q=" + "x" * 500)
        self.assertEqual(body["rows"], [])

    async def test_the_owner_gets_the_settings_shortcut_and_marketing_tabs(self) -> None:
        self.staff = OWNER.copy()
        body = await self.get_json("/api/panel/trial-users")
        self.assertEqual(body["settings_href"], "/settings?tab=limits")
        self.assertIn("trial_users", [tab["key"] for tab in body["marketing_tabs"]])
        self.assertEqual(body["rows"], [])


if __name__ == "__main__":
    unittest.main()
