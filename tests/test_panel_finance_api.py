"""JSON data of the React finance hub: permissions, shop isolation, no secrets, bounded lists."""

from __future__ import annotations

import json
import tempfile
import unittest
from collections.abc import AsyncIterator, Callable
from pathlib import Path
from typing import Any
from unittest.mock import patch

import httpx
from fastapi import FastAPI, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.api import spa_pages
from app.api.finance_pages import register_finance_pages
from app.api.panel_finance_api import register_panel_finance_api
from app.db.models import (
    Base,
    BotUser,
    DeliveryFailure,
    Order,
    Payment,
    Plan,
    ResellerSetting,
    ServiceAutomation,
    ServiceCancellation,
    Setting,
    UserService,
)
from app.services.authz import authz_from_staff, can_shop
from app.services.list_query import DEFAULT_LIST_PAGE_SIZE
from tests.pgtest import pg_engine

OWNER = {"role": "admin", "org_principal_id": 1, "org_depth": 0, "org_parent_id": None, "org_status": "active", "permissions": []}
SHOP_A, SHOP_B = 10, 20
RECEIPT_SECRET = "RECEIPT-FILE-ID-SECRET"
PLATFORM_CARD = "6037000000000001"
SHOP_A_CARD = "6104000000000002"
BBC_SECRET = "BBC-KEY-SECRET"
PSP_SECRET = "PSP-MERCHANT-SECRET"
WEBHOOK_SECRET = "WEBHOOK-SECRET-VALUE-123"


def shop_staff(shop_id: int | None, permissions: list[str] | None = None, **extra: Any) -> dict[str, Any]:
    perms = ["orders", "payments", "shop_settings"] if permissions is None else permissions
    return {"role": "reseller", "bot_user_id": shop_id, "permissions": perms, **extra}


class FinanceApiCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.engine = pg_engine()
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        self.session = async_sessionmaker(self.engine, expire_on_commit=False)()
        await self.seed()
        self.staff: dict[str, Any] = dict(OWNER)
        self.app = FastAPI()

        async def get_db() -> AsyncIterator[AsyncSession]:
            yield self.session

        async def require_staff() -> dict[str, Any]:
            return self.staff

        def require_perm(perm: str) -> Callable[..., Any]:
            async def dependency() -> dict[str, Any]:
                if not can_shop(authz_from_staff(self.staff), perm):
                    raise HTTPException(403)
                return self.staff

            return dependency

        register_panel_finance_api(
            self.app, require_staff=require_staff, require_admin=require_staff, require_perm=require_perm,
            require_pg_perm=require_perm, get_db=get_db,
        )
        register_finance_pages(self.app, render=lambda *a, **k: None, require_staff=require_staff, get_db=get_db)
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://panel.test", follow_redirects=False)

    async def asyncTearDown(self) -> None:
        await self.client.aclose()
        await self.session.close()
        await self.engine.dispose()

    async def seed(self) -> None:
        s = self.session
        s.add_all([
            BotUser(id=SHOP_A, telegram_id=5010, referral_code="shopa", role="reseller"),
            BotUser(id=SHOP_B, telegram_id=5020, referral_code="shopb", role="reseller"),
            Plan(id=1, name="Monthly", price=100, duration_days=30, data_limit_gb=50),
        ])
        await s.flush()
        s.add_all([
            BotUser(id=1, telegram_id=9001, referral_code="c1", full_name="Platform buyer", username="pbuyer"),
            BotUser(id=11, telegram_id=9011, referral_code="c11", full_name="Shop A buyer", reseller_id=SHOP_A),
            BotUser(id=21, telegram_id=9021, referral_code="c21", full_name="Shop B buyer", reseller_id=SHOP_B),
        ])
        await s.flush()
        s.add_all([
            Order(id=100, user_id=1, plan_id=1, amount=1000, status="delivered", payment_method="card"),
            Order(id=101, user_id=1, plan_id=1, amount=2000, status="paid", payment_method="card"),
            Order(id=110, user_id=11, plan_id=1, amount=3000, status="awaiting_approval", payment_method="card", reseller_id=SHOP_A),
            Order(id=111, user_id=11, plan_id=1, amount=3000, status="awaiting_approval", payment_method="card", reseller_id=SHOP_A),
            Order(id=120, user_id=21, plan_id=1, amount=3000, status="awaiting_approval", payment_method="card", reseller_id=SHOP_B),
        ])
        await s.flush()
        s.add_all([
            Payment(id=1, order_id=100, user_id=1, amount=1000, method="card", status="approved"),
            Payment(id=2, order_id=110, user_id=11, amount=3000, method="card", status="pending", receipt_file_id=RECEIPT_SECRET),
            Payment(id=3, order_id=120, user_id=21, amount=3000, method="card", status="pending", receipt_file_id=RECEIPT_SECRET),
            Payment(id=4, user_id=1, amount=5000, method="card", status="pending", is_wallet_topup=True, wallet_shop_id=None),
            Payment(id=5, user_id=11, amount=7000, method="card", status="pending", is_wallet_topup=True, wallet_shop_id=SHOP_A),
            Payment(id=6, order_id=111, user_id=11, amount=3000, method="card", status="pending", receipt_file_id=RECEIPT_SECRET),
        ])
        s.add_all([
            DeliveryFailure(order_id=101, reseller_id=None, error="platform telegram failed", attempts=3),
            DeliveryFailure(order_id=120, reseller_id=SHOP_B, error="shop b failure", attempts=1),
            UserService(id=1, bot_user_id=11, plan_id=1, pg_username="svc_a", shop_id=SHOP_A),
            UserService(id=2, bot_user_id=21, plan_id=1, pg_username="svc_b", shop_id=SHOP_B),
        ])
        await s.flush()
        s.add_all([
            ServiceCancellation(service_id=1, user_id=11, reseller_id=SHOP_A, reason="reason A", pg_user_id=1),
            ServiceCancellation(service_id=2, user_id=21, reseller_id=SHOP_B, reason="reason B", pg_user_id=2),
            ServiceAutomation(service_id=1, shop_id=SHOP_A, needs_review=True, pending_action="renew"),
            ServiceAutomation(service_id=2, shop_id=SHOP_B, needs_review=True, pending_action="renew"),
            Setting(key="bbc_api_key", value=BBC_SECRET),
            Setting(key="card_auto_webhook_secret", value=WEBHOOK_SECRET),
            Setting(key="payment_cards", value=json.dumps([{"id": "c1", "number": PLATFORM_CARD, "holder": "Owner", "enabled": True, "sort": 0}])),
            Setting(key="psp_gateways", value=json.dumps([{"id": "p1", "name": "Zarin", "provider": "zarinpal", "merchant_id": PSP_SECRET, "enabled": True}])),
            ResellerSetting(reseller_user_id=SHOP_A, key="payment_cards", value=json.dumps([{"id": "s1", "number": SHOP_A_CARD, "holder": "A", "enabled": True, "sort": 0}])),
            ResellerSetting(reseller_user_id=SHOP_A, key="bbc_api_key", value=BBC_SECRET + "-A"),
        ])
        await s.commit()

    async def get(self, path: str, staff: dict[str, Any] | None = None) -> httpx.Response:
        if staff is not None:
            self.staff = staff
        return await self.client.get(path)


