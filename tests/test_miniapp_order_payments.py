"""Mini App order payments: methods, plan/renewal payment start, receipt upload and status, per shop and customer."""

from __future__ import annotations

import asyncio
import json
import secrets
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import create_async_engine

from app.api.miniapp_order_payments import register_miniapp_order_payments
from app.db.models import BotUser, Order, OrderStatus, Payment, Plan, UserService
from app.services.service_renewals import renewal_terms
from app.services.shop_membership import ensure_member
from app.services.users import clear_settings_cache, set_setting
from tests.test_miniapp_shop_readonly import CUSTOMER, KEY, OTHER_KEY, OTHER_SHOP, SHOP, ShopFixture
from tests.test_miniapp_shop_scope import MAIN_TOKEN, OTHER_SHOP_TOKEN, SHOP_TOKEN, signed

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
SHOP_PLAN, PLATFORM_PLAN, OTHER_SHOP_PLAN, SHOP_TRIAL = 51, 52, 53, 54
SECOND_CUSTOMER = 1011
RENEWABLE = 104
CARDS = json.dumps([
    {"id": "c1", "number": "6037991111111111", "holder": "Shop One"},
    {"id": "c2", "number": "6037992222222222", "holder": "Shop Two"},
])
CRYPTO = json.dumps([{"id": "w1", "asset": "USDT", "network": "TRC20", "address": "TXaddress000001"}])
PAY_SETTINGS = {
    "pay_wallet_enabled": "1", "pay_card_enabled": "1", "pay_crypto_enabled": "1",
    "pay_gateway_enabled": "0", "pay_psp_enabled": "0", "pay_bbc_enabled": "1", "pay_stars_enabled": "1",
    "payment_cards": CARDS, "payment_crypto_wallets": CRYPTO,
}


class FakeBot:
    """Records receipt photos sent to customers and answers like Telegram."""

    def __init__(self) -> None:
        self.sent: list[int] = []
        self.session = SimpleNamespace(close=AsyncMock())

    async def send_photo(self, *, chat_id, photo, caption):
        self.sent.append(chat_id)
        n = len(self.sent)
        return SimpleNamespace(photo=[SimpleNamespace(file_id=f"file-{n}", file_unique_id=f"uniq-{n}")])


def new_key() -> str:
    return secrets.token_hex(16)


