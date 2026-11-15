"""A photo sent to the bot attaches only to a payment that is settled by a receipt."""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from aiogram.fsm.context import FSMContext
from aiogram.fsm.storage.base import StorageKey
from aiogram.fsm.storage.memory import MemoryStorage
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.bot.handlers import wallet as wallet_h
from app.db.models import Base, BotUser, Payment
from app.services.users import reset_shop_reseller_id, set_shop_reseller_id


class GenericReceiptMethodTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        self.session = async_sessionmaker(self.engine, expire_on_commit=False)()
        self.user = BotUser(id=1, telegram_id=9501, referral_code="R9501")
        self.session.add(self.user)
        await self.session.commit()
        self.token = set_shop_reseller_id(None)
        self.state = FSMContext(MemoryStorage(), StorageKey(bot_id=1, chat_id=9501, user_id=9501))

    async def asyncTearDown(self):
        reset_shop_reseller_id(self.token)
        await self.session.close()
        await self.engine.dispose()

    async def send_photo(self) -> AsyncMock:
        message = MagicMock()
        message.photo = [SimpleNamespace(file_id="photo-1", file_unique_id="u1")]
        message.from_user = SimpleNamespace(id=9501)
        with (
            patch.object(wallet_h, "submit_receipt", AsyncMock(return_value=None)) as submit,
            patch.object(wallet_h, "retire_prompt_buttons", AsyncMock()),
            patch("app.bot.menu_nav.clear_checkout_nav", AsyncMock()),
        ):
            await wallet_h.generic_receipt(message, self.session, self.user, self.state)
        return submit

    async def test_photo_never_reaches_a_stars_or_gateway_checkout_payment(self):
        for pid, method in enumerate(("stars", "psp", "bbc"), start=1):
            self.session.add(Payment(id=pid, user_id=1, amount=100, method=method, status="pending"))
        await self.session.commit()
        submit = await self.send_photo()
        submit.assert_not_awaited()

    async def test_photo_goes_to_the_open_card_payment(self):
        self.session.add_all([
            Payment(id=1, user_id=1, amount=100, method="card", status="pending"),
            Payment(id=2, user_id=1, amount=100, method="stars", status="pending"),
        ])
        await self.session.commit()
        submit = await self.send_photo()
        submit.assert_awaited_once()
        self.assertEqual(submit.await_args.args[1].id, 1)


if __name__ == "__main__":
    unittest.main()