class PermissionTests(FinanceApiCase):
    async def test_each_endpoint_needs_its_own_permission(self) -> None:
        orders_only = shop_staff(SHOP_A, ["orders"])
        payments_only = shop_staff(SHOP_A, ["payments"])
        expectations = {
            "/api/panel/finance/orders": (200, 403),
            "/api/panel/finance/delivery": (200, 403),
            "/api/panel/finance/cancellations": (200, 403),
            "/api/panel/finance/automation": (200, 403),
            "/api/panel/finance/payments": (403, 200),
            "/api/panel/finance/reports": (200, 200),
            "/api/panel/finance/settings": (403, 403),
        }
        for path, (with_orders, with_payments) in expectations.items():
            with self.subTest(path=path):
                self.assertEqual((await self.get(path, orders_only)).status_code, with_orders)
                self.assertEqual((await self.get(path, payments_only)).status_code, with_payments)

    async def test_staff_without_finance_rights_or_a_shop_are_refused_everywhere(self) -> None:
        for staff in (
            shop_staff(SHOP_A, ["tickets"]),
            {"role": "pg_staff", "permissions": ["orders", "payments"]},
            shop_staff(None),
            {"role": "admin", "permissions": []},
        ):
            for path in ("orders", "payments", "delivery", "cancellations", "automation", "reports", "settings"):
                with self.subTest(staff=staff, path=path):
                    response = await self.get(f"/api/panel/finance/{path}", staff)
                    self.assertEqual(response.status_code, 403)
        self.assertEqual((await self.get("/api/panel/finance", shop_staff(SHOP_A, ["tickets"]))).status_code, 403)

    async def test_the_overview_lists_only_the_tabs_the_staff_member_may_open(self) -> None:
        owner = (await self.get("/api/panel/finance", dict(OWNER))).json()
        self.assertEqual(owner["tabs"], ["reports", "orders", "payments", "delivery", "cancellations", "automation"])
        self.assertTrue(owner["can_settings"])
        self.assertTrue(owner["can_payg_report"])
        payments_only = (await self.get("/api/panel/finance", shop_staff(SHOP_A, ["payments"]))).json()
        self.assertEqual(payments_only["tabs"], ["reports", "payments"])
        self.assertFalse(payments_only["can_settings"])
        self.assertFalse(payments_only["can_void_payment"])
        self.assertFalse(payments_only["can_payg_report"])
        with_orders = (await self.get("/api/panel/finance", shop_staff(SHOP_A))).json()
        self.assertFalse(with_orders["can_payg_report"], "the PAYG shops report is the web Owner's only")

    async def test_a_shop_member_needs_the_void_permission_and_a_shop_to_void(self) -> None:
        voider = shop_staff(SHOP_A, ["payments", "payment_void"])
        self.assertTrue((await self.get("/api/panel/finance", voider)).json()["can_void_payment"])


class OrdersTests(FinanceApiCase):
    async def test_the_platform_sees_platform_orders_and_a_shop_only_its_own(self) -> None:
        platform = (await self.get("/api/panel/finance/orders", dict(OWNER))).json()
        self.assertEqual({row["id"] for row in platform["rows"]}, {100, 101})
        shop_a = (await self.get("/api/panel/finance/orders", shop_staff(SHOP_A))).json()
        self.assertEqual({row["id"] for row in shop_a["rows"]}, {110, 111})
        shop_b = (await self.get("/api/panel/finance/orders", shop_staff(SHOP_B))).json()
        self.assertEqual([row["id"] for row in shop_b["rows"]], [120])

    async def test_rows_carry_the_actions_and_bulk_rules_but_never_the_receipt_file(self) -> None:
        response = await self.get("/api/panel/finance/orders", shop_staff(SHOP_A))
        self.assertNotIn(RECEIPT_SECRET, response.text)
        row = next(r for r in response.json()["rows"] if r["id"] == 110)
        self.assertEqual(row["actions"], ["receipt", "approve", "reject", "cancel"])
        self.assertEqual(row["receipt_payment_id"], 2)
        self.assertEqual(row["bulk_ops"], ["approve", "reject", "cancel"])
        platform = (await self.get("/api/panel/finance/orders", dict(OWNER))).json()
        stuck = next(r for r in platform["rows"] if r["id"] == 101)
        self.assertTrue(stuck["stuck"])
        self.assertEqual(stuck["actions"], ["retry_delivery"])
        self.assertEqual(stuck["bulk_ops"], ["approve"])
        delivered = next(r for r in platform["rows"] if r["id"] == 100)
        self.assertEqual((delivered["actions"], delivered["bulk_ops"]), ([], []))

    async def test_search_finds_a_customer_inside_the_scope_only(self) -> None:
        found = (await self.get("/api/panel/finance/orders?q=pbuyer", dict(OWNER))).json()
        self.assertEqual({row["id"] for row in found["rows"]}, {100, 101})
        foreign = (await self.get("/api/panel/finance/orders?q=Shop%20B", shop_staff(SHOP_A))).json()
        self.assertEqual(foreign["rows"], [])

    async def test_a_page_is_bounded_and_an_out_of_range_page_is_clamped(self) -> None:
        self.session.add_all([Order(user_id=1, plan_id=1, amount=1, status="pending") for _ in range(DEFAULT_LIST_PAGE_SIZE + 5)])
        await self.session.commit()
        first = (await self.get("/api/panel/finance/orders", dict(OWNER))).json()
        self.assertEqual(len(first["rows"]), DEFAULT_LIST_PAGE_SIZE)
        self.assertTrue(first["pager"]["has_next"])
        last = (await self.get("/api/panel/finance/orders?page=999", dict(OWNER))).json()
        self.assertEqual(last["pager"]["page"], last["pager"]["pages"])
        self.assertLess(len(last["rows"]), DEFAULT_LIST_PAGE_SIZE)
        junk = await self.get("/api/panel/finance/orders?page=abc", dict(OWNER))
        self.assertEqual(junk.json()["pager"]["page"], 1)


