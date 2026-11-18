"""The users-list user card (JSON of the React panel) shows one shop's view of a customer and nothing from another shop."""

from __future__ import annotations

import unittest
from collections.abc import AsyncIterator
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.api.panel_users_api import register_panel_users_api
from app.api.user_pages import register_user_pages
from app.db.models import Base, BotUser, BotUserShop, Order, Plan, ShopPoints, ShopWallet, UserService
from app.services.authz import authz_from_staff, can_shop
from app.services.user_card import build_user_card
from app.services.users_ops import expire_tone
from tests.pgtest import pg_engine

OWNER = {"role": "admin", "org_principal_id": 1, "org_depth": 0, "org_status": "active"}
SHOP_A, SHOP_B = 10, 20
HOSTILE_NAME = '<script>alert("x")</script>'


def shop_staff(shop_id: int) -> dict[str, Any]:
    return {"role": "reseller", "bot_user_id": shop_id, "permissions": ["dashboard"]}


class UserCardTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.engine = pg_engine()
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        self.session = async_sessionmaker(self.engine, expire_on_commit=False)()
        now = datetime.now(timezone.utc)
        self.session.add_all([
            BotUser(id=SHOP_A, telegram_id=5010, referral_code="shopa", role="reseller"),
            BotUser(id=SHOP_B, telegram_id=5020, referral_code="shopb", role="reseller"),
            Plan(id=1, name="Monthly", price=100, duration_days=30, data_limit_gb=50),
        ])
        await self.session.flush()
        self.session.add_all([
            # A customer of shop A who also bought from the platform.
            BotUser(id=11, telegram_id=9011, referral_code="c11", full_name=HOSTILE_NAME,
                    reseller_id=SHOP_A, wallet_balance=50, created_at=now),
            BotUser(id=1, telegram_id=9001, referral_code="c1", full_name="Platform customer",
                    wallet_balance=70, color_tag="red", created_at=now),
        ])
        await self.session.flush()
        self.session.add_all([
            ShopWallet(user_id=11, reseller_id=SHOP_A, balance=80),
            ShopPoints(user_id=11, reseller_id=SHOP_A, balance=340),
            # Shop A's own risk tag lives on its membership row.
            BotUserShop(bot_user_id=11, shop_id=SHOP_A, color_tag="red"),
            UserService(id=1, bot_user_id=11, plan_id=1, pg_username="shop_a_service", shop_id=SHOP_A,
                        quota_synced_at=now, quota_expire_at=now + timedelta(days=2),
                        quota_data_limit_bytes=50 * 1024**3),
            UserService(id=2, bot_user_id=11, plan_id=1, pg_username="platform_service", shop_id=None),
            UserService(id=3, bot_user_id=1, plan_id=1, pg_username="owner_service", shop_id=None),
            Order(user_id=11, reseller_id=SHOP_A, plan_id=1, amount=100, status="delivered"),
            Order(user_id=11, reseller_id=SHOP_A, plan_id=1, amount=40, status="awaiting_approval"),
            Order(user_id=11, reseller_id=None, plan_id=1, amount=900, status="delivered"),
        ])
        await self.session.commit()

        self.staff: dict[str, Any] = shop_staff(SHOP_A)
        self.app = FastAPI()

        async def get_db() -> AsyncIterator[AsyncSession]:
            yield self.session

        async def require_staff() -> dict[str, Any]:
            return self.staff

        def require_perm(perm: str):
            async def dependency() -> dict[str, Any]:
                if not can_shop(authz_from_staff(self.staff), perm):
                    raise HTTPException(403)
                return self.staff

            return dependency

        register_panel_users_api(
            self.app, require_staff=require_staff, require_admin=require_staff, require_perm=require_perm,
            require_pg_perm=require_perm, get_db=get_db,
        )
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://test")

    async def asyncTearDown(self) -> None:
        await self.client.aclose()
        await self.session.close()
        await self.engine.dispose()

    async def test_shop_sees_only_its_own_purse_orders_and_services(self) -> None:
        response = await self.client.get("/api/panel/users/11/card")
        self.assertEqual(response.status_code, 200)
        card = response.json()
        self.assertEqual([s["pg_username"] for s in card["services"]], ["shop_a_service"])
        self.assertNotIn("platform_service", response.text)
        self.assertEqual(card["wallet_balance"], 80, "the shop purse, not the platform balance")
        self.assertEqual(card["paid_total"], 100, "only this shop's paid orders count")
        self.assertEqual(card["paid_count"], 1, "an order still awaiting approval is not paid")
        self.assertNotIn("900", response.text)

    async def test_another_shop_cannot_open_the_card(self) -> None:
        self.staff = shop_staff(SHOP_B)
        response = await self.client.get("/api/panel/users/11/card")
        self.assertEqual(response.status_code, 403)
        self.assertNotIn("shop_a_service", response.text)
        self.assertNotIn("9011", response.text)

    async def test_an_unknown_user_is_not_found(self) -> None:
        response = await self.client.get("/api/panel/users/999/card")
        self.assertEqual(response.status_code, 404)

    async def test_customer_text_travels_only_as_json_data(self) -> None:
        response = await self.client.get("/api/panel/users/11/card")
        self.assertTrue(response.headers["content-type"].startswith("application/json"))
        self.assertEqual(response.json()["user"]["name"], HOSTILE_NAME, "returned verbatim; React escapes it on render")

    async def test_a_latin_name_is_returned_plain_for_the_page_to_isolate(self) -> None:
        self.staff = OWNER.copy()
        response = await self.client.get("/api/panel/users/1/card")
        self.assertEqual(response.json()["user"]["name"], "Platform customer")
        self.assertNotIn("<", response.text)

    async def test_owner_sees_the_platform_purse_and_services(self) -> None:
        self.staff = OWNER.copy()
        response = await self.client.get("/api/panel/users/1/card")
        self.assertEqual(response.status_code, 200)
        card = response.json()
        self.assertEqual([s["pg_username"] for s in card["services"]], ["owner_service"])
        self.assertEqual(card["wallet_balance"], 70)

    async def test_the_risk_tag_needs_the_right_to_read_private_marks(self) -> None:
        user = await self.session.get(BotUser, 11)
        shown = await build_user_card(self.session, user, shop_id=SHOP_A, show_private_marks=True)
        hidden = await build_user_card(self.session, user, shop_id=SHOP_A, show_private_marks=False)
        self.assertEqual(shown.risk_tag.key, "red")
        self.assertIsNone(hidden.risk_tag)

    async def test_a_soon_expiring_service_is_flagged(self) -> None:
        user = await self.session.get(BotUser, 11)
        card = await build_user_card(self.session, user, shop_id=SHOP_A, show_private_marks=True)
        self.assertEqual([s.pg_username for s in card.services], ["shop_a_service"])
        self.assertEqual(card.services[0].plan_name, "Monthly")
        self.assertEqual(card.services[0].expire_tone, "warn")


    async def get_card(self, user_id: int, opened_from: str | None = None) -> httpx.Response:
        suffix = f"?from={opened_from}" if opened_from is not None else ""
        return await self.client.get(f"/api/panel/users/{user_id}/card{suffix}")

    async def test_the_card_names_the_person_for_the_identity_header(self) -> None:
        user = await self.session.get(BotUser, 11)
        user.username = "shop_customer"
        await self.session.commit()
        person = (await self.get_card(11)).json()["user"]
        self.assertEqual((person["username"], person["telegram_id"], person["id"]), ("shop_customer", 9011, 11))
        self.assertFalse(person["is_blocked"])
        self.assertEqual(person["role"], "user")

    async def test_wallet_points_purchases_and_membership_come_with_the_card(self) -> None:
        card = (await self.get_card(11)).json()
        self.assertEqual((card["wallet_balance"], card["points_balance"]), (80, 340), "this shop's purse and points")
        self.assertEqual((card["paid_total"], card["paid_count"]), (100, 1))
        self.assertNotEqual(card["joined"], "—")

    async def test_owner_opening_a_reseller_from_the_resellers_list_edits_the_reseller(self) -> None:
        self.staff = OWNER.copy()
        response = await self.get_card(SHOP_A, "resellers")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["edit_target"], "reseller")

    async def test_the_same_reseller_from_the_users_list_edits_the_customer(self) -> None:
        self.staff = OWNER.copy()
        self.assertEqual((await self.get_card(SHOP_A)).json()["edit_target"], "user")
        self.assertEqual((await self.get_card(SHOP_A, "users")).json()["edit_target"], "user")

    async def test_a_shop_cannot_reach_the_reseller_edit_through_the_resellers_hint(self) -> None:
        card = (await self.get_card(11, "resellers")).json()
        self.assertIsNone(card["edit_target"], "the resellers page has no customer edit, and a shop never edits resellers")

    async def test_a_customer_who_is_not_a_reseller_gets_no_reseller_edit_even_for_the_owner(self) -> None:
        self.staff = OWNER.copy()
        self.assertIsNone((await self.get_card(1, "resellers")).json()["edit_target"])

    async def test_shop_staff_without_panel_service_rights_still_get_edit(self) -> None:
        self.assertEqual(self.staff["permissions"], ["dashboard"])
        self.assertEqual((await self.get_card(11)).json()["edit_target"], "user")

    async def test_a_card_opened_from_another_table_links_to_the_users_edit(self) -> None:
        for page in ("finance", "tickets", "trials", "cleanup", "applications", "loyalty"):
            card = (await self.get_card(11, page)).json()
            self.assertEqual(card["edit_target"], "user_link", page)
            self.assertEqual(card["opened_from"], page)

    async def test_an_unknown_card_page_behaves_like_the_users_list(self) -> None:
        response = await self.get_card(11, "https://evil.example")
        card = response.json()
        self.assertEqual((card["edit_target"], card["opened_from"]), ("user", "users"))
        self.assertNotIn("evil.example", response.text)

    async def test_a_blocked_customer_gets_no_message_button(self) -> None:
        user = await self.session.get(BotUser, 11)
        user.is_blocked = True
        await self.session.commit()
        card = (await self.get_card(11)).json()
        self.assertFalse(card["can_message"])
        self.assertTrue(card["user"]["is_blocked"])

    async def test_a_customer_who_can_be_written_to_gets_the_message_button(self) -> None:
        self.assertTrue((await self.get_card(11)).json()["can_message"])

    async def test_staff_without_the_users_right_cannot_open_the_card(self) -> None:
        self.staff = {"role": "reseller", "bot_user_id": SHOP_A, "permissions": ["finance"]}
        for page in (None, "finance", "resellers"):
            response = await self.get_card(11, page)
            self.assertEqual(response.status_code, 403, page)
            self.assertNotIn("9011", response.text)

    async def test_the_identity_header_of_the_reseller_edit_is_scoped_like_the_card(self) -> None:
        self.assertEqual((await self.client.get("/api/panel/users/11/identity")).json()["telegram_id"], 9011)
        self.staff = shop_staff(SHOP_B)
        foreign = await self.client.get("/api/panel/users/11/identity")
        self.assertEqual(foreign.status_code, 403)
        self.assertNotIn("9011", foreign.text)
        self.assertEqual((await self.client.get("/api/panel/users/999/identity")).status_code, 404)


