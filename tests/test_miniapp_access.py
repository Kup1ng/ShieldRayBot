"""Mini App entry gate: the shop's entry terms hold a customer until accepted, with an optional referral code."""

from __future__ import annotations

import httpx
from sqlalchemy import select

from app.api.miniapp_access import register_miniapp_access
from app.db.models import BotUser, BotUserShop, TermsAcceptance
from app.services.discount_checkout import _failures
from app.services.miniapp_auth import ERROR_HEADER, TERMS
from app.services.users import clear_settings_cache, set_setting
from tests.test_miniapp_shop_readonly import CUSTOMER, KEY, SHOP, ShopFixture
from tests.test_miniapp_shop_scope import MAIN_TOKEN, SHOP_TOKEN, signed

NEWCOMER = 1020
SHOP_TERMS = "قوانین فروشگاه: استفادهٔ غیرمجاز ممنوع است."


class AccessFixture(ShopFixture):
    async def asyncSetUp(self) -> None:
        await super().asyncSetUp()
        _failures.clear()
        async with self.Session() as session:
            session.add_all([
                BotUser(id=20, telegram_id=NEWCOMER, referral_code="NEW20", role="user", reseller_id=SHOP),
                BotUser(id=21, telegram_id=1021, referral_code="SHOPREF", role="user", reseller_id=SHOP),
                BotUser(id=22, telegram_id=1022, referral_code="PLATREF", role="user"),
            ])
            await session.commit()
            await set_setting(session, "terms_entry_enabled", "1", reseller_id=SHOP)
            await set_setting(session, "terms_entry_text", SHOP_TERMS, reseller_id=SHOP)
        clear_settings_cache()

    def register_extra_routes(self, app, get_db) -> None:
        register_miniapp_access(app, get_db=get_db)

    def headers(self, telegram_id: int, *, key: str | None = KEY, token: str = SHOP_TOKEN) -> dict:
        out = {"X-Telegram-Init-Data": signed(token, telegram_id)}
        if key:
            out["X-Mini-Shop"] = key
        return out

    async def me(self, telegram_id: int = NEWCOMER, **kw) -> httpx.Response:
        return await self.client.get("/api/mini/me", headers=self.headers(telegram_id, **kw))

    async def access(self, telegram_id: int = NEWCOMER, **kw) -> dict:
        response = await self.client.get("/api/mini/access", headers=self.headers(telegram_id, **kw))
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    async def accept(self, body: dict, telegram_id: int = NEWCOMER, **kw) -> httpx.Response:
        return await self.client.post("/api/mini/access", json=body, headers=self.headers(telegram_id, **kw))

    async def referrer_of(self, user_id: int) -> int | None:
        async with self.Session() as session:
            return (await session.get(BotUser, user_id)).referred_by_id


class TermsGateTests(AccessFixture):
    async def test_terms_gate_blocks_me_until_accepted(self) -> None:
        blocked = await self.me()
        self.assertEqual((blocked.status_code, blocked.headers.get(ERROR_HEADER)), (403, TERMS))
        state = await self.access()
        self.assertTrue(state["required"])
        self.assertEqual(state["terms"]["text"], SHOP_TERMS)
        self.assertTrue(state["terms"]["title"])
        self.assertEqual(state["referral"], {"asked": True, "required": False})
        response = await self.accept({"accept": True, "referral_code": None})
        self.assertEqual((response.status_code, response.json()), (200, {"ok": True}))
        self.assertEqual((await self.me()).status_code, 200)
        self.assertFalse((await self.access())["required"])
        self.assertEqual((await self.accept({"accept": True})).status_code, 200, "accepting again is harmless")

    async def test_accept_must_be_true(self) -> None:
        for body in ({}, {"accept": False}, {"accept": "true"}, {"accept": 1}):
            with self.subTest(body=body):
                self.assertEqual((await self.accept(body)).status_code, 400)
        self.assertEqual((await self.me()).status_code, 403)
        self.assertEqual((await self.client.post("/api/mini/access", content=b"[]",
                                                 headers=self.headers(NEWCOMER))).status_code, 400)

    async def test_acceptance_is_per_shop_and_recorded_like_the_bot(self) -> None:
        async with self.Session() as session:
            await set_setting(session, "terms_entry_enabled", "1")
            await set_setting(session, "terms_entry_text", "قوانین پلتفرم")
        clear_settings_cache()
        self.assertEqual((await self.accept({"accept": True})).status_code, 200)
        platform = await self.me(key=None, token=MAIN_TOKEN)
        self.assertEqual((platform.status_code, platform.headers.get(ERROR_HEADER)), (403, TERMS))
        self.assertEqual((await self.access(key=None, token=MAIN_TOKEN))["terms"]["text"], "قوانین پلتفرم")
        async with self.Session() as session:
            rows = list(await session.scalars(select(TermsAcceptance)))
        self.assertEqual([(r.bot_user_id, r.shop_owner_id, r.gate) for r in rows], [(20, SHOP, "entry")])

    async def test_changed_terms_must_be_accepted_again(self) -> None:
        self.assertEqual((await self.accept({"accept": True})).status_code, 200)
        async with self.Session() as session:
            await set_setting(session, "terms_entry_text", "قوانین جدید", reseller_id=SHOP)
        clear_settings_cache()
        self.assertEqual((await self.me()).status_code, 403)
        self.assertEqual((await self.access())["terms"]["text"], "قوانین جدید")

    async def test_no_terms_means_no_gate(self) -> None:
        async with self.Session() as session:
            await set_setting(session, "terms_entry_enabled", "0", reseller_id=SHOP)
        clear_settings_cache()
        self.assertEqual((await self.me()).status_code, 200)
        self.assertEqual(await self.access(), {"required": False, "terms": None,
                                               "referral": {"asked": False, "required": False}})

    async def test_shop_staff_are_not_gated(self) -> None:
        self.assertEqual((await self.me(5005)).status_code, 200)
        self.assertFalse((await self.access(5005))["required"])


