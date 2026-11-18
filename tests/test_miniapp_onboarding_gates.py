"""Onboarding rules the Mini App's earlier entry gate (terms with an optional referral code) covered,
now asserted on ``/api/mini/onboarding``: changed terms are asked again, staff are never held,
and a person who already has an account cannot attach a referrer later."""

from __future__ import annotations

from app.db.models import BotUser, TermsAcceptance
from app.services.miniapp_auth import ERROR_HEADER, TERMS
from tests.test_miniapp_onboarding import (
    KEY,
    MAIN_TOKEN,
    NEWCOMER,
    REFERRER_CODE,
    SHOP,
    SHOP_OWNER_TG,
    SHOP_TOKEN,
    PROBE,
    OnboardingFixture,
    signed,
)

SHOP_TERMS = "قوانین فروشگاه: استفادهٔ غیرمجاز ممنوع است."


class TermsOnboardingTests(OnboardingFixture):
    async def asyncSetUp(self) -> None:
        await super().asyncSetUp()
        await self.setting("terms_entry_enabled", "1", shop=SHOP)
        await self.setting("terms_entry_text", SHOP_TERMS, shop=SHOP)
        self.init = signed(SHOP_TOKEN, NEWCOMER)

    async def state(self) -> dict:
        return (await self.get("/api/mini/onboarding", self.init, key=KEY)).json()

    async def test_changed_terms_must_be_accepted_again(self) -> None:
        self.assertEqual((await self.state())["text"], SHOP_TERMS)
        self.assertEqual((await self.post("/api/mini/onboarding/terms", self.init, key=KEY)).json(), {"step": "ready"})
        self.assertEqual((await self.get(PROBE, self.init, key=KEY)).status_code, 200)
        await self.setting("terms_entry_text", "قوانین جدید", shop=SHOP)
        again = await self.get(PROBE, self.init, key=KEY)
        self.assertEqual((again.status_code, again.headers.get(ERROR_HEADER)), (403, TERMS))
        self.assertEqual((await self.state())["text"], "قوانین جدید")

    async def test_without_terms_nobody_is_held(self) -> None:
        await self.setting("terms_entry_enabled", "0", shop=SHOP)
        self.assertEqual((await self.get(PROBE, self.init, key=KEY)).status_code, 200)
        self.assertEqual(await self.state(), {"step": "ready"})

    async def test_shop_staff_are_not_held_by_terms(self) -> None:
        owner = signed(SHOP_TOKEN, SHOP_OWNER_TG)
        self.assertEqual((await self.get(PROBE, owner, key=KEY)).status_code, 200)
        self.assertEqual((await self.get("/api/mini/onboarding", owner, key=KEY)).json(), {"step": "ready"})
        self.assertEqual((await self.post("/api/mini/onboarding/terms", owner, key=KEY)).json(), {"step": "ready"})
        self.assertEqual(await self.count(TermsAcceptance, TermsAcceptance.bot_user_id == SHOP), 0)


class RegisteredPersonReferralTests(OnboardingFixture):
    async def test_a_person_with_an_account_cannot_attach_a_referrer_with_a_code(self) -> None:
        init = signed(MAIN_TOKEN, NEWCOMER)
        self.assertEqual((await self.get(PROBE, init)).status_code, 200)
        self.assertIsNone((await self.user(NEWCOMER)).referred_by_id)
        response = await self.post("/api/mini/onboarding/referral", init, body={"code": REFERRER_CODE})
        self.assertEqual(response.json(), {"step": "ready"}, "they just get their next step")
        self.assertIsNone((await self.user(NEWCOMER)).referred_by_id)
        self.assertEqual(await self.count(BotUser, BotUser.telegram_id == NEWCOMER), 1)

    async def test_a_platform_customer_opening_a_shop_keeps_their_platform_attribution(self) -> None:
        platform_init = signed(MAIN_TOKEN, NEWCOMER, start_param=f"ref_{REFERRER_CODE.lower()}")
        self.assertEqual((await self.get(PROBE, platform_init)).status_code, 200)
        self.assertEqual((await self.user(NEWCOMER)).referred_by_id, 20)
        response = await self.post("/api/mini/onboarding/referral", signed(SHOP_TOKEN, NEWCOMER), key=KEY, body={"code": "OWNER5"})
        self.assertEqual(response.json(), {"step": "ready"})
        self.assertEqual((await self.user(NEWCOMER)).referred_by_id, 20, "an existing referrer is never replaced")