class OrderPaymentFixture(ShopFixture):
    async def asyncSetUp(self) -> None:
        await super().asyncSetUp()
        async with self.Session() as session:
            session.add_all([
                BotUser(id=11, telegram_id=SECOND_CUSTOMER, referral_code="c11", role="user", reseller_id=SHOP),
                Plan(id=SHOP_PLAN, name="shop plan", price=5_000, duration_days=30, data_limit_gb=10,
                     owner_reseller_id=SHOP, is_active=True),
                Plan(id=PLATFORM_PLAN, name="platform plan", price=3_000, duration_days=30, data_limit_gb=10,
                     is_active=True),
                Plan(id=OTHER_SHOP_PLAN, name="other shop plan", price=1_000, duration_days=30, data_limit_gb=10,
                     owner_reseller_id=OTHER_SHOP, is_active=True),
                Plan(id=SHOP_TRIAL, name="shop trial", price=0, duration_days=1, data_limit_gb=1,
                     owner_reseller_id=SHOP, is_active=True, is_trial=True),
                UserService(id=RENEWABLE, bot_user_id=10, pg_username="renew_me", shop_id=SHOP, pg_user_id=77,
                            plan_id=SHOP_PLAN),
            ])
            await session.commit()
            await ensure_member(session, 10, OTHER_SHOP)
            await session.commit()
            for shop in (None, SHOP, OTHER_SHOP):
                for key, value in PAY_SETTINGS.items():
                    await set_setting(session, key, value, reseller_id=shop)
        clear_settings_cache()
        self.bot = FakeBot()
        self.auto_approve = "0"
        self.notify_pending = AsyncMock()

        async def delivered(_session, order, *_a, **_k):
            order.status = OrderStatus.DELIVERED.value
            await _session.commit()
            return order

        async def get_setting(_session, key, default="", **_kwargs):
            return self.auto_approve if key == "auto_approve_payments" else default

        for p in (
            patch("app.services.orders._assert_plan_volume_available", AsyncMock()),
            patch("app.services.orders.fulfill_paid_order", AsyncMock(side_effect=delivered)),
            patch("app.api.miniapp_order_payments.open_notify_bot_for_user",
                  AsyncMock(side_effect=lambda *a, **k: (self.bot, False))),
            patch("app.services.receipts.download_receipt_sha256", AsyncMock(return_value=None)),
            patch("app.services.receipts.notify_pending_approval", self.notify_pending),
            patch("app.services.receipts.notify_auto_approve", AsyncMock()),
            patch("app.services.receipts.notify_new_subscription", AsyncMock()),
            patch("app.services.receipts.send_delivery_to_user", AsyncMock()),
            patch("app.services.receipts.get_setting", AsyncMock(side_effect=get_setting)),
        ):
            p.start()
            self.patches.append(p)

    def register_extra_routes(self, app, get_db) -> None:
        register_miniapp_order_payments(app, get_db=get_db)

    def headers(self, *, key: str | None = KEY, token: str = SHOP_TOKEN, telegram_id: int = CUSTOMER) -> dict:
        out = {"X-Telegram-Init-Data": signed(token, telegram_id)}
        if key:
            out["X-Mini-Shop"] = key
        return out

    async def pay(self, **body) -> httpx.Response:
        who = {k: body.pop(k) for k in ("key", "token", "telegram_id") if k in body}
        payload = {"plan_id": SHOP_PLAN, "price": 5_000, "method": "card", "dest_id": "c2",
                   "request_key": new_key(), "order_id": None, **body}
        return await self.client.post("/api/mini/order/pay", json=payload, headers=self.headers(**who))

    async def upload(self, payment_id: int, data: bytes = JPEG, **who) -> httpx.Response:
        headers = {**self.headers(**who), "Content-Type": "image/jpeg"}
        return await self.client.post(f"/api/mini/order/payments/{payment_id}/receipt", content=data, headers=headers)

    async def status(self, payment_id: int, **who) -> httpx.Response:
        return await self.client.get(f"/api/mini/order/payments/{payment_id}", headers=self.headers(**who))

    async def rows(self, model) -> list:
        async with self.Session() as session:
            return list(await session.scalars(select(model).order_by(model.id)))

    async def count(self, model) -> int:
        async with self.Session() as session:
            return int(await session.scalar(select(func.count()).select_from(model)))


class PayMethodsTests(OrderPaymentFixture):
    async def test_lists_the_shops_methods_outside_the_bot_without_card_numbers(self) -> None:
        response = await self.client.get("/api/mini/pay/methods", headers=self.headers())
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertTrue(body["wallet_pay_enabled"])
        self.assertEqual([m["id"] for m in body["methods"]], ["card", "crypto"], "bot-only methods stay in the bot")
        card = body["methods"][0]
        self.assertEqual([d["id"] for d in card["destinations"]], ["c1", "c2"])
        self.assertNotIn("6037991111111111", response.text)
        self.assertEqual(response.headers["cache-control"], "no-store, private")

    async def test_follows_the_shops_own_switches(self) -> None:
        async with self.Session() as session:
            await set_setting(session, "pay_card_enabled", "0", reseller_id=SHOP)
            await set_setting(session, "pay_wallet_enabled", "0", reseller_id=SHOP)
        clear_settings_cache()
        body = (await self.client.get("/api/mini/pay/methods", headers=self.headers())).json()
        self.assertFalse(body["wallet_pay_enabled"])
        self.assertEqual([m["id"] for m in body["methods"]], ["crypto"])
        platform = (await self.client.get("/api/mini/pay/methods", headers=self.headers(key=None, token=MAIN_TOKEN))).json()
        self.assertEqual([m["id"] for m in platform["methods"]], ["card", "crypto"])

    async def test_card_auto_without_its_secret_is_not_offered(self) -> None:
        async with self.Session() as session:
            await set_setting(session, "pay_card_auto_enabled", "1", reseller_id=SHOP)
        clear_settings_cache()
        body = (await self.client.get("/api/mini/pay/methods", headers=self.headers())).json()
        self.assertEqual([m["id"] for m in body["methods"]], ["crypto"])
        self.assertEqual((await self.pay()).status_code, 400)
        self.assertEqual(await self.count(Order), 0)


