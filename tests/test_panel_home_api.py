"""JSON endpoints of the React dashboard, bot overview, inbox and security pages."""

from __future__ import annotations

import os
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")

import httpx
from fastapi import FastAPI, HTTPException
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api.panel_home_api import register_panel_home_api
from app.db import Base
from app.db.models import BotUser, Order, Payment
from app.services.host_gauges import build_host_gauges
from app.services.panel_home_payload import (
    action_center_payload,
    connection_notice,
    home_portals,
    inbox_payload,
    link_health_payload,
    pg_limits_payload,
)

OWNER = {
    "role": "admin", "id": 1, "username": "root", "org_principal_id": 1, "org_depth": 0,
    "org_parent_id": None, "org_status": "active", "permissions": [], "pg_permissions": ["pg_nodes"],
}
SHOP_A = 5
SHOP_B = 6
PANEL_SECRET = "https://panel.internal.example/dash"
TOKEN_SECRET = "123456:SECRET-BOT-TOKEN"


def shop(shop_id: int, perms: list[str] | None = None) -> dict:
    return {"role": "reseller", "bot_user_id": shop_id, "id": shop_id, "username": f"shop{shop_id}", "permissions": perms or []}


class ApiHarness(unittest.IsolatedAsyncioTestCase):
    """The home API on a tiny app whose guards read ``self.staff`` / ``self.denied``."""

    async def asyncSetUp(self) -> None:
        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        self.Session = async_sessionmaker(self.engine, expire_on_commit=False)
        self.staff: dict = dict(OWNER)
        self.signed_in = True
        self.allowed_perms: set[str] = {"dashboard"}

        async def get_db():
            async with self.Session() as session:
                yield session

        def require_staff():
            if not self.signed_in:
                raise HTTPException(status_code=401, detail="no session")
            return self.staff

        def require_perm(perm: str):
            def dependency():
                if not self.signed_in:
                    raise HTTPException(status_code=401, detail="no session")
                if perm not in self.allowed_perms:
                    raise HTTPException(status_code=403, detail="forbidden")
                return self.staff

            return dependency

        app = FastAPI()
        register_panel_home_api(
            app, require_staff=require_staff, require_admin=require_staff, require_perm=require_perm,
            require_pg_perm=lambda _perm: require_staff, get_db=get_db,
        )
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")

    async def asyncTearDown(self) -> None:
        await self.client.aclose()
        await self.engine.dispose()


class GuardTests(ApiHarness):
    async def test_every_endpoint_needs_a_session(self) -> None:
        self.signed_in = False
        for path in (
            "/api/panel/home", "/api/panel/home/widgets", "/api/panel/dashboard", "/api/panel/inbox",
            "/api/panel/security", "/api/panel/staff-actions",
        ):
            with self.subTest(path=path):
                self.assertEqual((await self.client.get(path)).status_code, 401)

    async def test_dashboard_needs_the_dashboard_permission(self) -> None:
        self.allowed_perms = set()
        self.staff = shop(SHOP_A, ["payments"])
        response = await self.client.get("/api/panel/dashboard")
        self.assertEqual(response.status_code, 403)
        self.assertNotIn("figures", response.text)

    async def test_responses_are_never_cached(self) -> None:
        self.staff = shop(SHOP_A)
        response = await self.client.get("/api/panel/security")
        self.assertEqual(response.headers["cache-control"], "private, no-store")


class HomeShellTests(ApiHarness):
    async def test_staff_without_a_shop_are_sent_to_their_own_home(self) -> None:
        self.staff = {"role": "pg_staff", "username": "x", "pg_permissions": ["pg_overview"], "permissions": []}
        for path in ("/api/panel/home", "/api/panel/home/widgets"):
            self.assertEqual((await self.client.get(path)).json(), {"redirect": "/pg"})
        self.staff = {"role": "pg_staff", "username": "x", "pg_permissions": [], "permissions": []}
        self.assertEqual((await self.client.get("/api/panel/home")).json(), {"redirect": "/security"})

    async def test_owner_shell_lists_the_shortcuts_and_the_kpi_links(self) -> None:
        body = (await self.client.get("/api/panel/home")).json()
        self.assertEqual(body["variant"], "owner")
        self.assertEqual(body["portals"], {"bot": True, "pg": True})
        self.assertTrue(body["show_pg_nodes"])
        self.assertEqual(body["kpi_links"], {"payments": True, "tickets": True})

    async def test_shop_shell_follows_the_staff_permissions(self) -> None:
        self.staff = shop(SHOP_A, ["tickets"])
        async with self.Session() as session:
            session.add(BotUser(id=SHOP_A, telegram_id=900, referral_code="a", role="reseller"))
            await session.commit()
        body = (await self.client.get("/api/panel/home")).json()
        self.assertEqual(body["variant"], "shop")
        self.assertEqual(body["kpi_links"], {"payments": False, "tickets": True})
        self.assertFalse(body["show_pg_nodes"])


