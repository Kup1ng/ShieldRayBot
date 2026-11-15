"""«انصراف» callback data that reopens an Owner screen only works for the Owner."""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from aiogram.fsm.context import FSMContext
from aiogram.fsm.storage.base import StorageKey
from aiogram.fsm.storage.memory import MemoryStorage

from app.bot import nav_input
from app.bot.staff_cancel import register_staff_cancel_codes

OWNER_SCREENS = ("adm_tkt", "adm_set", "adm_usr", "adm_res", "adm_bak", "adm_bc", "adm_pln", "adm_home", "adm_cap")


class NavCancelOwnerCodeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        register_staff_cancel_codes()
        self.reopen = AsyncMock()
        nav_input.register_cancel_code("test_own", nav_input.CancelEntry(reopen=self.reopen, owner_only=True))
        self.addCleanup(nav_input.CANCEL_REGISTRY.pop, "test_own", None)
        self.state = FSMContext(MemoryStorage(), StorageKey(bot_id=1, chat_id=5, user_id=5))

    def callback(self, code: str) -> MagicMock:
        callback = MagicMock()
        callback.data = f"nv:cancel:{code}"
        callback.answer = AsyncMock()
        callback.message = MagicMock()
        return callback

    async def press(self, code: str, *, owner: bool) -> MagicMock:
        callback = self.callback(code)
        with (
            patch.object(nav_input, "require_bot_owner", AsyncMock(return_value=owner)),
            patch.object(nav_input, "_replay_return", AsyncMock(return_value=False)),
        ):
            await nav_input.nv_cancel_input(
                callback, MagicMock(), SimpleNamespace(id=9, role="user"), self.state,
            )
        return callback

    async def test_a_customer_cannot_reopen_an_owner_screen(self):
        await self.press("test_own", owner=False)
        self.reopen.assert_not_awaited()

    async def test_the_owner_can(self):
        await self.press("test_own", owner=True)
        self.reopen.assert_awaited_once()

    def test_every_platform_admin_screen_is_owner_only(self):
        for code in OWNER_SCREENS:
            with self.subTest(code=code):
                self.assertTrue(nav_input.CANCEL_REGISTRY[code].owner_only)


if __name__ == "__main__":
    unittest.main()