class CardMessageReturnTests(unittest.IsolatedAsyncioTestCase):
    """A message sent from the card returns to the page it came from; anything unknown falls back to /users."""

    async def asyncSetUp(self) -> None:
        self.engine = pg_engine()
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        self.session = async_sessionmaker(self.engine, expire_on_commit=False)()
        self.session.add_all([
            BotUser(id=SHOP_A, telegram_id=5010, referral_code="shopa", role="reseller"),
            BotUser(id=SHOP_B, telegram_id=5020, referral_code="shopb", role="reseller"),
        ])
        await self.session.flush()
        self.session.add(BotUser(id=11, telegram_id=9011, referral_code="c11", reseller_id=SHOP_A))
        await self.session.commit()
        self.staff: dict[str, Any] = shop_staff(SHOP_A)
        app = FastAPI()

        async def get_db() -> AsyncIterator[AsyncSession]:
            yield self.session

        async def require_staff() -> dict[str, Any]:
            return self.staff

        def require_perm(perm: str):
            async def dependency() -> dict[str, Any]:
                if not can_shop(authz_from_staff(self.staff), perm):
                    raise HTTPException(403)
                return self.staff

            return dependency

        register_user_pages(app, require_admin=require_staff, get_db=get_db, require_perm=require_perm)
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")

    async def asyncTearDown(self) -> None:
        await self.client.aclose()
        await self.session.close()
        await self.engine.dispose()

    async def send(self, user_id: int, **fields: str) -> httpx.Response:
        # An empty text is refused before anything is sent, so the redirect carries the error.
        return await self.client.post(f"/users/{user_id}/message", data={"body": "", **fields})

    async def test_a_message_sent_from_the_resellers_list_returns_there(self) -> None:
        self.staff = OWNER.copy()
        response = await self.send(SHOP_A, return_page="resellers")
        self.assertEqual(response.status_code, 303)
        self.assertTrue(response.headers["location"].startswith("/resellers?err="))

    async def test_a_message_sent_from_another_table_returns_to_that_page(self) -> None:
        for page, path in (("finance", "/finance"), ("tickets", "/tickets"), ("trials", "/trial-users"),
                           ("cleanup", "/service-cleanup"), ("loyalty", "/loyalty")):
            response = await self.send(11, return_page=page)
            self.assertEqual(response.status_code, 303)
            self.assertTrue(response.headers["location"].startswith(f"{path}?err="), page)

    async def test_an_unknown_return_page_falls_back_to_the_users_list(self) -> None:
        self.staff = OWNER.copy()
        for page in ("https://evil.example", "//evil.example", "/finance", ""):
            response = await self.send(SHOP_A, return_page=page)
            location = response.headers["location"]
            self.assertTrue(location.startswith("/users"), page)
            self.assertNotIn("evil", location)

    async def test_a_message_to_another_shops_customer_is_refused(self) -> None:
        self.staff = shop_staff(SHOP_B)
        response = await self.send(11, return_page="finance")
        self.assertIn("err=", response.headers["location"])
        self.assertNotIn("9011", response.headers["location"])

    async def test_staff_without_the_users_right_cannot_message_from_the_card(self) -> None:
        self.staff = {"role": "reseller", "bot_user_id": SHOP_A, "permissions": ["finance"]}
        self.assertEqual((await self.send(11, return_page="finance")).status_code, 403)


class ExpireToneTests(unittest.TestCase):
    def test_expired_is_danger_inside_the_window_warn_otherwise_plain(self) -> None:
        self.assertEqual(expire_tone(0, expiring=False), "danger")
        self.assertEqual(expire_tone(-3, expiring=False), "danger")
        self.assertEqual(expire_tone(2, expiring=True), "warn")
        self.assertEqual(expire_tone(30, expiring=False), "")
        self.assertEqual(expire_tone(None, expiring=False), "", "unlimited time")


if __name__ == "__main__":
    unittest.main()
