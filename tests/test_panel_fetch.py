"""The React panel's JSON answers never report a refused or failed action as a success."""

from __future__ import annotations

import os
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch
from urllib.parse import urlsplit

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")

import httpx
from itsdangerous import URLSafeTimedSerializer
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api import app as app_module
from app.api import panel_fetch
from app.db import Base
from app.db.models import BotUser, ResellerProfile
from app.services.setup_wizard import ensure_web_secret

SESSION_VERSION = "session-version"
PASSWORD_HASH = "h" * 40
OWNER_SESSION = {
    "role": "admin", "sv": SESSION_VERSION, "org_principal_id": 1, "org_depth": 0,
    "org_parent_id": None, "org_status": "active",
}
SHOP_SESSION = {"role": "reseller", "bot_user_id": 5, "pv": PASSWORD_HASH[:24]}
PANEL_FETCH = {"x-panel-fetch": "1"}


class RedirectPayloadTests(unittest.TestCase):
    def test_a_sign_out_redirect_is_a_lost_session_not_a_success(self) -> None:
        for location in ("/logout", "/login?next=/users"):
            status, body = panel_fetch.redirect_payload(location)
            self.assertEqual(status, 401, location)
            self.assertFalse(body["ok"], location)
            self.assertFalse(body["auth"], location)

    def test_an_error_flash_is_a_failure_with_its_message(self) -> None:
        status, body = panel_fetch.redirect_payload("/finance?tab=orders&err=%D8%B1%D8%AF%20%D8%B4%D8%AF")
        self.assertEqual(status, 200)
        self.assertFalse(body["ok"])
        self.assertEqual(body["message"], "رد شد")
        self.assertEqual(urlsplit(body["location"]).query, "tab=orders")

    def test_a_success_flag_is_not_shown_as_a_message(self) -> None:
        _, body = panel_fetch.redirect_payload("/settings?tab=welcome&saved=1&_=123")
        self.assertTrue(body["ok"])
        self.assertEqual(body["message"], "")
        self.assertEqual(body["location"], "/settings?tab=welcome")


class RefusedRequestTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.engine = create_async_engine(f"sqlite+aiosqlite:///{Path(self._tmp.name) / 'p.db'}")
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        session_factory = async_sessionmaker(self.engine, expire_on_commit=False)
        async with session_factory() as session:
            session.add_all([
                BotUser(id=5, telegram_id=105, referral_code="shop5", role="reseller"),
                ResellerProfile(
                    user_id=5, is_active=True, web_username="shop", web_password_hash=PASSWORD_HASH,
                    setup_completed_at=datetime.now(timezone.utc),
                ),
            ])
            await session.commit()
        for target, value in (
            ("SessionLocal", session_factory),
            ("admin_session_version", lambda: SESSION_VERSION),
            ("is_setup_complete", lambda: True),
        ):
            patcher = patch.object(app_module, target, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.start_update = MagicMock(return_value={"ok": True})
        patcher = patch("app.services.panel_update.start_update", self.start_update)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.signer = URLSafeTimedSerializer(ensure_web_secret(), salt="pgclock-session")
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app_module.create_api_app()),
            base_url="http://panel.test",
            follow_redirects=False,
        )

    async def asyncTearDown(self) -> None:
        await self.client.aclose()
        await self.engine.dispose()
        self._tmp.cleanup()

    async def call(self, method: str, path: str, *, panel: bool) -> httpx.Response:
        headers = {
            "cookie": f"session={self.signer.dumps(SHOP_SESSION)}; csrf=token",
            "x-csrf-token": "token",
            "origin": "http://panel.test",
            **(PANEL_FETCH if panel else {}),
        }
        return await self.client.request(method, path, headers=headers, data={"csrf_token": "token"} if method == "POST" else None)

    async def test_a_refused_action_answers_403_and_ok_false_to_the_panel(self) -> None:
        response = await self.call("POST", "/update/start", panel=True)
        self.assertEqual(response.status_code, 403)
        body = response.json()
        self.assertFalse(body["ok"])
        self.assertEqual(body["message"], panel_fetch.STATUS_ERRORS[403])
        self.start_update.assert_not_called()

    async def test_a_refused_data_read_is_an_error_not_an_empty_page(self) -> None:
        response = await self.call("GET", "/api/panel/system/update", panel=True)
        self.assertEqual(response.status_code, 403)
        self.assertFalse(response.json()["ok"])

    async def test_a_browser_without_the_panel_header_is_still_redirected(self) -> None:
        response = await self.call("POST", "/update/start", panel=False)
        self.assertEqual(response.status_code, 303)
        self.assertEqual(response.headers["location"], "/home")
        self.start_update.assert_not_called()


if __name__ == "__main__":
    unittest.main()