class PlanPaymentTests(OrderPaymentFixture):
    async def test_card_payment_opens_one_shop_order_awaiting_its_receipt(self) -> None:
        response = await self.pay()
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        payment = body["payment"]
        self.assertEqual(
            (payment["method"], payment["amount"], payment["card_number"], payment["holder"], payment["needs_receipt"]),
            ("card", 5_000, "6037992222222222", "Shop Two", True),
        )
        [order] = await self.rows(Order)
        [row] = await self.rows(Payment)
        self.assertEqual((order.id, order.reseller_id, order.user_id, order.status), (body["order_id"], SHOP, 10, "awaiting_receipt"))
        self.assertEqual((row.id, row.order_id, row.status, row.method, row.amount), (payment["id"], order.id, "pending", "card", 5_000))

    async def test_the_same_request_key_returns_the_same_order_and_payment(self) -> None:
        key = new_key()
        first = await self.pay(request_key=key)
        again = await self.pay(request_key=key)
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(again.json(), first.json())
        self.assertEqual((await self.count(Order), await self.count(Payment)), (1, 1))
        self.assertEqual((await self.rows(Payment))[0].status, "pending", "a repeat never replaces the payment")

    async def test_same_key_with_another_method_is_refused(self) -> None:
        key = new_key()
        self.assertEqual((await self.pay(request_key=key)).status_code, 200)
        clash = await self.pay(request_key=key, method="crypto", dest_id=None)
        self.assertEqual(clash.status_code, 409)
        self.assertEqual(await self.count(Payment), 1)

    async def test_price_mismatch_creates_nothing(self) -> None:
        response = await self.pay(price=4_000)
        self.assertEqual(response.status_code, 400)
        self.assertIn("قیمت", response.json()["detail"])
        self.assertEqual((await self.count(Order), await self.count(Payment)), (0, 0))

    async def test_invalid_methods_destinations_keys_and_plans_are_refused(self) -> None:
        cases = [
            {"method": "wallet"}, {"method": "bbc"}, {"method": "stars"}, {"method": ["card"]},
            {"dest_id": "c9"}, {"dest_id": 5}, {"dest_id": "../../x"}, {"dest_id": None},
            {"request_key": "short"}, {"request_key": None}, {"request_key": "g" * 32},
            {"plan_id": PLATFORM_PLAN, "price": 3_000}, {"plan_id": OTHER_SHOP_PLAN, "price": 1_000},
            {"plan_id": SHOP_TRIAL, "price": 0}, {"plan_id": True}, {"plan_id": "51"}, {"price": 5000.0},
            {"price": -1}, {"order_id": 0},
        ]
        for extra in cases:
            with self.subTest(extra=extra):
                self.assertEqual((await self.pay(**extra)).status_code, 400)
        async with self.Session() as session:
            await set_setting(session, "pay_crypto_enabled", "0", reseller_id=SHOP)
        clear_settings_cache()
        self.assertEqual((await self.pay(method="crypto", dest_id=None)).status_code, 400)
        self.assertEqual((await self.count(Order), await self.count(Payment)), (0, 0))

    async def test_open_unpaid_payments_are_limited_per_customer(self) -> None:
        for _ in range(3):
            self.assertEqual((await self.pay()).status_code, 200)
        self.assertEqual((await self.pay()).status_code, 400)
        self.assertEqual((await self.pay(telegram_id=SECOND_CUSTOMER)).status_code, 200, "the limit is per customer")

    async def test_concurrent_requests_cannot_open_more_than_the_limit(self) -> None:
        responses = await asyncio.gather(*(self.pay() for _ in range(6)))
        self.assertEqual(sorted(r.status_code for r in responses), [200, 200, 200, 400, 400, 400])
        self.assertEqual(await self.count(Payment), 3)

    async def test_another_customer_cannot_take_over_a_request_key(self) -> None:
        key = new_key()
        mine = await self.pay(request_key=key)
        theirs = await self.pay(request_key=key, telegram_id=SECOND_CUSTOMER)
        self.assertEqual(theirs.status_code, 409)
        orders = await self.rows(Order)
        self.assertEqual([(o.user_id, o.status) for o in orders], [(10, "awaiting_receipt"), (11, "cancelled")])
        self.assertEqual([p.order_id for p in await self.rows(Payment)], [mine.json()["order_id"]])

    async def test_crypto_payment_returns_the_shops_wallet(self) -> None:
        payment = (await self.pay(method="crypto", dest_id=None)).json()["payment"]
        self.assertEqual((payment["asset"], payment["network"], payment["address"]), ("USDT", "TRC20", "TXaddress000001"))
        self.assertTrue(payment["needs_receipt"])

    async def test_platform_mini_app_pays_platform_orders_only(self) -> None:
        response = await self.pay(plan_id=PLATFORM_PLAN, price=3_000, key=None, token=MAIN_TOKEN)
        self.assertEqual(response.status_code, 200, response.text)
        [order] = await self.rows(Order)
        self.assertIsNone(order.reseller_id)
        shop_plan = await self.pay(key=None, token=MAIN_TOKEN)
        self.assertEqual(shop_plan.status_code, 400, "the platform Mini App cannot sell a shop plan")


