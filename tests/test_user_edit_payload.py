"""The JSON of the customer edit screen: the one identity header, and what only the platform Owner is offered."""

from __future__ import annotations

import unittest
from collections.abc import AsyncIterator
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.api.panel_users_api import register_panel_users_api
from app.db.models import Base, BotUser, ResellerPlan
from app.services.authz import authz_from_staff, can_shop
from tests.pgtest import pg_engine

OWNER = {"role": "admin", "org_principal_id": 1, "org_depth": 0, "org_status": "active"}
SHOP_A, SHOP_B = 10, 20
HOSTILE_NAME = '<img src=x onerror="alert(1)">'


def shop_staff(shop_id: int) -> dict[str, Any]:
    return {"role": "reseller", "bot_user_id": shop_id, "permissions": ["dashboard"]}


class UserEditPayloadTests(unittest.IsolatedAsyncioTestCase):
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
        self.session.add_all([
            BotUser(id=11, telegram_id=9011, username="shop_customer", full_name=HOSTILE_NAME, referral_code="c11",
                    reseller_id=SHOP_A),
            BotUser(id=1, telegram_id=9001, referral_code="c1", full_name="Platform customer", is_blocked=True),
            ResellerPlan(id=1, name="پایه", billing_mode="fixed", is_active=True),
            ResellerPlan(id=2, name="حجمی", billing_mode="payg", is_active=True),
            ResellerPlan(id=3, name="قدیمی", billing_mode="fixed", is_active=False),
        ])
        await self.session.commit()

        self.staff: dict[str, Any] = OWNER.copy()
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

        register_panel_users_api(
            app, require_staff=require_staff, require_admin=require_staff, require_perm=require_perm,
            require_pg_perm=require_perm, get_db=get_db,
        )
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")

    async def asyncTearDown(self) -> None:
        await self.client.aclose()
        await self.session.close()
        await self.engine.dispose()

    async def edit(self, user_id: int) -> httpx.Response:
        return await self.client.get(f"/api/panel/users/{user_id}/edit")

    async def test_the_owner_is_offered_the_active_reseller_packages_with_their_billing_kind(self) -> None:
        payload = (await self.edit(1)).json()
        self.assertEqual(payload["reseller_plans"], [{"id": 1, "label": "[ثابت] پایه"}, {"id": 2, "label": "[PAYG] حجمی"}])

    async def test_shop_staff_are_never_offered_reseller_packages(self) -> None:
        self.staff = shop_staff(SHOP_A)
        response = await self.edit(11)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["reseller_plans"], [])
        for name in ("پایه", "حجمی"):
            self.assertNotIn(name, response.text)

    async def test_the_edit_screen_carries_the_identity_header_fields(self) -> None:
        self.staff = shop_staff(SHOP_A)
        person = (await self.edit(11)).json()["user"]
        self.assertEqual((person["username"], person["telegram_id"], person["id"]), ("shop_customer", 9011, 11))
        self.assertEqual(person["name"], HOSTILE_NAME, "returned verbatim; React escapes it on render")
        self.staff = OWNER.copy()
        self.assertTrue((await self.edit(1)).json()["user"]["is_blocked"])

    async def test_another_shop_cannot_read_the_edit_screen_of_a_customer(self) -> None:
        self.staff = shop_staff(SHOP_B)
        response = await self.edit(11)
        self.assertEqual(response.status_code, 403)
        self.assertNotIn("9011", response.text)
        self.assertNotIn("shop_customer", response.text)

    async def test_staff_without_the_users_right_cannot_read_the_edit_screen(self) -> None:
        self.staff = {"role": "reseller", "bot_user_id": SHOP_A, "permissions": ["finance"]}
        self.assertEqual((await self.edit(11)).status_code, 403)


if __name__ == "__main__":
    unittest.main()