def owner_context() -> dict:
    return {
        "staff": OWNER,
        "overview": {
            "bot": {"ok": True, "error": None, "username": "mybot", "name": "n", "detail": TOKEN_SECRET},
            "nodes": {"ok": True, "overall": "warn", "connected": 1, "total": 2, "error": None, "nodes": [{"name": "n1"}]},
            "pg_summary": {"admins": 3, "base_url": PANEL_SECRET},
        },
        "pg_health": {"ok": True, "error": None, "version": "1.2.3", "base_url": PANEL_SECRET},
        "pg_link_health": {
            "circuit": {"paused": False, "retry_in_sec": 0}, "recent_failure_count": 0, "last_ok_at": "2026-01-01T00:00:00",
            "latency_p50_ms": 40, "latency_p95_ms": 90, "last_ok_time": "10:00:00", "last_failure_time": None,
            "recent_failures": [{"label": "x", "count": 0}, {"label": "timeout", "count": 2}],
        },
        "periods": {
            "day": {"orders": 3, "delivered": 2, "revenue": 5000, "new_users": 1},
            "week": {"orders": 9, "delivered": 8, "revenue": 90000, "new_users": 4},
            "month": {"orders": 30, "delivered": 25, "revenue": 900000, "new_users": 20},
        },
        "action_center": {
            "pending": 2, "tickets": 1, "has_items": True,
            "entries": [{"key": "pending", "title": "2 رسید در انتظار", "detail": "d", "href": "/finance?tab=payments", "tone": "warn"}],
        },
        "trend": {"days": [], "total": 7, "previous_total": 0, "change_pct": None, "today": 5000, "yesterday": 0,
                  "today_change_pct": None, "has_data": True},
        "dashboard_degraded": False,
        "pg_limits": None,
        "wallet_card": {"balance": 1200, "balance_fa": "1,200", "user_id": 9, "services": 2, "nearest_expiry_days": 4},
        "show_pg_nodes": True,
    }


