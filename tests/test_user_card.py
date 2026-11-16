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
from app.db.models import Base, BotUser, BotUserShop, Order, Plan, ShopWallet, UserService
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


class ExpireToneTests(unittest.TestCase):
    def test_expired_is_danger_inside_the_window_warn_otherwise_plain(self) -> None:
        self.assertEqual(expire_tone(0, expiring=False), "danger")
        self.assertEqual(expire_tone(-3, expiring=False), "danger")
        self.assertEqual(expire_tone(2, expiring=True), "warn")
        self.assertEqual(expire_tone(30, expiring=False), "")
        self.assertEqual(expire_tone(None, expiring=False), "", "unlimited time")


if __name__ == "__main__":
    unittest.main()
