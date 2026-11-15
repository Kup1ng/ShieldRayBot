"""An admin removed from ADMIN_IDS loses admin powers in the Mini App too, not only in the bot."""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import patch

import httpx
from fastapi import Depends, FastAPI, Request
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.models import Base, BotUser, ResellerProfile
from app.services.miniapp_auth import load_mini_user, resolve_mini_persona
from app.services.users import clear_settings_cache
from tests.test_miniapp_init_data_window import TOKEN, signed

FORMER_ADMIN = 7001
FORMER_ADMIN_RESELLER = 7002
CURRENT_ADMIN = 7003


class RemovedAdminMiniAppTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        clear_settings_cache()
        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        self.Session = async_sessionmaker(self.engine, expire_on_commit=False)
        async with self.Session() as session:
            session.add_all([
                BotUser(id=1, telegram_id=FORMER_ADMIN, referral_code="a1", role="admin"),
                BotUser(id=2, telegram_id=FORMER_ADMIN_RESELLER, referral_code="a2", role="admin"),
                BotUser(id=3, telegram_id=CURRENT_ADMIN, referral_code="a3", role="admin"),
            ])
            await session.flush()
            session.add(ResellerProfile(id=1, user_id=2, is_active=True))
            await session.commit()
        settings = SimpleNamespace(
            miniapp_enabled=True, bot_token=TOKEN, currency="تومان", admin_ids={CURRENT_ADMIN},
        )
        self.patches = [
            patch("app.services.miniapp_auth.get_settings", return_value=settings),
            patch("app.services.users.get_settings", return_value=settings),
            patch("app.services.platform_identity.get_settings", return_value=settings, create=True),
        ]
        for p in self.patches:
            p.start()

        async def get_db():
            async with self.Session() as session:
                yield session

        app = FastAPI()

        @app.get("/api/mini/probe")
        async def probe(request: Request, session: AsyncSession = Depends(get_db)):
            user = await load_mini_user(session, request)
            return {"persona": resolve_mini_persona(user)}

        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")

    async def asyncTearDown(self) -> None:
        await self.client.aclose()
        for p in reversed(self.patches):
            p.stop()
        clear_settings_cache()
        await self.engine.dispose()

    async def persona(self, telegram_id: int) -> str:
        response = await self.client.get(
            "/api/mini/probe", headers={"X-Telegram-Init-Data": signed(TOKEN, telegram_id)}
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["persona"]

    async def stored_role(self, user_id: int) -> str:
        async with self.Session() as session:
            return (await session.get(BotUser, user_id)).role

    async def test_removed_admin_is_a_customer_in_the_mini_app(self) -> None:
        self.assertEqual(await self.persona(FORMER_ADMIN), "user")
        self.assertEqual(await self.stored_role(1), "user")

    async def test_removed_admin_who_runs_a_shop_keeps_the_shop(self) -> None:
        self.assertEqual(await self.persona(FORMER_ADMIN_RESELLER), "reseller")
        self.assertEqual(await self.stored_role(2), "reseller")

    async def test_listed_admin_stays_admin(self) -> None:
        self.assertEqual(await self.persona(CURRENT_ADMIN), "admin")
        self.assertEqual(await self.stored_role(3), "admin")


if __name__ == "__main__":
    unittest.main()