class ConcurrentPaymentTests(OrderPaymentFixture):
    """Two requests at once need two real connections, so this case uses a database file."""

    async def asyncSetUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        url = f"sqlite+aiosqlite:///{Path(self.tmp.name) / 'pay.db'}"
        with patch("tests.test_miniapp_shop_readonly.create_async_engine",
                   lambda _url: create_async_engine(url, connect_args={"timeout": 30})):
            await super().asyncSetUp()

    async def asyncTearDown(self) -> None:
        await super().asyncTearDown()
        self.tmp.cleanup()

    async def test_concurrent_double_tap_opens_one_payment(self) -> None:
        key = new_key()
        first, second = await asyncio.gather(self.pay(request_key=key), self.pay(request_key=key))
        self.assertEqual({first.status_code, second.status_code}, {200}, (first.text, second.text))
        self.assertEqual(first.json(), second.json())
        live = [o for o in await self.rows(Order) if o.status != "cancelled"]
        self.assertEqual(len(live), 1)
        self.assertEqual([p.order_id for p in await self.rows(Payment)], [live[0].id])


class CheckoutOrderPaymentTests(OrderPaymentFixture):
    async def checkout_order(self, *, user_id: int = 10, amount: int = 4_000, shop: int | None = SHOP) -> int:
        async with self.Session() as session:
            order = Order(user_id=user_id, plan_id=SHOP_PLAN, reseller_id=shop, amount=amount, discount_amount=1_000,
                          discount_code="OFF", status="pending")
            session.add(order)
            await session.commit()
            return int(order.id)

    async def test_pays_the_discounted_checkout_order(self) -> None:
        order_id = await self.checkout_order()
        response = await self.pay(order_id=order_id, price=4_000)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual((response.json()["order_id"], response.json()["payment"]["amount"]), (order_id, 4_000))
        self.assertEqual(await self.count(Order), 1, "no second order is created")

    async def test_checkout_order_checks_price_owner_and_shop(self) -> None:
        mine = await self.checkout_order()
        self.assertEqual((await self.pay(order_id=mine, price=5_000)).status_code, 400)
        other_customer = await self.checkout_order(user_id=11)
        self.assertEqual((await self.pay(order_id=other_customer, price=4_000)).status_code, 404)
        platform = await self.checkout_order(shop=None)
        self.assertEqual((await self.pay(order_id=platform, price=4_000)).status_code, 404)
        self.assertEqual((await self.pay(order_id=999_999, price=4_000)).status_code, 404)
        self.assertEqual(await self.count(Payment), 0)

    async def test_a_key_left_by_a_start_that_failed_does_not_lock_the_order(self) -> None:
        from app.services.miniapp_order_payments import BUY_KEY_PREFIX

        order_id = await self.checkout_order()
        async with self.Session() as session:
            order = await session.get(Order, order_id)
            # An earlier start wrote its key, then failed before any payment was opened.
            order.renewal_request_key = BUY_KEY_PREFIX + new_key()
            await session.commit()
        response = await self.pay(order_id=order_id, price=4_000)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(await self.count(Payment), 1)

    async def test_a_second_key_cannot_open_another_payment_on_the_order(self) -> None:
        order_id = await self.checkout_order()
        self.assertEqual((await self.pay(order_id=order_id, price=4_000)).status_code, 200)
        self.assertEqual((await self.pay(order_id=order_id, price=4_000)).status_code, 409)
        self.assertEqual(await self.count(Payment), 1)