class HomeWidgetsTests(ApiHarness):
    async def test_owner_widgets_show_the_screen_fields_and_no_secrets(self) -> None:
        with (
            patch("app.api.panel_home_api.home_dashboard_context", AsyncMock(return_value=("home.html", owner_context()))),
            patch("app.api.panel_home_api._owner_update", return_value={"update_available": True, "remote_version": "9.9.9"}),
        ):
            response = await self.client.get("/api/panel/home/widgets")
        self.assertEqual(response.status_code, 200)
        for secret in (PANEL_SECRET, TOKEN_SECRET, "panel.internal"):
            self.assertNotIn(secret, response.text)
        body = response.json()
        self.assertEqual(body["variant"], "owner")
        self.assertEqual({tile["id"]: tile["state"] for tile in body["tiles"]}, {"bot": "ok", "pg": "ok", "nodes": "warn"})
        self.assertEqual(body["tiles"][0]["detail"], "@mybot")
        self.assertEqual(body["tiles"][1]["detail"], "نسخه 1.2.3")
        self.assertEqual(body["tiles"][2]["detail"], "1/2 متصل")
        self.assertEqual(body["update"], {"remote_version": "9.9.9"})
        self.assertEqual(body["kpi"]["sales_today"], 5000)
        self.assertEqual(body["kpi"]["pending"], 2)
        self.assertEqual(body["queue"]["entries"][0]["key"], "pending")
        self.assertEqual(body["account"]["user_id"], 9)
        self.assertEqual([row["label"] for row in body["link_health"]["recent_failures"]], ["timeout"])
        self.assertEqual(body["periods"]["week"]["revenue"], 90000)

    async def test_a_failed_build_serves_unchecked_tiles_never_a_false_outage(self) -> None:
        with patch("app.api.panel_home_api.home_dashboard_context", AsyncMock(side_effect=RuntimeError("boom"))):
            response = await self.client.get("/api/panel/home/widgets")
        body = response.json()
        self.assertTrue(body["degraded"])
        self.assertEqual({tile["state"] for tile in body["tiles"]}, {"neutral"})
        self.assertNotIn("boom", response.text)

    async def test_shop_widgets_hide_owner_only_parts_and_keep_the_payg_wallet(self) -> None:
        self.staff = shop(SHOP_A, ["dashboard", "payments"])
        context = {
            "staff": self.staff, "trend": None, "pg_limits": None, "bot_setup_needed": True,
            "bot": {"ok": False, "error": "توکن تنظیم نشده", "username": None, "name": None},
            "billing_card": {"balance": 800, "balance_fa": "800", "mode": "payg", "suspended": True},
            "pg_health": {"unchecked": True, "ok": None, "error": None, "version": None},
            "periods": {}, "action_center": {"entries": [], "has_items": False}, "dashboard_degraded": False,
            "pg_link_health": {"circuit": {"paused": True}},
            "wallet_card": {"balance": 1, "user_id": 3},
        }
        with patch("app.api.panel_home_api.home_dashboard_context", AsyncMock(return_value=("reseller_home.html", context))):
            body = (await self.client.get("/api/panel/home/widgets")).json()
        self.assertEqual(body["variant"], "shop")
        self.assertIsNone(body["link_health"])
        self.assertIsNone(body["account"])
        self.assertIsNone(body["update"])
        self.assertEqual(body["billing"], {"balance": 800, "suspended": True})
        self.assertEqual(body["tiles"][0]["state"], "err")
        self.assertEqual(body["tiles"][0]["detail"], "توکن تنظیم نشده")
        self.assertEqual(body["tiles"][1]["state"], "neutral")
        self.assertEqual(body["tiles"][0]["href"], "/shop-settings?tab=bot")
        self.assertEqual(body["kpi"]["sales_today"], 0)
        self.assertFalse(body["kpi"]["sales_compare"])
        self.assertEqual(body["kpi"]["links"], {"payments": True, "tickets": False})
        self.assertEqual(body["portals"], {"bot": True, "pg": True})


async def seed_two_shops(session) -> None:
    now = datetime.now(timezone.utc)
    session.add_all([
        BotUser(id=SHOP_A, telegram_id=901, referral_code="a", role="reseller"),
        BotUser(id=SHOP_B, telegram_id=902, referral_code="b", role="reseller"),
        BotUser(id=11, telegram_id=911, referral_code="c1", role="user", reseller_id=SHOP_A),
        BotUser(id=12, telegram_id=912, referral_code="c2", role="user", reseller_id=SHOP_B),
    ])
    await session.flush()
    session.add_all([
        Order(id=101, user_id=11, amount=1111, discount_amount=0, quantity=1, status="delivered", reseller_id=SHOP_A, created_at=now),
        Order(id=102, user_id=12, amount=2222, discount_amount=0, quantity=1, status="delivered", reseller_id=SHOP_B, created_at=now),
    ])
    await session.flush()
    session.add_all([
        Payment(id=201, order_id=101, user_id=11, amount=1111, status="approved"),
        Payment(id=202, order_id=102, user_id=12, amount=2222, status="pending"),
    ])
    await session.commit()


