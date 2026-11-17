"""Authorization, validation and the panel data for random discount management."""
from __future__ import annotations

import secrets
import unittest
from collections.abc import AsyncIterator
from urllib.parse import parse_qs, urlsplit

import httpx
from fastapi import FastAPI
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.api.random_discounts import API_PATH, register_random_discounts
from app.db.models import Base, BotUser, RandomDiscount
from app.services.marketing_nav import RANDOM_DISCOUNTS, marketing_sections
from app.services.resellers import DEFAULT_FEATURE_PERMS, feature_perm_groups
from tests.pgtest import pg_engine

OWNER = {"role": "admin", "org_principal_id": 1, "org_depth": 0, "org_status": "active"}
SHOP = {"role": "reseller", "bot_user_id": 2, "permissions": ["random_discounts"]}


class RandomDiscountAdminTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.engine = pg_engine()
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        self.Session = async_sessionmaker(self.engine, expire_on_commit=False)
        async with self.Session() as session:
            session.add_all([
                BotUser(id=2, telegram_id=202, referral_code="shop2", role="reseller"),
                BotUser(id=3, telegram_id=203, referral_code="shop3", role="reseller"),
            ])
            await session.commit()
        self.staff = OWNER

        async def staff() -> dict:
            return self.staff

        async def get_db() -> AsyncIterator[AsyncSession]:
            async with self.Session() as session:
                yield session

        self.app = FastAPI()
        register_random_discounts(self.app, require_staff=staff, get_db=get_db)
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="https://example.test")

    async def asyncTearDown(self) -> None:
        await self.client.aclose()
        await self.engine.dispose()

    def form(self, **changes: str) -> dict[str, str]:
        return {
            "title": "تخفیف ویژهٔ آزمون", "mode": "automatic", "reduction_kind": "amount", "minimum": "10",
            "maximum": "100", "step": "1", "window_minutes": "60", "request_key": secrets.token_hex(16),
            **changes,
        }

    async def test_missing_permission_and_unscoped_staff_cannot_open_or_mutate(self) -> None:
        for profile in [{}, {"role": "admin"}, {"role": "reseller", "bot_user_id": 2, "permissions": ["catalog_discounts"]},
                        {"role": "reseller", "permissions": ["random_discounts"]},
                        {"role": "pg_staff", "permissions": ["random_discounts"]}]:
            self.staff = profile
            with self.subTest(profile=profile):
                self.assertEqual((await self.client.get("/random-discounts")).status_code, 403)
                self.assertEqual((await self.client.get(API_PATH)).status_code, 403)
                self.assertEqual((await self.client.post("/random-discounts", data=self.form())).status_code, 403)
                self.assertEqual((await self.client.post("/random-discounts/1/stop")).status_code, 403)

    async def test_page_data_has_a_fresh_request_key_and_the_marketing_strip(self) -> None:
        self.staff = SHOP
        page = await self.client.get("/random-discounts")
        self.assertEqual(page.status_code, 200)
        self.assertEqual(page.headers["cache-control"], "no-store")
        first = (await self.client.get(API_PATH)).json()
        second = (await self.client.get(API_PATH)).json()
        self.assertEqual(first["discounts"], [])
        self.assertIsNone(first["next_before"])
        self.assertEqual(len(first["request_key"]), 32)
        self.assertNotEqual(first["request_key"], second["request_key"])
        self.assertEqual([row["key"] for row in first["sections"]], [RANDOM_DISCOUNTS])

    async def test_titles_are_returned_as_text_and_errors_come_back_in_the_redirect(self) -> None:
        title = '<img src=x onerror="alert(1)">'
        response = await self.client.post("/random-discounts", data=self.form(title=title))
        self.assertEqual(response.status_code, 303)
        rows = (await self.client.get(API_PATH)).json()["discounts"]
        self.assertEqual([row["title"] for row in rows], [title])
        self.assertTrue(rows[0]["is_active"])
        self.assertEqual(rows[0]["code"], "")
        response = await self.client.post("/random-discounts", data=self.form(minimum="NaN"))
        self.assertIn("error", parse_qs(urlsplit(response.headers["location"]).query))

    async def test_invalid_form_values_are_safe_errors_and_create_no_policy(self) -> None:
        for changes in [{"minimum": "NaN"}, {"maximum": "0"}, {"step": "-1"}, {"window_minutes": "10081"},
                        {"minimum": "20", "maximum": "10"}, {"mode": "code", "code": "<script>"},
                        {"reduction_kind": "percent", "maximum": "101"}]:
            with self.subTest(changes=changes):
                response = await self.client.post("/random-discounts", data=self.form(**changes))
                self.assertEqual(response.status_code, 303)
                self.assertIn("error", parse_qs(urlsplit(response.headers["location"]).query))
        async with self.Session() as session:
            self.assertEqual(await session.scalar(select(func.count()).select_from(RandomDiscount)), 0)
        self.assertEqual((await self.client.get(f"{API_PATH}?before=NaN")).status_code, 400)

    async def test_duplicate_submission_creates_one_policy_and_other_shop_cannot_stop_it(self) -> None:
        self.staff = SHOP
        form = self.form()
        self.assertEqual((await self.client.post("/random-discounts", data=form)).status_code, 303)
        self.assertEqual((await self.client.post("/random-discounts", data=form)).status_code, 303)
        async with self.Session() as session:
            rows = list((await session.scalars(select(RandomDiscount))).all())
            self.assertEqual(len(rows), 1)
            policy_id = rows[0].id
        self.staff = {**SHOP, "bot_user_id": 3}
        self.assertEqual((await self.client.get(API_PATH)).json()["discounts"], [])
        response = await self.client.post(f"/random-discounts/{policy_id}/stop")
        self.assertIn("error", parse_qs(urlsplit(response.headers["location"]).query))
        async with self.Session() as session:
            self.assertTrue((await session.get(RandomDiscount, policy_id)).is_active)
        self.staff = SHOP
        self.assertEqual((await self.client.post(f"/random-discounts/{policy_id}/stop")).status_code, 303)
        async with self.Session() as session:
            self.assertFalse((await session.get(RandomDiscount, policy_id)).is_active)

    def test_navigation_and_permission_defaults_require_explicit_grant(self) -> None:
        self.assertNotIn("random_discounts", DEFAULT_FEATURE_PERMS.split(","))
        permissions = [p for group in feature_perm_groups() for p in group.perms if p.key == "random_discounts"]
        self.assertEqual(len(permissions), 1)
        self.assertFalse(permissions[0].default)
        self.assertEqual([row.key for row in marketing_sections(SHOP)], [RANDOM_DISCOUNTS])
        self.assertNotIn(RANDOM_DISCOUNTS, [row.key for row in marketing_sections({**SHOP, "permissions": ["catalog_discounts"]})])
        self.assertEqual(marketing_sections({**SHOP, "bot_user_id": None}), ())
