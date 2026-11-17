"""Mini App «اتصال اشتراک قبلی»: the home offer, hiding it, and adding a service by its link."""

from __future__ import annotations

import json
import logging
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
from sqlalchemy import func, select

from app.api.miniapp_service_import import (
    BODY_LIMIT_BYTES,
    UNEXPECTED_FAILURE,
    register_miniapp_service_import,
)
from app.db.models import (
    BotUser,
    BotUserShop,
    ResellerProfile,
    ServiceImportOfferDismissal,
    ServiceImportRequest,
    UserService,
)
from app.services import service_import as si
from app.services import service_import_config as si_config
from app.services.miniapp_shop import NOT_A_CUSTOMER
from app.services.pasarguard import PasarGuardError
from app.services.service_import import GENERIC_REFUSAL, INVALID_LINK, NOT_ENABLED, PENDING_NOTICE, RATE_LIMITED
from app.services.users import clear_settings_cache, set_setting
from tests.test_miniapp_shop_readonly import KEY, OTHER_KEY, OTHER_SHOP, SHOP, ShopFixture
from tests.test_miniapp_shop_scope import MAIN_TOKEN, SHOP_TOKEN, signed
from tests.test_service_import import PLATFORM_ADMIN, SHOP_ADMIN, FakePanel, _panel_user

OFFER, DISMISS, IMPORT = "/api/mini/service-import/offer", "/api/mini/service-import/dismiss", "/api/mini/service-import"
# Telegram ids of the customers these tests add (the fixture's customer 10 owns services everywhere).
PLATFORM_NEWCOMER, SHOP_NEWCOMER, BOTH_NEWCOMER, OTHER_SHOP_CUSTOMER = 2020, 2021, 2022, 2023
PLATFORM_LINK = "https://p.example/sub/tok-plat-0000001"
PLATFORM_TOKEN = "tok-plat-0000001"
SHOP_LINK = "https://p.example/sub/tok-shop-0000001"
SHOP_TOKEN_VALUE = "tok-shop-0000001"
HOSTILE = '<script>alert("x")</script><b onmouseover=1>'


class ImportRoutesCase(ShopFixture):
    def register_extra_routes(self, app, get_db) -> None:
        register_miniapp_service_import(app, get_db=get_db)

    async def asyncSetUp(self) -> None:
        await super().asyncSetUp()
        si.clear_identity_cache()
        self.addCleanup(si.clear_identity_cache)
        async with self.Session() as session:
            session.add_all([
                BotUser(id=20, telegram_id=PLATFORM_NEWCOMER, referral_code="n20", role="user"),
                BotUser(id=21, telegram_id=SHOP_NEWCOMER, referral_code="n21", role="user", reseller_id=SHOP),
                BotUser(id=22, telegram_id=BOTH_NEWCOMER, referral_code="n22", role="user"),
                BotUserShop(bot_user_id=22, shop_id=SHOP),
                BotUser(id=23, telegram_id=OTHER_SHOP_CUSTOMER, referral_code="n23", role="user", reseller_id=OTHER_SHOP),
            ])
            profile = await session.scalar(select(ResellerProfile).where(ResellerProfile.user_id == SHOP))
            profile.pg_admin_username = SHOP_ADMIN
            await session.commit()
            for shop_id in (None, SHOP):
                await set_setting(session, "service_import_enabled", "1", reseller_id=shop_id)
        clear_settings_cache()

        users = {
            PLATFORM_TOKEN: _panel_user(11, "plat-one", PLATFORM_ADMIN),
            "tok-plat-0000002": _panel_user(12, "plat-two", PLATFORM_ADMIN),
            SHOP_TOKEN_VALUE: _panel_user(21, "shop-one", SHOP_ADMIN),
        }
        self.platform_panel = FakePanel(users)
        self.shop_panel = FakePanel(users, visible_admin=SHOP_ADMIN)
        panel_settings = SimpleNamespace(pg_username=PLATFORM_ADMIN, pg_subscription_path="/sub")

        async def for_reseller(_session, _shop_id):
            return self.shop_panel

        self.dispatch = AsyncMock(return_value=1)
        self.notify_bot = SimpleNamespace(session=SimpleNamespace(close=AsyncMock()))
        for target in (
            patch.object(si, "get_pg", lambda: self.platform_panel),
            patch.object(si, "get_settings", lambda: panel_settings),
            patch.object(si_config, "get_settings", lambda: panel_settings),
            patch.object(si, "get_pg_for_reseller", for_reseller),
            patch("app.api.miniapp_service_import.open_notify_bot_for_user", AsyncMock(return_value=(self.notify_bot, True))),
            patch("app.services.service_import_notify._dispatch_dual_notify", self.dispatch),
        ):
            target.start()
            self.patches.append(target)

    def headers(self, telegram_id: int, *, shop: bool = False, key: str = KEY, token: str | None = None) -> dict[str, str]:
        headers = {"X-Telegram-Init-Data": signed(token or (SHOP_TOKEN if shop else MAIN_TOKEN), telegram_id)}
        if shop:
            headers["X-Mini-Shop"] = key
        return headers

    async def offer(self, telegram_id: int, **kwargs) -> bool:
        response = await self.client.get(OFFER, headers=self.headers(telegram_id, **kwargs))
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["show"]

    async def dismiss(self, telegram_id: int, body: dict | None = None, **kwargs) -> httpx.Response:
        return await self.client.post(DISMISS, json=body or {}, headers=self.headers(telegram_id, **kwargs))

    async def add(self, telegram_id: int, link, **kwargs) -> httpx.Response:
        return await self.client.post(IMPORT, json={"link": link}, headers=self.headers(telegram_id, **kwargs))

    async def rows(self, model):
        async with self.Session() as session:
            return list((await session.scalars(select(model))).all())

    async def imported(self) -> list[UserService]:
        return [row for row in await self.rows(UserService) if row.remark == "imported"]

    async def set_import_setting(self, key: str, value: str, *, shop_id: int | None = None) -> None:
        async with self.Session() as session:
            await set_setting(session, key, value, reseller_id=shop_id)
        clear_settings_cache()


