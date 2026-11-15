"""A burst of receipts into one staff chat waits out Telegram's flood limit instead of losing one."""

from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

from aiogram.exceptions import TelegramRetryAfter
from aiogram.methods import SendMessage

from app.bot import tg_utils
from app.bot.tg_utils import RETRY_AFTER_CAP_SECONDS, send_with_flood_wait


def flood(seconds: int) -> TelegramRetryAfter:
    return TelegramRetryAfter(method=SendMessage(chat_id=1, text="x"), message="flood", retry_after=seconds)


class SendWithFloodWaitTests(unittest.IsolatedAsyncioTestCase):
    async def test_flood_wait_is_waited_out_and_the_message_sent(self):
        send = AsyncMock(side_effect=[flood(3), "sent"])
        with patch.object(tg_utils.asyncio, "sleep", AsyncMock()) as sleep:
            self.assertEqual(await send_with_flood_wait(send), "sent")
        sleep.assert_awaited_once_with(3.0)
        self.assertEqual(send.await_count, 2)

    async def test_a_very_long_wait_is_capped(self):
        send = AsyncMock(side_effect=[flood(600), "sent"])
        with patch.object(tg_utils.asyncio, "sleep", AsyncMock()) as sleep:
            await send_with_flood_wait(send)
        sleep.assert_awaited_once_with(RETRY_AFTER_CAP_SECONDS)

    async def test_other_errors_are_not_retried(self):
        send = AsyncMock(side_effect=RuntimeError("bad"))
        with self.assertRaises(RuntimeError):
            await send_with_flood_wait(send)
        self.assertEqual(send.await_count, 1)


if __name__ == "__main__":
    unittest.main()