class RenewalPaymentTests(OrderPaymentFixture):
    async def renew(self, key: str | None = None, **body) -> httpx.Response:
        async with self.Session() as session:
            terms = renewal_terms(await session.get(Plan, SHOP_PLAN))
        payload = {
            "service_id": RENEWABLE, "plan_id": SHOP_PLAN, "method": "card", "dest_id": "c1",
            "preview": {"terms": terms, "price": 5_000, "request_key": key or new_key()}, **body,
        }
        return await self.client.post("/api/mini/renew/pay", json=payload, headers=self.headers())

    async def test_renewal_by_card_opens_one_renewal_order(self) -> None:
        key = new_key()
        first = await self.renew(key)
        self.assertEqual(first.status_code, 200, first.text)
        again = await self.renew(key)
        self.assertEqual(again.json(), first.json())
        [order] = await self.rows(Order)
        self.assertEqual((order.service_id, order.reseller_id, order.renewal_request_key, order.status),
                         (RENEWABLE, SHOP, key, "awaiting_receipt"))
        self.assertEqual(await self.count(Payment), 1)

    async def test_renewal_refuses_foreign_services_and_changed_previews(self) -> None:
        for service_id in (101, 102, 103, 999):
            with self.subTest(service_id=service_id):
                self.assertIn((await self.renew(service_id=service_id)).status_code, (400, 404))
        stale = await self.renew(preview={"terms": {"version": 1}, "price": 5_000, "request_key": new_key()})
        self.assertEqual(stale.status_code, 400)
        cheap = await self.renew(preview={"terms": None, "price": 1, "request_key": new_key()})
        self.assertEqual(cheap.status_code, 400)
        self.assertEqual(await self.count(Order), 0)


class ReceiptAndStatusTests(OrderPaymentFixture):
    async def started(self) -> dict:
        return (await self.pay()).json()

    async def test_receipt_goes_to_review_and_status_follows(self) -> None:
        started = await self.started()
        payment_id = started["payment"]["id"]
        before = (await self.status(payment_id)).json()
        self.assertEqual((before["status"], before["order_id"], before["amount"], before["paid_at"]),
                         ("waiting_receipt", started["order_id"], 5_000, None))
        response = await self.upload(payment_id)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["status"], "review")
        self.assertEqual(self.bot.sent, [CUSTOMER])
        self.notify_pending.assert_awaited_once()
        self.assertEqual((await self.status(payment_id)).json()["status"], "review")
        [order] = await self.rows(Order)
        self.assertEqual(order.status, "awaiting_approval")

    async def test_second_receipt_is_refused(self) -> None:
        payment_id = (await self.started())["payment"]["id"]
        self.assertEqual((await self.upload(payment_id)).status_code, 200)
        self.assertEqual((await self.upload(payment_id)).status_code, 400)
        self.assertEqual(len(self.bot.sent), 1)

    async def test_auto_approved_receipt_is_delivered(self) -> None:
        self.auto_approve = "1"
        payment_id = (await self.started())["payment"]["id"]
        response = await self.upload(payment_id)
        self.assertEqual(response.json()["status"], "delivered", response.text)
        status = (await self.status(payment_id)).json()
        self.assertEqual(status["status"], "delivered")
        self.assertIsNotNone(status["paid_at"])

    async def test_someone_elses_payment_is_not_found(self) -> None:
        payment_id = (await self.started())["payment"]["id"]
        callers = (
            {"telegram_id": SECOND_CUSTOMER},
            {"key": None, "token": MAIN_TOKEN},
            {"key": OTHER_KEY, "token": OTHER_SHOP_TOKEN},
        )
        for who in callers:
            with self.subTest(who=who):
                self.assertEqual((await self.status(payment_id, **who)).status_code, 404)
                self.assertEqual((await self.upload(payment_id, **who)).status_code, 404)
        self.assertEqual(self.bot.sent, [])
        self.assertIsNone((await self.rows(Payment))[0].receipt_file_id)

    async def test_wallet_top_ups_and_unknown_ids_are_not_order_payments(self) -> None:
        async with self.Session() as session:
            session.add(Payment(id=90, user_id=10, amount=5_000, method="card", status="pending",
                                is_wallet_topup=True, wallet_shop_id=SHOP))
            await session.commit()
        for payment_id in (90, 999_999):
            with self.subTest(payment_id=payment_id):
                self.assertEqual((await self.status(payment_id)).status_code, 404)
                self.assertEqual((await self.upload(payment_id)).status_code, 404)

    async def test_only_real_images_are_accepted(self) -> None:
        payment_id = (await self.started())["payment"]["id"]
        for data in (b"", b"GIF89a....", b"<svg onload=alert(1)>"):
            with self.subTest(data=data[:8]):
                self.assertEqual((await self.upload(payment_id, data)).status_code, 400)
        self.assertEqual(self.bot.sent, [])