class OfferTests(ImportRoutesCase):
    async def test_a_customer_without_services_gets_the_offer_while_the_feature_is_on(self) -> None:
        self.assertTrue(await self.offer(PLATFORM_NEWCOMER))
        self.assertTrue(await self.offer(SHOP_NEWCOMER, shop=True))

    async def test_the_offer_is_hidden_when_the_feature_is_off(self) -> None:
        await self.set_import_setting("service_import_enabled", "0")
        self.assertFalse(await self.offer(PLATFORM_NEWCOMER))
        self.assertTrue(await self.offer(SHOP_NEWCOMER, shop=True), "the shop's own switch is separate")

    async def test_the_offer_is_hidden_for_a_customer_who_already_has_a_service_there(self) -> None:
        # The fixture's customer owns a service on the platform and in the shop (and another shop's).
        self.assertFalse(await self.offer(1010))
        self.assertFalse(await self.offer(1010, shop=True))

    async def test_a_service_sold_elsewhere_does_not_hide_the_offer_here(self) -> None:
        async with self.Session() as session:
            session.add(UserService(id=201, bot_user_id=22, pg_username="elsewhere", shop_id=OTHER_SHOP))
            await session.commit()
        self.assertTrue(await self.offer(BOTH_NEWCOMER))
        self.assertTrue(await self.offer(BOTH_NEWCOMER, shop=True))

    async def test_importing_a_service_ends_the_offer(self) -> None:
        self.assertEqual((await self.add(PLATFORM_NEWCOMER, PLATFORM_LINK)).status_code, 200)
        self.assertFalse(await self.offer(PLATFORM_NEWCOMER))

    async def test_requests_without_valid_init_data_are_refused(self) -> None:
        for method, path in (("GET", OFFER), ("POST", DISMISS), ("POST", IMPORT)):
            with self.subTest(path=path):
                bare = await self.client.request(method, path, json={"link": PLATFORM_LINK} if method == "POST" else None)
                self.assertEqual(bare.status_code, 401)
                forged = await self.client.request(
                    method, path, headers=self.headers(PLATFORM_NEWCOMER, token="999:wrong-token"),
                    json={"link": PLATFORM_LINK} if method == "POST" else None,
                )
                self.assertEqual(forged.status_code, 401)
        self.assertEqual(await self.rows(ServiceImportOfferDismissal), [])
        self.assertEqual(await self.imported(), [])