class ReferralTests(AccessFixture):
    async def test_valid_shop_code_is_recorded_once(self) -> None:
        response = await self.accept({"accept": True, "referral_code": "shopref"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(await self.referrer_of(20), 21)
        self.assertEqual((await self.me()).status_code, 200)

    async def test_invalid_code_refuses_and_keeps_the_gate(self) -> None:
        for code in ("NOPE", "PLATREF", "NEW20", "<b>x</b>", 42, "x" * 65):
            with self.subTest(code=code):
                response = await self.accept({"accept": True, "referral_code": code})
                self.assertEqual(response.status_code, 400)
        self.assertIsNone(await self.referrer_of(20))
        self.assertEqual((await self.me()).status_code, 403, "nothing was accepted")
        self.assertEqual((await self.accept({"accept": True, "referral_code": ""})).status_code, 200,
                         "an empty code is the same as none")
        self.assertIsNone(await self.referrer_of(20))

    async def test_wrong_codes_are_rate_limited(self) -> None:
        for _ in range(8):
            await self.accept({"accept": True, "referral_code": "WRONG"})
        response = await self.accept({"accept": True, "referral_code": "SHOPREF"})
        self.assertEqual(response.status_code, 400)
        self.assertIsNone(await self.referrer_of(20))

    async def test_an_account_shown_the_gate_again_cannot_attach_a_referrer_later(self) -> None:
        self.assertEqual((await self.accept({"accept": True})).status_code, 200)
        async with self.Session() as session:
            await set_setting(session, "terms_entry_text", "قوانین جدید", reseller_id=SHOP)
        clear_settings_cache()
        state = await self.access()
        self.assertTrue(state["required"])
        self.assertFalse(state["referral"]["asked"], "only the very first entry may carry a referral code")
        self.assertEqual((await self.accept({"accept": True, "referral_code": "SHOPREF"})).status_code, 200)
        self.assertIsNone(await self.referrer_of(20))

    async def test_an_account_of_another_shop_is_not_asked_for_this_shops_code(self) -> None:
        # A platform customer who later joined this shop: a member here, but registered elsewhere.
        async with self.Session() as session:
            session.add(BotUserShop(bot_user_id=22, shop_id=SHOP))
            await session.commit()
        state = await self.access(1022)
        self.assertTrue(state["required"])
        self.assertFalse(state["referral"]["asked"])
        self.assertEqual((await self.accept({"accept": True, "referral_code": "SHOPREF"}, 1022)).status_code, 200)
        self.assertIsNone(await self.referrer_of(22))

    async def test_existing_customers_are_not_asked(self) -> None:
        state = await self.access(CUSTOMER)
        self.assertTrue(state["required"])
        self.assertFalse(state["referral"]["asked"], "a customer who already bought keeps their attribution")
        self.assertEqual((await self.accept({"accept": True, "referral_code": "SHOPREF"}, CUSTOMER)).status_code, 200)
        self.assertIsNone(await self.referrer_of(10))
        self.assertEqual((await self.me(CUSTOMER)).status_code, 200)