class DashboardEndpointTests(ApiHarness):
    async def asyncSetUp(self) -> None:
        await super().asyncSetUp()
        async with self.Session() as session:
            await seed_two_shops(session)
        patches = [
            patch("app.services.bot_overview.shop_needs_bot", AsyncMock(return_value=False)),
            patch("app.services.bot_overview.shop_bot_token", AsyncMock(return_value=TOKEN_SECRET)),
            patch(
                "app.services.bot_overview.bot_status",
                AsyncMock(return_value={"state": "ok", "username": "mybot", "detail": "آنلاین"}),
            ),
            patch("app.api.panel_home_api.local_host", AsyncMock(return_value=build_host_gauges(cpu_percent=12, memory_percent=40))),
        ]
        for item in patches:
            item.start()
            self.addCleanup(item.stop)

    async def test_a_shop_sees_only_its_own_rows_and_no_server_figures(self) -> None:
        self.staff = shop(SHOP_A, ["dashboard", "payments", "orders"])
        self.allowed_perms = {"dashboard"}
        response = await self.client.get("/api/panel/dashboard?period=month")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertNotIn(TOKEN_SECRET, response.text)
        self.assertEqual(body["period"], "month")
        figures = body["figures"]
        self.assertEqual([row["id"] for row in figures["recent_payments"]], [201])
        self.assertEqual([row["id"] for row in figures["recent_orders"]], [101])
        self.assertEqual(figures["kpis"]["current"]["revenue"], 1111)
        self.assertEqual(figures["stats"]["revenue"], 1111)
        self.assertIsNone(body["host"])
        self.assertFalse(body["viewer"]["is_platform"])
        self.assertEqual(body["viewer"]["settings_href"], "/shop-settings")

    async def test_rows_follow_the_staff_permissions(self) -> None:
        self.staff = shop(SHOP_A, ["dashboard"])
        figures = (await self.client.get("/api/panel/dashboard")).json()["figures"]
        self.assertIsNone(figures["recent_payments"])
        self.assertIsNone(figures["recent_orders"])
        self.staff = shop(SHOP_B, ["dashboard", "orders"])
        figures = (await self.client.get("/api/panel/dashboard")).json()["figures"]
        self.assertIsNone(figures["recent_payments"])
        self.assertEqual([row["id"] for row in figures["recent_orders"]], [102])

    async def test_the_second_shop_cannot_read_the_first_shops_figures(self) -> None:
        self.staff = shop(SHOP_B, ["dashboard", "payments", "orders"])
        figures = (await self.client.get("/api/panel/dashboard")).json()["figures"]
        self.assertEqual([row["id"] for row in figures["recent_payments"]], [202])
        self.assertEqual(figures["recent_payments"][0]["status_label"], "در انتظار")
        self.assertEqual(figures["kpis"]["current"]["revenue"], 2222)

    async def test_the_owner_gets_the_platform_shop_and_the_server_gauges(self) -> None:
        body = (await self.client.get("/api/panel/dashboard?period=nonsense")).json()
        self.assertEqual(body["period"], "week")
        self.assertTrue(body["viewer"]["is_platform"])
        self.assertEqual(body["host"]["cpu_percent"], 12)
        self.assertEqual(body["figures"]["recent_orders"], [])
        self.assertEqual(body["viewer"]["settings_href"], "/settings?tab=bot")

    async def test_a_shop_without_its_bot_gets_only_the_setup_notice(self) -> None:
        self.staff = shop(SHOP_A, ["dashboard", "payments"])
        with patch("app.services.bot_overview.shop_needs_bot", AsyncMock(return_value=True)):
            body = (await self.client.get("/api/panel/dashboard")).json()
        self.assertTrue(body["bot_setup_needed"])
        self.assertIsNone(body["figures"])

    async def test_staff_without_a_shop_get_no_figures(self) -> None:
        self.staff = {"role": "pg_staff", "username": "x", "permissions": ["dashboard"]}
        body = (await self.client.get("/api/panel/dashboard")).json()
        self.assertFalse(body["viewer"]["has_shop"])
        self.assertIsNone(body["figures"])
        self.assertIsNone(body["host"])


class InboxEndpointTests(ApiHarness):
    async def test_inbox_payload_carries_alerts_without_internal_fields(self) -> None:
        context = {
            "inbox_has": True, "inbox_hidden_by_dismiss": 2, "update": {"update_available": True, "version": "1.0", "remote_version": "1.1", "url": PANEL_SECRET},
            "ticket_alert": {"title": "<b>t</b>", "detail": "d", "href": "/tickets", "ticket_id": 7},
            "shop_maintenance": True, "capacity_warn": False,
            "payg_risk": {"suspended": [{"label": "A", "balance": -5, "user_id": 3}], "low": [], "threshold": 100},
            "action_center": {"has_items": False, "entries": []}, "staff": {"password": "x"},
        }
        with patch("app.services.panel_inbox.build_inbox_context", AsyncMock(return_value=context)):
            response = await self.client.get("/api/panel/inbox")
        body = response.json()
        self.assertNotIn(PANEL_SECRET, response.text)
        self.assertEqual(body["hidden_count"], 2)
        self.assertEqual(body["update"], {"version": "1.0", "remote_version": "1.1"})
        self.assertEqual(body["ticket_alert"]["entity_id"], "7")
        self.assertEqual(body["ticket_alert"]["title"], "<b>t</b>")
        self.assertEqual(body["payg"]["suspended"], [{"label": "A", "balance": -5}])
        self.assertTrue(body["shop_maintenance"])
        self.assertFalse(body["capacity_warn"])

    async def test_inbox_is_built_for_the_signed_in_staff_only(self) -> None:
        self.staff = shop(SHOP_A)
        build = AsyncMock(return_value={"inbox_has": False})
        with patch("app.services.panel_inbox.build_inbox_context", build):
            body = (await self.client.get("/api/panel/inbox")).json()
        self.assertEqual(build.await_args.args[2], self.staff)
        self.assertFalse(body["has_items"])
        self.assertIsNone(body["update"])
        self.assertIsNone(body["ticket_alert"])


