"""The shop owner's wallet, credit and charges pages: owner only, own purse only, own rows only."""

from __future__ import annotations

import secrets
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, patch


import httpx
from fastapi import FastAPI
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.api import spa_pages
from app.api.reseller_finance_pages import (
    CHARGES_PAGE_SIZE,
    TOPUP_REPEATED,
    register_reseller_finance_pages,
)
from app.db.models import Base, BotUser, CreditStatement, Payment, ResellerCharge, ResellerProfile
from app.services.payment_destinations import dump_payment_cards
from app.services.payment_settlement import PspCheckOutcome
from app.services.wallet_topup import RECEIPT_MAX_BYTES, TopupError, TopupStart
from tests.pgtest import pg_engine

OWNER = {"role": "reseller", "bot_user_id": 5}
OTHER_OWNER = {"role": "reseller", "bot_user_id": 6}
NOW = datetime(2026, 11, 8, tzinfo=timezone.utc)
API = "/api/panel/my-subscription"
PAGES = ("wallet", "credit", "charges")
JPEG = b"\xff\xd8\xff"


class FinancePagesCase(unittest.IsolatedAsyncioTestCase):
    staff: dict = OWNER

    async def asyncSetUp(self) -> None:
        # Keys are claimed process-wide, so each test submits its own.
        self.request_key = secrets.token_hex(16)
        self.engine = pg_engine()
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        self.Session = async_sessionmaker(self.engine, expire_on_commit=False)
        async with self.Session() as session:
            session.add_all([
                BotUser(id=5, telegram_id=55, referral_code="a", role="reseller", wallet_balance=-3_000),
                BotUser(id=6, telegram_id=66, referral_code="b", role="reseller", wallet_balance=777_000),
                BotUser(id=7, telegram_id=77, referral_code="c", role="user"),
                ResellerProfile(id=1, user_id=5, billing_mode="payg"),
                ResellerProfile(id=2, user_id=6, billing_mode="payg"),
                CreditStatement(shop_id=5, period_start=NOW, period_end=NOW, amount_due=3_000, charges_total=4_000, due_at=NOW),
                CreditStatement(shop_id=6, period_start=NOW, period_end=NOW, amount_due=999_999, due_at=NOW),
                Payment(id=40, user_id=5, amount=50_000, method="card", is_wallet_topup=True),
                Payment(id=41, user_id=6, amount=123_456, method="card", is_wallet_topup=True),
                Payment(id=42, user_id=5, amount=88_000, method="card", is_wallet_topup=True, wallet_shop_id=6),
            ])
            for n in range(CHARGES_PAGE_SIZE + 3):
                session.add(ResellerCharge(shop_id=5, event="create", status="settled", request_key=f"order:{n:04d}",
                                           attempt=1, quantity=1, pg_username=f"mine{n}", amount=1_000,
                                           idempotency_key=f"payg:5:order:{n:04d}#1"))
            session.add(ResellerCharge(shop_id=6, event="create", status="settled", request_key="order:9999",
                                       attempt=1, quantity=1, pg_username="theirs", amount=1_000,
                                       idempotency_key="payg:6:order:9999#1"))
            await session.commit()

        app = FastAPI()

        async def get_db():
            async with self.Session() as session:
                yield session

        async def require_staff() -> dict:
            return dict(self.staff)

        register_reseller_finance_pages(app, require_staff=require_staff, get_db=get_db)
        self.spa = tempfile.TemporaryDirectory()
        for page in PAGES:
            folder = Path(self.spa.name) / "my-subscription" / page
            folder.mkdir(parents=True)
            (folder / "index.html").write_text(f"<html>my-{page}</html>", encoding="utf-8")
        patches = [
            patch.object(spa_pages, "SPA_DIR", Path(self.spa.name)),
            patch("app.api.reseller_finance_pages.get_all_settings", AsyncMock(return_value={})),
        ]
        for started in patches:
            started.start()
            self.addCleanup(started.stop)
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")

    async def asyncTearDown(self) -> None:
        await self.client.aclose()
        self.spa.cleanup()
        await self.engine.dispose()

    async def topup_count(self) -> int:
        async with self.Session() as session:
            return int(await session.scalar(select(func.count()).select_from(Payment)))