class DismissTests(ImportRoutesCase):
    async def test_dismissing_hides_the_offer_for_good_and_twice_leaves_one_row(self) -> None:
        for _ in range(2):
            response = await self.dismiss(PLATFORM_NEWCOMER)
            self.assertEqual((response.status_code, response.json()), (200, {"dismissed": True}))
        self.assertFalse(await self.offer(PLATFORM_NEWCOMER))
        rows = await self.rows(ServiceImportOfferDismissal)
        self.assertEqual([(row.user_id, row.shop_key) for row in rows], [(20, 0)])

    async def test_dismissing_in_one_shop_keeps_the_offer_in_the_others(self) -> None:
        self.assertEqual((await self.dismiss(BOTH_NEWCOMER, shop=True)).status_code, 200)
        self.assertFalse(await self.offer(BOTH_NEWCOMER, shop=True))
        self.assertTrue(await self.offer(BOTH_NEWCOMER), "the platform offer is a separate choice")
        self.assertEqual([(r.user_id, r.shop_key) for r in await self.rows(ServiceImportOfferDismissal)], [(22, SHOP)])

    async def test_dismissing_never_touches_another_customer_or_shop_named_in_the_body(self) -> None:
        response = await self.dismiss(
            PLATFORM_NEWCOMER, {"user_id": 21, "bot_user_id": 21, "shop_id": SHOP, "shop_key": SHOP}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual([(r.user_id, r.shop_key) for r in await self.rows(ServiceImportOfferDismissal)], [(20, 0)])
        self.assertTrue(await self.offer(SHOP_NEWCOMER, shop=True))

    async def test_a_customer_of_another_shop_cannot_dismiss_in_this_shop(self) -> None:
        response = await self.dismiss(OTHER_SHOP_CUSTOMER, shop=True)
        self.assertEqual((response.status_code, response.json()["detail"]), (403, NOT_A_CUSTOMER))
        self.assertEqual(await self.rows(ServiceImportOfferDismissal), [])

    async def test_a_shop_key_that_does_not_match_the_signing_bot_is_refused(self) -> None:
        response = await self.dismiss(SHOP_NEWCOMER, shop=True, key=OTHER_KEY, token=SHOP_TOKEN)
        self.assertEqual(response.status_code, 401)
        self.assertEqual(await self.rows(ServiceImportOfferDismissal), [])


class ImportTests(ImportRoutesCase):
    async def test_a_platform_customer_adds_a_platform_service(self) -> None:
        response = await self.add(PLATFORM_NEWCOMER, PLATFORM_LINK)
        self.assertEqual(response.status_code, 200, response.text)
        (service,) = await self.imported()
        self.assertEqual((service.bot_user_id, service.shop_id, service.pg_user_id), (20, None, 11))
        self.assertEqual(response.json(), {
            "outcome": "added", "message": "سرویس به لیست شما اضافه شد.", "service_id": service.id,
        })

    async def test_the_response_never_carries_the_link_or_its_token(self) -> None:
        response = await self.add(PLATFORM_NEWCOMER, PLATFORM_LINK)
        self.assertNotIn(PLATFORM_TOKEN, response.text)
        self.assertNotIn("p.example", response.text)
        self.assertNotIn("subscription", response.text)

    async def test_a_shop_customer_adds_a_service_of_the_shops_panel_admin(self) -> None:
        response = await self.add(SHOP_NEWCOMER, SHOP_LINK, shop=True)
        self.assertEqual(response.status_code, 200, response.text)
        (service,) = await self.imported()
        self.assertEqual((service.bot_user_id, service.shop_id), (21, SHOP))

    async def test_importing_the_same_link_twice_makes_one_service(self) -> None:
        first = (await self.add(PLATFORM_NEWCOMER, PLATFORM_LINK)).json()
        second = await self.add(PLATFORM_NEWCOMER, PLATFORM_TOKEN)  # the bare token is the same service
        third = await self.add(PLATFORM_NEWCOMER, f"  {PLATFORM_LINK}\n")
        self.assertEqual([second.status_code, third.status_code], [200, 200])
        self.assertEqual(second.json()["outcome"], "already_yours")
        self.assertEqual(second.json()["service_id"], first["service_id"])
        self.assertEqual(len(await self.imported()), 1)

    async def test_the_link_is_not_read_from_the_query_string(self) -> None:
        response = await self.client.post(
            IMPORT, params={"link": PLATFORM_LINK}, headers=self.headers(PLATFORM_NEWCOMER)
        )
        self.assertEqual((response.status_code, response.json()["detail"]), (400, INVALID_LINK))
        self.assertEqual(self.platform_panel.info_calls, [])
        self.assertEqual(await self.imported(), [])

    async def test_a_link_to_another_shops_panel_user_is_refused_in_both_directions(self) -> None:
        for telegram_id, link, shop in ((PLATFORM_NEWCOMER, SHOP_LINK, False), (SHOP_NEWCOMER, PLATFORM_LINK, True)):
            with self.subTest(telegram_id=telegram_id):
                response = await self.add(telegram_id, link, shop=shop)
                self.assertEqual((response.status_code, response.json()["detail"]), (400, GENERIC_REFUSAL))
        self.assertEqual(await self.imported(), [])

    async def test_a_customer_cannot_take_a_service_that_belongs_to_another_customer(self) -> None:
        self.assertEqual((await self.add(PLATFORM_NEWCOMER, PLATFORM_LINK)).status_code, 200)
        async with self.Session() as session:
            session.add(BotUser(id=24, telegram_id=2024, referral_code="n24", role="user"))
            await session.commit()
        response = await self.add(2024, PLATFORM_LINK)
        self.assertEqual((response.status_code, response.json()["detail"]), (400, GENERIC_REFUSAL))
        (service,) = await self.imported()
        self.assertEqual(service.bot_user_id, 20)

    async def test_a_customer_of_another_shop_cannot_import_into_this_shop(self) -> None:
        response = await self.add(OTHER_SHOP_CUSTOMER, SHOP_LINK, shop=True)
        self.assertEqual((response.status_code, response.json()["detail"]), (403, NOT_A_CUSTOMER))
        self.assertEqual(self.shop_panel.info_calls, [])
        self.assertEqual(await self.imported(), [])

    async def test_a_shop_the_customer_does_not_belong_to_cannot_be_reached_through_the_body(self) -> None:
        response = await self.client.post(
            IMPORT, json={"link": SHOP_LINK, "shop_id": SHOP, "user_id": 21},
            headers=self.headers(PLATFORM_NEWCOMER),
        )
        self.assertEqual((response.status_code, response.json()["detail"]), (400, GENERIC_REFUSAL))
        self.assertEqual(await self.imported(), [])

    async def test_nothing_is_added_while_the_feature_is_off(self) -> None:
        await self.set_import_setting("service_import_enabled", "0")
        response = await self.add(PLATFORM_NEWCOMER, PLATFORM_LINK)
        self.assertEqual((response.status_code, response.json()["detail"]), (403, NOT_ENABLED))
        self.assertEqual(self.platform_panel.info_calls, [])
        self.assertEqual(await self.imported(), [])

    async def test_a_blocked_customer_is_refused(self) -> None:
        async with self.Session() as session:
            (await session.get(BotUser, 20)).is_blocked = True
            await session.commit()
        self.assertEqual((await self.add(PLATFORM_NEWCOMER, PLATFORM_LINK)).status_code, 403)
        self.assertEqual(await self.imported(), [])

    async def test_too_many_failed_tries_are_limited(self) -> None:
        for number in range(5):
            response = await self.add(PLATFORM_NEWCOMER, f"tok-unknown-{number:07d}")
            self.assertEqual((response.status_code, response.json()["detail"]), (400, GENERIC_REFUSAL))
        limited = await self.add(PLATFORM_NEWCOMER, PLATFORM_LINK)
        self.assertEqual((limited.status_code, limited.json()["detail"]), (429, RATE_LIMITED))
        self.assertEqual(await self.imported(), [])


class PendingApprovalTests(ImportRoutesCase):
    async def asyncSetUp(self) -> None:
        await super().asyncSetUp()
        await self.set_import_setting("service_import_mode", "approval")

    async def test_a_request_is_queued_once_and_the_admins_are_told_once(self) -> None:
        for link in (PLATFORM_LINK, PLATFORM_TOKEN):
            response = await self.add(PLATFORM_NEWCOMER, link)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(
                response.json(), {"outcome": "pending_approval", "message": PENDING_NOTICE, "service_id": None}
            )
        self.assertEqual(await self.imported(), [])
        self.assertEqual(len(await self.rows(ServiceImportRequest)), 1)
        self.assertEqual(self.dispatch.await_count, 1)
        self.assertNotIn(PLATFORM_TOKEN, str(self.dispatch.await_args))
        self.notify_bot.session.close.assert_awaited_once()


class HostileInputTests(ImportRoutesCase):
    async def test_hostile_text_is_refused_with_the_fixed_message_and_never_echoed(self) -> None:
        for link in (HOSTILE, f"https://p.example/sub/{HOSTILE}", HOSTILE * 400, "x" * 5000, "\x00‮"):
            with self.subTest(link=link[:30]):
                response = await self.add(PLATFORM_NEWCOMER, link)
                self.assertEqual((response.status_code, response.json()["detail"]), (400, INVALID_LINK))
                self.assertNotIn("script", response.text)
                self.assertNotIn("onmouseover", response.text)
        self.assertEqual(self.platform_panel.info_calls, [])
        self.assertEqual(await self.imported(), [])

    async def test_malformed_bodies_are_one_safe_refusal(self) -> None:
        headers = {**self.headers(PLATFORM_NEWCOMER), "Content-Type": "application/json"}
        bodies = [b"", b"not json " + HOSTILE.encode(), b"[]", b'"link"', b"null", b"{}", b'{"link": 5}',
                  b'{"link": null}', b'{"link": ["a"]}', b'{"link": "   "}', b'{"link": {"a": 1}}']
        for body in bodies:
            with self.subTest(body=body[:30]):
                response = await self.client.post(IMPORT, content=body, headers=headers)
                self.assertEqual((response.status_code, response.json()["detail"]), (400, INVALID_LINK))
                self.assertNotIn("script", response.text)
        self.assertEqual(self.platform_panel.info_calls, [])

    async def test_an_oversized_body_is_refused_before_it_is_read(self) -> None:
        body = json.dumps({"link": "a" * (BODY_LIMIT_BYTES + 1)})
        response = await self.client.post(
            IMPORT, content=body, headers={**self.headers(PLATFORM_NEWCOMER), "Content-Type": "application/json"}
        )
        self.assertEqual((response.status_code, response.json()["detail"]), (400, INVALID_LINK))
        self.assertEqual(self.platform_panel.info_calls, [])


class SecretHandlingTests(ImportRoutesCase):
    def capture_logs(self) -> list[str]:
        messages: list[str] = []

        class Collect(logging.Handler):
            def emit(self, record: logging.LogRecord) -> None:
                messages.append(record.getMessage() + " " + (self.format(record) if record.exc_info else ""))

        handler = Collect(level=logging.DEBUG)
        root = logging.getLogger()
        previous = root.level
        root.addHandler(handler)
        root.setLevel(logging.DEBUG)
        self.addCleanup(lambda: (root.removeHandler(handler), root.setLevel(previous)))
        return messages

    async def test_a_panel_failure_is_a_safe_message_and_the_token_stays_out_of_the_logs(self) -> None:
        logs = self.capture_logs()
        self.platform_panel.fail_with = PasarGuardError(f"GET /sub/{PLATFORM_TOKEN} failed", status_code=500)
        response = await self.add(PLATFORM_NEWCOMER, PLATFORM_LINK)
        self.assertEqual((response.status_code, response.json()["detail"]), (503, si.PANEL_UNAVAILABLE))
        self.assertNotIn(PLATFORM_TOKEN, response.text)
        self.assertFalse([line for line in logs if PLATFORM_TOKEN in line], logs)

    async def test_a_refused_link_never_reaches_the_logs_or_the_answer(self) -> None:
        logs = self.capture_logs()
        response = await self.add(PLATFORM_NEWCOMER, "https://p.example/sub/tok-unknown-0000001")
        self.assertEqual(response.status_code, 400)
        self.assertNotIn("tok-unknown-0000001", response.text)
        self.assertFalse([line for line in logs if "tok-unknown-0000001" in line], logs)

    async def test_a_database_error_is_a_safe_message_without_the_link(self) -> None:
        from sqlalchemy.exc import OperationalError

        logs = self.capture_logs()
        failing = AsyncMock(side_effect=OperationalError("INSERT ...", {"tok": PLATFORM_TOKEN}, Exception("x")))
        with patch("app.api.miniapp_service_import.import_existing_service", failing):
            response = await self.add(PLATFORM_NEWCOMER, PLATFORM_LINK)
        self.assertEqual((response.status_code, response.json()["detail"]), (503, UNEXPECTED_FAILURE))
        self.assertNotIn(PLATFORM_TOKEN, response.text)
        self.assertFalse([line for line in logs if PLATFORM_TOKEN in line], logs)

    async def test_routes_never_read_the_link_from_a_url(self) -> None:
        count = int(await self.session_count(ServiceImportOfferDismissal))
        response = await self.client.get(f"{OFFER}?link={PLATFORM_TOKEN}", headers=self.headers(PLATFORM_NEWCOMER))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(await self.session_count(ServiceImportOfferDismissal), count)
        self.assertEqual(self.platform_panel.info_calls, [])

    async def session_count(self, model) -> int:
        async with self.Session() as session:
            return int(await session.scalar(select(func.count()).select_from(model)) or 0)