class PaymentsTests(FinanceApiCase):
    async def test_the_platform_lists_platform_payments_and_never_a_shop_wallet_top_up(self) -> None:
        platform = (await self.get("/api/panel/finance/payments", dict(OWNER))).json()
        self.assertEqual({row["id"] for row in platform["rows"]}, {1, 4})

    async def test_a_shop_lists_its_own_purchase_payments_and_no_top_up(self) -> None:
        shop_a = (await self.get("/api/panel/finance/payments", shop_staff(SHOP_A))).json()
        self.assertEqual({row["id"] for row in shop_a["rows"]}, {2, 6})
        shop_b = (await self.get("/api/panel/finance/payments", shop_staff(SHOP_B))).json()
        self.assertEqual([row["id"] for row in shop_b["rows"]], [3])

    async def test_no_receipt_file_id_ever_leaves_the_server(self) -> None:
        for staff in (dict(OWNER), shop_staff(SHOP_A), shop_staff(SHOP_B)):
            response = await self.get("/api/panel/finance/payments", staff)
            self.assertNotIn(RECEIPT_SECRET, response.text)
        row = next(r for r in (await self.get("/api/panel/finance/payments", shop_staff(SHOP_A))).json()["rows"] if r["id"] == 2)
        self.assertTrue(row["has_receipt"])

    async def test_same_amount_hints_never_cross_shops(self) -> None:
        rows = (await self.get("/api/panel/finance/payments", shop_staff(SHOP_A))).json()["rows"]
        by_id = {r["id"]: r for r in rows}
        self.assertEqual(by_id[2]["matches"], [6])
        self.assertEqual(by_id[6]["matches"], [2])
        shop_b = (await self.get("/api/panel/finance/payments", shop_staff(SHOP_B))).json()["rows"]
        self.assertEqual(shop_b[0]["matches"], [])

    async def test_void_is_offered_only_with_its_own_permission(self) -> None:
        plain = (await self.get("/api/panel/finance/payments", dict(OWNER))).json()
        approved = next(r for r in plain["rows"] if r["id"] == 1)
        self.assertTrue(approved["can_void"])
        shop = (await self.get("/api/panel/finance/payments", shop_staff(SHOP_A))).json()
        self.assertFalse(any(r["can_void"] for r in shop["rows"]))
        self.assertFalse(shop["can_void_payment"])


class DeliveryTests(FinanceApiCase):
    async def test_the_queue_is_scoped_and_shows_the_stuck_order_with_its_close_rules(self) -> None:
        platform = (await self.get("/api/panel/finance/delivery", dict(OWNER))).json()
        self.assertEqual([r["order_id"] for r in platform["rows"]], [101])
        row = platform["rows"][0]
        self.assertTrue(row["stuck"])
        self.assertEqual(row["bulk_ops"], ["retry", "dismiss"])
        self.assertEqual(row["attempts"], 3)
        self.assertTrue(row["stuck_reason"]["can_refund"])
        shop_b = (await self.get("/api/panel/finance/delivery", shop_staff(SHOP_B))).json()
        self.assertEqual([r["order_id"] for r in shop_b["rows"]], [120])
        shop_a = (await self.get("/api/panel/finance/delivery", shop_staff(SHOP_A))).json()
        self.assertEqual(shop_a["rows"], [])