class OwnerTests(FinancePagesCase):
    async def test_pages_serve_the_react_shell_to_the_owner(self) -> None:
        for page in PAGES:
            response = await self.client.get(f"/my-subscription/{page}")
            self.assertEqual(response.status_code, 200, page)
            self.assertIn(f"my-{page}", response.text)

    async def test_wallet_data_is_the_owners_own_purse(self) -> None:
        data = (await self.client.get(f"{API}/wallet")).json()
        self.assertEqual(data["balance"], -3_000)
        self.assertEqual(data["credit"]["used"], 3_000)
        self.assertEqual([row["id"] for row in data["recent"]], [40])  # not 41 (another user) or 42 (a shop purse)
        self.assertEqual(data["options"]["methods"], [])
        self.assertRegex(data["request_key"], r"^[0-9a-f]{32}$")
        self.assertNotEqual(data["request_key"], (await self.client.get(f"{API}/wallet")).json()["request_key"])

    async def test_credit_data_lists_only_own_statements(self) -> None:
        data = (await self.client.get(f"{API}/credit")).json()
        self.assertEqual([row["amount_due"] for row in data["statements"]], [3_000])
        self.assertEqual(data["statements"][0]["period"], "2026-11")
        self.assertNotIn("999999", str(data))

    async def test_charges_data_pages_by_id_and_hides_other_shops(self) -> None:
        first = (await self.client.get(f"{API}/charges")).json()
        self.assertEqual(len(first["charges"]), CHARGES_PAGE_SIZE)
        self.assertTrue(first["is_payg"])
        self.assertNotIn("theirs", str(first))
        self.assertIsNotNone(first["next_before"])
        second = (await self.client.get(f"{API}/charges", params={"before": first["next_before"]})).json()
        self.assertEqual(len(second["charges"]), 3)
        self.assertIsNone(second["next_before"])
        self.assertNotIn("theirs", str(second))
        seen = {row["id"] for row in first["charges"]} | {row["id"] for row in second["charges"]}
        self.assertEqual(len(seen), CHARGES_PAGE_SIZE + 3)

    async def test_bad_page_cursor_falls_back_to_the_first_page(self) -> None:
        for before in ("abc", "-4", "0", "99999999999"):
            with self.subTest(before=before):
                data = (await self.client.get(f"{API}/charges", params={"before": before})).json()
                self.assertEqual(len(data["charges"]), CHARGES_PAGE_SIZE)

    async def test_top_up_goes_to_the_owners_platform_purse(self) -> None:
        start = AsyncMock(return_value=TopupStart(payment_id=7, method="card", amount=50_000, needs_receipt=True,
                                                  card_number="6037-0000"))
        with patch("app.api.reseller_finance_pages.start_topup", start):
            response = await self.client.post("/my-subscription/wallet/topup", json={
                "amount": "۵۰٬۰۰۰", "method": "card", "request_key": self.request_key, "user_id": 6, "shop_id": 6,
            })
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["ok"])
        self.assertEqual(body["topup"]["card_number"], "6037-0000")
        self.assertEqual(body["topup"]["payment_id"], 7)
        kwargs = start.await_args.kwargs
        self.assertEqual((kwargs["user_id"], kwargs["shop_id"], kwargs["amount"]), (5, None, 50_000))

    async def test_refused_top_up_shows_a_safe_message_and_can_be_resent(self) -> None:
        refusal = AsyncMock(side_effect=TopupError("مبلغ کم است"))
        with patch("app.api.reseller_finance_pages.start_topup", refusal):
            response = await self.client.post("/my-subscription/wallet/topup",
                                              json={"amount": "1", "method": "card", "request_key": self.request_key})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), {"ok": False, "message": "مبلغ کم است"})
        # Nothing was created, so the same form may be corrected and sent again with its key.
        start = AsyncMock(return_value=TopupStart(payment_id=8, method="card", amount=50_000, needs_receipt=True))
        with patch("app.api.reseller_finance_pages.start_topup", start):
            again = await self.client.post("/my-subscription/wallet/topup",
                                           json={"amount": 50_000, "method": "card", "request_key": self.request_key})
        self.assertEqual(again.status_code, 200)

    async def test_internal_error_text_never_reaches_the_owner(self) -> None:
        broken = AsyncMock(side_effect=ValueError("sqlalchemy.exc.OperationalError: no such table"))
        with patch("app.api.reseller_finance_pages.start_topup", broken):
            response = await self.client.post("/my-subscription/wallet/topup",
                                              json={"amount": 50_000, "method": "card", "request_key": self.request_key})
        self.assertEqual(response.status_code, 400)
        self.assertNotIn("sqlalchemy", response.text)

    async def test_repeated_top_up_post_creates_one_payment(self) -> None:
        """A double click or a retried request carries the same key and must not open a second payment."""
        ui = {"pay_card_enabled": "1", "payment_cards": dump_payment_cards([{"number": "6037991234567890", "holder": "x"}])}
        before = await self.topup_count()
        body = {"amount": 50_000, "method": "card", "request_key": self.request_key}
        with patch("app.api.reseller_finance_pages.get_all_settings", AsyncMock(return_value=ui)):
            first = await self.client.post("/my-subscription/wallet/topup", json=body)
            second = await self.client.post("/my-subscription/wallet/topup", json=body)
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual((second.status_code, second.json()["message"]), (400, TOPUP_REPEATED))
        self.assertEqual(await self.topup_count(), before + 1)

    async def test_top_up_without_a_valid_key_starts_nothing(self) -> None:
        start = AsyncMock()
        with patch("app.api.reseller_finance_pages.start_topup", start):
            for key in ("", "short", "bad key with spaces!!!!!", "x" * 65):
                with self.subTest(key=key):
                    response = await self.client.post("/my-subscription/wallet/topup",
                                                      json={"amount": 50_000, "method": "card", "request_key": key})
                    self.assertIn(response.status_code, (400, 422))
        start.assert_not_awaited()

    async def test_the_same_key_from_another_shop_is_a_different_request(self) -> None:
        start = AsyncMock(return_value=TopupStart(payment_id=9, method="card", amount=50_000, needs_receipt=True))
        body = {"amount": 50_000, "method": "card", "request_key": "s" * 32}
        with patch("app.api.reseller_finance_pages.start_topup", start):
            self.assertEqual((await self.client.post("/my-subscription/wallet/topup", json=body)).status_code, 200)
            self.staff = OTHER_OWNER
            self.assertEqual((await self.client.post("/my-subscription/wallet/topup", json=body)).status_code, 200)
        self.assertEqual([call.kwargs["user_id"] for call in start.await_args_list], [5, 6])

    async def test_receipt_is_bound_to_the_owner_and_capped(self) -> None:
        submit = AsyncMock(return_value=type("R", (), {"status": "ok", "message": "رسید ثبت شد"})())
        bot = type("B", (), {"session": type("S", (), {"close": AsyncMock()})()})()
        with patch("app.api.reseller_finance_pages.submit_topup_receipt", submit), \
                patch("app.api.reseller_finance_pages.open_notify_bot_for_user", AsyncMock(return_value=(bot, True))):
            big = await self.client.post("/my-subscription/wallet/topup/7/receipt",
                                         files={"receipt": ("r.jpg", b"x" * (RECEIPT_MAX_BYTES + 1), "image/jpeg")})
            self.assertIn("err=", big.headers["location"])
            submit.assert_not_awaited()
            ok = await self.client.post("/my-subscription/wallet/topup/7/receipt",
                                        files={"receipt": ("r.jpg", JPEG, "image/jpeg")})
        self.assertIn("ok=", ok.headers["location"])
        kwargs = submit.await_args.kwargs
        self.assertEqual((kwargs["user_id"], kwargs["shop_id"], kwargs["telegram_id"], kwargs["payment_id"]),
                         (5, None, 55, 7))

    async def test_gateway_check_is_the_owners_own_and_throttled(self) -> None:
        check = AsyncMock(return_value=PspCheckOutcome.PENDING)
        with patch("app.api.reseller_finance_pages.check_psp_payment", check):
            first = await self.client.post("/my-subscription/wallet/check", data={"settlement_id": "501"})
            again = await self.client.post("/my-subscription/wallet/check", data={"settlement_id": "501"})
            bad = await self.client.post("/my-subscription/wallet/check", data={"settlement_id": "abc"})
        self.assertIn("ok=", first.headers["location"])
        self.assertIn("err=", again.headers["location"])
        self.assertIn("err=", bad.headers["location"])
        check.assert_awaited_once()
        kwargs = check.await_args.kwargs
        self.assertEqual((kwargs["settlement_id"], kwargs["user_id"], kwargs["shop_id"]), (501, 5, None))


