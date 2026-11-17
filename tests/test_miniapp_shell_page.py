"""The Mini App page tells a browser visit which bot to open it from, and nothing else about the bot."""

from __future__ import annotations

import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import httpx
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.api import spa_pages
from app.api.miniapp_pages import register_miniapp_pages
from app.db.models import Base, BotUser, ResellerProfile
from app.services.miniapp_shop import PLATFORM_SWITCH, SHOP_SWITCH, new_shop_key
from app.services.secret_box import seal_bot_token
from app.services.users import clear_settings_cache, set_setting
from tests.pgtest import pg_engine

PAGE = '<!DOCTYPE html><html><head><meta charSet="utf-8"/><title>x</title></head><body></body></html>'
PERMS = '["orders","payments","miniapp"]'


class MiniAppShellPageTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        clear_settings_cache()
        self.keys = {"shop": new_shop_key(), "bad": new_shop_key(), "none": new_shop_key()}
        self.engine = pg_engine()
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        self.Session = async_sessionmaker(self.engine, expire_on_commit=False)
        now = datetime.now(timezone.utc)
        async with self.Session() as session:
            owners = {5: "shop", 6: "bad", 7: "none"}
            usernames = {"shop": "Shop5Bot", "bad": '"><script>alert(1)</script>', "none": None}
            session.add_all([BotUser(id=uid, telegram_id=uid * 1000, referral_code=f"o{uid}", role="reseller") for uid in owners])
            session.add_all([
                ResellerProfile(
                    id=uid, user_id=uid, is_active=True, setup_completed_at=now, bot_token=seal_bot_token(f"{uid}:x"),
                    miniapp_key=self.keys[name], web_permissions=PERMS, bot_username=usernames[name],
                )
                for uid, name in owners.items()
            ])
            await session.commit()
            await set_setting(session, PLATFORM_SWITCH, "1")
            for uid in owners:
                await set_setting(session, SHOP_SWITCH, "1", reseller_id=uid)
        clear_settings_cache()
        self.spa = tempfile.TemporaryDirectory()
        page = Path(self.spa.name) / "miniapp"
        page.mkdir()
        (page / "index.html").write_text(PAGE, encoding="utf-8")
        settings = SimpleNamespace(
            miniapp_enabled=True, miniapp_url="https://panel.example.com/miniapp/", bot_token="1:x", bot_username="PlatformBot"
        )
        self.patches = [
            patch.object(spa_pages, "SPA_DIR", Path(self.spa.name)),
            patch("app.services.miniapp_shop.get_settings", return_value=settings),
            patch("app.services.miniapp_auth.get_settings", return_value=settings),
            patch("app.services.miniapp_main_app.get_settings", return_value=settings),
        ]
        for p in self.patches:
            p.start()

        async def get_db():
            async with self.Session() as session:
                yield session

        app = FastAPI()
        register_miniapp_pages(app, render=lambda *_: None, get_db=get_db)
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")

    async def asyncTearDown(self) -> None:
        await self.client.aclose()
        for p in reversed(self.patches):
            p.stop()
        spa_pages._cache.clear()
        self.spa.cleanup()
        clear_settings_cache()
        await self.engine.dispose()

    async def page(self, path: str) -> httpx.Response:
        response = await self.client.get(path)
        self.assertEqual(response.status_code, 200, response.text)
        return response

    async def test_the_platform_page_names_the_platform_bot(self) -> None:
        response = await self.page("/miniapp/")
        self.assertIn('<head><meta name="pg-mini-bot" content="PlatformBot"/><meta charSet="utf-8"/>', response.text)
        self.assertEqual(response.headers["cache-control"], "no-store")

    async def test_a_shop_page_names_its_own_bot(self) -> None:
        response = await self.page(f"/miniapp/s/{self.keys['shop']}/")
        self.assertIn('name="pg-mini-bot" content="Shop5Bot"', response.text)
        self.assertNotIn("PlatformBot", response.text)

    async def test_an_unusable_or_missing_username_is_left_empty_and_never_written_as_markup(self) -> None:
        for name in ("bad", "none"):
            with self.subTest(shop=name):
                response = await self.page(f"/miniapp/s/{self.keys[name]}")
                self.assertIn('name="pg-mini-bot" content=""', response.text)
                self.assertNotIn("<script>alert", response.text)

    async def test_the_page_still_opens_without_a_head_to_carry_the_name(self) -> None:
        (Path(self.spa.name) / "miniapp" / "index.html").write_text("<html><body>app</body></html>", encoding="utf-8")
        self.assertIn("app", (await self.page("/miniapp")).text)


if __name__ == "__main__":
    unittest.main()
