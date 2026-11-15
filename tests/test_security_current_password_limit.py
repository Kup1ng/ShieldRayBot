"""A signed-in session cannot guess the account's current password without limit."""

from __future__ import annotations

import tempfile
from pathlib import Path
from unittest.mock import patch
from urllib.parse import unquote

from app.api import login_guard
from tests.test_update_owner_only import SHOP_SESSION, RoutesHarness

RIGHT = "Right-Password-1"
NEW = "Brand-New-Pass-77"


class CurrentPasswordLimitTests(RoutesHarness):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        self.lock_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.lock_dir.cleanup)
        for target, value in (
            ("_LOGIN_LOCK_FILE", Path(self.lock_dir.name) / "login_lockouts.json"),
            ("DATA_DIR", Path(self.lock_dir.name)),
        ):
            patcher = patch.object(login_guard, target, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        login_guard._LOGIN_FAILURES.clear()
        login_guard._IN_FLIGHT.clear()
        self.addCleanup(login_guard._LOGIN_FAILURES.clear)
        self.checked: list[str] = []

        def verify(password, _hash):
            self.checked.append(password)
            return password == RIGHT

        patcher = patch("app.api.security.verify_password_hash", verify)
        patcher.start()
        self.addCleanup(patcher.stop)

    async def change_password(self, current: str):
        cookie = f"session={self.signer.dumps(SHOP_SESSION)}; csrf=token"
        headers = {"cookie": cookie, "x-csrf-token": "token", "origin": "http://panel.test"}
        data = {"current_password": current, "new_password": NEW, "new_password2": NEW}
        return await self.client.post("/security/password", headers=headers, data=data)

    async def test_guessing_stops_at_the_login_limit(self):
        for i in range(login_guard._LOGIN_MAX_FAILURES):
            response = await self.change_password(f"guess-{i}")
            self.assertIn("err=", response.headers["location"])
        response = await self.change_password(RIGHT)
        self.assertIn("رمز فعلی اشتباه است", unquote(response.headers["location"]))
        self.assertNotIn(RIGHT, self.checked, "a blocked attempt is not even checked")