class CancellationsAndAutomationTests(FinanceApiCase):
    async def test_cancellation_requests_are_shop_scoped(self) -> None:
        shop_a = (await self.get("/api/panel/finance/cancellations", shop_staff(SHOP_A))).json()
        self.assertEqual([(r["username"], r["reason"]) for r in shop_a["rows"]], [("svc_a", "reason A")])
        self.assertTrue(shop_a["can_approve"])
        shop_b = (await self.get("/api/panel/finance/cancellations", shop_staff(SHOP_B, ["orders"]))).json()
        self.assertEqual([r["username"] for r in shop_b["rows"]], ["svc_b"])
        self.assertFalse(shop_b["can_approve"])
        platform = (await self.get("/api/panel/finance/cancellations", dict(OWNER))).json()
        self.assertEqual(platform["rows"], [])

    async def test_the_cursor_never_skips_or_repeats_a_request(self) -> None:
        self.session.add_all([
            ServiceCancellation(service_id=1, user_id=11, reseller_id=SHOP_A, reason=f"old {i}", pg_user_id=1, status="rejected")
            for i in range(51)
        ])
        await self.session.commit()
        first = (await self.get("/api/panel/finance/cancellations", shop_staff(SHOP_A))).json()
        self.assertEqual(len(first["rows"]), 50)
        second = (await self.get(f"/api/panel/finance/cancellations?before={first['next_before']}", shop_staff(SHOP_A))).json()
        ids = [r["id"] for r in first["rows"]] + [r["id"] for r in second["rows"]]
        self.assertEqual(len(ids), len(set(ids)))

    async def test_parked_automatic_purchases_are_shop_scoped(self) -> None:
        shop_a = (await self.get("/api/panel/finance/automation", shop_staff(SHOP_A))).json()
        self.assertEqual([i["service_id"] for i in shop_a["items"]], [1])
        self.assertEqual(shop_a["items"][0]["action_label"], "تمدید خودکار")
        self.assertEqual(shop_a["missing_bots"], [])
        platform = (await self.get("/api/panel/finance/automation", dict(OWNER))).json()
        self.assertEqual(platform["items"], [])


class ReportsTests(FinanceApiCase):
    async def test_the_report_is_scoped_and_an_unknown_period_falls_back_to_a_week(self) -> None:
        platform = (await self.get("/api/panel/finance/reports?period=bogus", dict(OWNER))).json()
        self.assertEqual(platform["period"], "week")
        self.assertEqual(set(platform["periods"]), {"day", "week", "month"})
        self.assertEqual(set(platform["sales_trend"]), {"7", "30"})
        self.assertEqual(len(platform["charts"]["orders"]["30"]["days"]), 30)
        self.assertEqual(platform["ops"]["delivery_failures"], 1)
        shop = (await self.get("/api/panel/finance/reports?period=month", shop_staff(SHOP_B))).json()
        self.assertEqual(shop["period"], "month")
        self.assertEqual(shop["ops"]["delivery_failures"], 1)
        self.assertEqual(shop["ops"]["total_users"], 1)