class OtherOwnerTests(FinancePagesCase):
    staff = OTHER_OWNER

    async def test_another_shop_owner_reads_only_their_own_money(self) -> None:
        wallet = (await self.client.get(f"{API}/wallet")).json()
        self.assertEqual(wallet["balance"], 777_000)
        self.assertEqual([row["id"] for row in wallet["recent"]], [41])
        credit = (await self.client.get(f"{API}/credit")).json()
        self.assertEqual([row["amount_due"] for row in credit["statements"]], [999_999])
        charges = (await self.client.get(f"{API}/charges")).json()
        self.assertEqual([row["pg_username"] for row in charges["charges"]], ["theirs"])
        self.assertNotIn("mine", str(charges))

    async def test_a_receipt_cannot_be_attached_to_another_owners_top_up(self) -> None:
        bot = type("B", (), {"session": type("S", (), {"close": AsyncMock()})(), "send_photo": AsyncMock()})()
        with patch("app.api.reseller_finance_pages.open_notify_bot_for_user", AsyncMock(return_value=(bot, True))):
            response = await self.client.post("/my-subscription/wallet/topup/40/receipt",
                                              files={"receipt": ("r.jpg", JPEG, "image/jpeg")})
        self.assertIn("err=", response.headers["location"])
        bot.send_photo.assert_not_awaited()
        async with self.Session() as session:
            payment = await session.get(Payment, 40)
        self.assertIsNone(payment.receipt_file_id)