class SecurityEndpointTests(ApiHarness):
    async def test_panel_tabs_are_for_the_admin_only(self) -> None:
        body = (await self.client.get("/api/panel/security")).json()
        self.assertTrue(body["show_panel_tabs"])
        self.assertEqual(body["username"], "root")
        self.staff = {**shop(SHOP_A), "password_hash": "HASH"}
        response = await self.client.get("/api/panel/security")
        body = response.json()
        self.assertFalse(body["show_panel_tabs"])
        self.assertEqual(body["role"], "reseller")
        self.assertTrue(body["identity_help"]["lines"])
        self.assertNotIn("HASH", response.text)


class PayloadTests(unittest.TestCase):
    def test_pg_limits_need_a_ready_read_and_something_to_show(self) -> None:
        self.assertIsNone(pg_limits_payload({"ready": False, "users": {"has_limit": True}}))
        self.assertIsNone(pg_limits_payload({"ready": True}))
        meter = {"label": "کاربران", "has_limit": True, "pct": 40.0, "remain_pct": 60.0, "tone": "ok", "used_text": "4", "limit_text": "10", "remain_text": "6", "ratio_text": "4/10", "used": 4}
        limits = pg_limits_payload({"ready": True, "username": "u", "users": meter, "error": "secret detail", "constraints": []})
        self.assertEqual(limits["users"]["ratio_text"], "4/10")
        self.assertNotIn("used", limits["users"])
        self.assertNotIn("error", limits)

    def test_link_health_tone_follows_the_circuit_then_the_failures(self) -> None:
        paused = link_health_payload({"circuit": {"paused": True, "retry_in_sec": 9}})
        self.assertEqual((paused["tone"], paused["retry_in_sec"]), ("danger", 9))
        self.assertEqual(link_health_payload({"circuit": {}, "recent_failure_count": 1})["tone"], "warning")
        self.assertEqual(link_health_payload({"circuit": {}, "last_ok_at": "t"})["tone"], "success")
        self.assertEqual(link_health_payload({"circuit": {}})["label"], "بدون داده")
        self.assertIsNone(link_health_payload(None))

    def test_a_late_panel_is_flagged_with_the_age_of_the_shown_data(self) -> None:
        stale = SimpleNamespace(
            pg_read_budget=SimpleNamespace(failure="timeout"), pg_last_good=SimpleNamespace(age=300.0, minutes=5)
        )
        self.assertEqual(connection_notice(stale), {"kind": "stale", "minutes": 5})
        down = SimpleNamespace(pg_read_budget=SimpleNamespace(failure="timeout"), pg_last_good=SimpleNamespace(age=None, minutes=1))
        self.assertEqual(connection_notice(down), {"kind": "unavailable", "minutes": 0})
        self.assertIsNone(connection_notice(SimpleNamespace(pg_read_budget=SimpleNamespace(failure=None))))
        self.assertIsNone(connection_notice(SimpleNamespace()))

    def test_queue_is_empty_unless_entries_remain_after_dismissals(self) -> None:
        self.assertFalse(action_center_payload({"has_items": True, "entries": []})["has_items"])
        self.assertEqual(action_center_payload(None), {"has_items": False, "entries": [], "pending": 0, "tickets": 0})

    def test_shop_portals_follow_permissions(self) -> None:
        self.assertEqual(home_portals({"role": "pg_staff", "permissions": ["dashboard"]}, owner=False), {"bot": True, "pg": False})
        self.assertEqual(
            home_portals({"role": "pg_staff", "permissions": [], "pg_permissions": ["pg_overview"]}, owner=False),
            {"bot": False, "pg": True},
        )

    def test_empty_inbox_context_is_safe(self) -> None:
        body = inbox_payload({})
        self.assertFalse(body["has_items"])
        self.assertEqual(body["payg"]["suspended"], [])


if __name__ == "__main__":
    unittest.main()