class SettingsTests(FinanceApiCase):
    def field(self, data: dict[str, Any], tab: str, key: str) -> dict[str, Any]:
        return next(f for g in data["groups"][tab] for f in g["fields"] if f["key"] == key)

    async def test_secret_fields_report_only_that_a_value_is_saved(self) -> None:
        response = await self.get("/api/panel/finance/settings", dict(OWNER))
        self.assertEqual(response.status_code, 200)
        for secret in (BBC_SECRET, WEBHOOK_SECRET, PSP_SECRET):
            self.assertNotIn(secret, response.text)
        data = response.json()
        bbc = self.field(data, "payment", "bbc_api_key")
        self.assertEqual((bbc["value"], bbc["has_value"]), ("", True))
        psp = json.loads(self.field(data, "payment", "psp_gateways")["value"])
        self.assertEqual(psp[0]["has_secret"], True)
        self.assertNotIn("merchant_id", psp[0])
        self.assertIn(PLATFORM_CARD, self.field(data, "payment", "payment_cards")["value"])

    async def test_the_platform_gets_billing_and_the_tag_cleanup_tab(self) -> None:
        data = (await self.get("/api/panel/finance/settings", dict(OWNER))).json()
        # The automatic cancelling of pending orders is retired: no tab, status or «cancel now» action.
        self.assertEqual([t["id"] for t in data["tabs"]], ["payment", "billing", "purge"])
        self.assertEqual(data["actions"]["payment"].split("?")[0], "/settings")
        self.assertIsNone(data["cleanup_status"])
        self.assertEqual((data["actions"]["cleanup"], data["actions"]["pending_orders"]), ("", ""))
        self.assertIsNotNone(data["purge"])
        self.assertTrue(data["purge"]["rules_action"].startswith("/finance/cleanup/save?next="))

    async def test_a_shop_sees_its_own_values_and_posts_to_its_own_settings(self) -> None:
        response = await self.get("/api/panel/finance/settings", shop_staff(SHOP_A))
        data = response.json()
        self.assertEqual([t["id"] for t in data["tabs"]], ["payment"])
        cards = self.field(data, "payment", "payment_cards")["value"]
        self.assertIn(SHOP_A_CARD, cards)
        self.assertNotIn(PLATFORM_CARD, response.text)
        for secret in (BBC_SECRET, WEBHOOK_SECRET):
            self.assertNotIn(secret, response.text)
        self.assertEqual(data["actions"]["payment"].split("?")[0], "/shop-settings")
        self.assertEqual(data["actions"]["pending_orders"], "", "the cancel-pending route is retired")
        self.assertIsNone(data["purge"], "purging needs its own permission")
        allowed = (await self.get("/api/panel/finance/settings", shop_staff(SHOP_A, ["orders", "shop_settings", "orders_purge"]))).json()
        self.assertIn("purge", [t["id"] for t in allowed["tabs"]])

    async def test_a_bare_admin_without_the_owner_principal_never_falls_back_to_owner_settings(self) -> None:
        response = await self.get("/api/panel/finance/settings", {"role": "admin", "permissions": []})
        self.assertEqual(response.status_code, 403)
        self.assertNotIn(PLATFORM_CARD, response.text)
        no_shop = await self.get("/api/panel/finance/settings", shop_staff(None))
        self.assertEqual(no_shop.status_code, 403)
        self.assertNotIn(PLATFORM_CARD, no_shop.text)


class PageShellTests(FinanceApiCase):
    async def asyncSetUp(self) -> None:
        await super().asyncSetUp()
        self.spa = tempfile.TemporaryDirectory()
        folder = Path(self.spa.name) / "finance"
        folder.mkdir()
        (folder / "index.html").write_text("<html>finance</html>", encoding="utf-8")
        patcher = patch.object(spa_pages, "SPA_DIR", Path(self.spa.name))
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(self.spa.cleanup)

    async def test_finance_staff_get_the_react_shell(self) -> None:
        response = await self.get("/finance?tab=orders", shop_staff(SHOP_A))
        self.assertEqual(response.status_code, 200)
        self.assertIn("finance", response.text)
        self.assertEqual(response.headers["cache-control"], "no-store")

    async def test_staff_without_orders_or_payments_are_sent_home(self) -> None:
        response = await self.get("/finance", shop_staff(SHOP_A, ["tickets"]))
        self.assertEqual((response.status_code, response.headers["location"]), (303, "/home"))

    async def test_the_old_behaviour_tab_still_moves_to_the_funnel(self) -> None:
        response = await self.get("/finance?tab=behavior", shop_staff(SHOP_A, ["orders"]))
        self.assertEqual((response.status_code, response.headers["location"]), (303, "/funnel"))

    async def test_the_old_list_addresses_keep_redirecting_into_the_hub(self) -> None:
        response = await self.get("/orders?q=ali", shop_staff(SHOP_A))
        self.assertEqual(response.status_code, 303)
        self.assertTrue(response.headers["location"].startswith("/finance?tab=orders"))


if __name__ == "__main__":
    unittest.main()