class NotOwnerTests(FinancePagesCase):
    async def test_staff_admin_and_the_platform_owner_cannot_read_a_shops_money(self) -> None:
        roles = (
            {"role": "principal", "bot_user_id": 5},  # shop staff signed in on the owner's account id
            {"role": "staff", "bot_user_id": 5},
            {"role": "admin", "bot_user_id": 5},
            {"role": "owner", "bot_user_id": 5},  # the platform owner
            {"role": "admin"},
            {"role": "reseller"},  # no account behind the session
            {"role": "reseller", "bot_user_id": 7},  # an account without a shop
        )
        for staff in roles:
            self.staff = staff
            for page in PAGES:
                with self.subTest(staff=staff, page=page):
                    self.assertEqual((await self.client.get(f"/my-subscription/{page}")).status_code, 403)
                    response = await self.client.get(f"{API}/{page}")
                    self.assertEqual(response.status_code, 403)
                    self.assertNotIn("mine", response.text)
            with self.subTest(staff=staff, action="topup"):
                response = await self.client.post("/my-subscription/wallet/topup", json={
                    "amount": 50_000, "method": "card", "request_key": self.request_key})
                self.assertEqual(response.status_code, 403)
            with self.subTest(staff=staff, action="receipt"):
                response = await self.client.post("/my-subscription/wallet/topup/40/receipt",
                                                  files={"receipt": ("r.jpg", JPEG, "image/jpeg")})
                self.assertEqual(response.status_code, 403)
            with self.subTest(staff=staff, action="check"):
                self.assertEqual((await self.client.post("/my-subscription/wallet/check", data={"settlement_id": "1"})).status_code, 403)
        self.assertEqual(await self.topup_count(), 3)


if __name__ == "__main__":
    unittest.main()
