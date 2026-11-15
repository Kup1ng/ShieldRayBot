"""JSON endpoints behind the React PasarGuard overview, nodes, inbounds and admins pages.

Guards: permission per page, scope of the read client, secrets never in a payload, bounded lists,
a slow or failing panel degrading to a notice instead of an error page.
"""

from __future__ import annotations

import asyncio
import unittest
from collections.abc import AsyncIterator
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
from fastapi import FastAPI, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.panel_pg_infra_api import register_panel_pg_infra_api
from app.db.models import Base, PgStaffAccess, ResellerPlan, ResellerProfile
from app.services import pg_admins_panel, pg_nodes_panel, pg_overview_panel
from app.services.pasarguard import PasarGuardError
from app.services.pg_panel_errors import safe_persian_text, safe_pg_error
from app.services.pg_read import PgReadDenied

GB = 1024**3
HASH_SECRET = "PBKDF2-HASH-SECRET"
KEY_SECRET = "NODE-API-KEY-SECRET"
CA_SECRET = "-----BEGIN CERTIFICATE-----SECRET-CA"
PAGES = ["pg_overview", "pg_nodes", "pg_inbounds", "pg_admins"]
NODE_GRANTS = {"nodes": {"reconnect": True, "create": False, "update": True, "delete": False}}

OWNER = {"role": "admin", "username": "root", "pg_is_owner": True, "pg_permissions": PAGES, "pg_actions": NODE_GRANTS}
SHOP_A = {"role": "reseller", "bot_user_id": 2, "pg_admin_username": "shop_a", "pg_permissions": ["pg_overview", "pg_nodes"], "pg_actions": {}}
SHOP_B = {**SHOP_A, "bot_user_id": 3, "pg_admin_username": "shop_b"}
NO_PAGES = {"role": "reseller", "bot_user_id": 4, "pg_admin_username": "shop_c", "pg_permissions": []}


def pg_node(node_id: int, name: str, **extra: Any) -> dict[str, Any]:
    return {
        "id": node_id,
        "name": name,
        "address": f"10.0.0.{node_id}",
        "port": 62050,
        "status": "connected",
        "api_key": KEY_SECRET,
        "server_ca": CA_SECRET,
        "uplink": 2 * GB,
        "downlink": 3 * GB,
        **extra,
    }


class FakePg:
    """The panel as the pages read it; every call is recorded."""

    def __init__(self) -> None:
        self.nodes: list[dict[str, Any]] = [pg_node(1, "Berlin"), pg_node(2, "Paris", status="disabled")]
        self.get_nodes = AsyncMock(side_effect=lambda **kwargs: list(self.nodes))
        self.get_nodes_realtime = AsyncMock(return_value={"1": {"cpu_usage": 12, "outgoing_bandwidth_speed": 1024, "incoming_bandwidth_speed": 2048}})
        self.get_inbounds = AsyncMock(return_value=["vless-ws", {"tag": "trojan"}, {"name": "named"}])
        self.get_inbounds_details = AsyncMock(
            return_value={
                "vless-ws": {"port": 443, "reality": {"privateKey": "PRIVATE-KEY-SECRET", "shortId": "ab"}},
                "api_token": "TOKEN-SECRET",
            }
        )
        self.get_system_stats = AsyncMock(return_value={"version": "1.4.0", "total_user": 40, "online_users": 3, "active_users": 30, "expired_users": 4, "cpu_usage": 41, "mem_used": 2 * GB, "mem_total": 8 * GB})
        self.get_admins_simple = AsyncMock(return_value=[{"username": "a"}, {"username": "b"}])
        self.get_groups_simple = AsyncMock(return_value=[{"id": 1}])
        self.get_hosts = AsyncMock(return_value=[{"id": 1}, {"id": 2}, {"id": 3}])
        self.admins: list[dict[str, Any]] = []
        self.roles: list[dict[str, Any]] = [{"id": 1, "name": "Owner", "is_owner": True}, {"id": 2, "name": "Seller"}]
        self.get_admins = AsyncMock(side_effect=lambda: list(self.admins))
        self.get_admin_roles = AsyncMock(side_effect=lambda: list(self.roles))
        self.details: dict[str, dict[str, Any]] = {}
        self.running = 0
        self.peak = 0
        self.get_admin = AsyncMock(side_effect=self._get_admin)

    async def _get_admin(self, username: str) -> dict[str, Any] | None:
        self.running += 1
        self.peak = max(self.peak, self.running)
        try:
            await asyncio.sleep(0.01)
            return self.details.get(username)
        finally:
            self.running -= 1


class InfraCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        self.session = async_sessionmaker(self.engine, expire_on_commit=False)()
        self.staff: dict[str, Any] = {}
        self.pg = FakePg()
        self.read_clients: dict[str, FakePg] = {}
        self.read_calls: list[dict[str, Any]] = []
        self.budget_failure: str | None = None

        def require_pg_perm(permission: str):
            def dependency() -> dict[str, Any]:
                if permission not in (self.staff.get("pg_permissions") or []):
                    raise HTTPException(403, "forbidden")
                return self.staff

            return dependency

        async def get_db() -> AsyncIterator[AsyncSession]:
            yield self.session

        app = FastAPI()

        @app.middleware("http")
        async def read_budget(request: Request, call_next):
            request.state.pg_read_budget = SimpleNamespace(failure=self.budget_failure)
            request.state.pg_last_good = SimpleNamespace(age=None, minutes=0)
            return await call_next(request)

        register_panel_pg_infra_api(
            app,
            require_staff=lambda: self.staff,
            require_admin=lambda: self.staff,
            require_perm=require_pg_perm,
            require_pg_perm=require_pg_perm,
            get_db=get_db,
        )
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")

        async def read_client(session: object, staff: dict) -> FakePg:
            self.read_calls.append(dict(staff))
            return self.read_clients.get(str(staff.get("pg_admin_username")), self.pg)

        def owner_client() -> FakePg:
            return self.pg

        for target, replacement in (
            ("app.services.pg_nodes_panel.staff_pg_read_client", read_client),
            ("app.services.pg_overview_panel.get_pg", owner_client),
            ("app.services.pg_admins_panel.get_pg", owner_client),
            ("app.services.pasarguard.get_pg", owner_client),
            ("app.services.pg_staff_access.load_web_admin", lambda: {"username": "root"}),
            ("app.api.panel_pg_infra_api.resolve_pg_open_url", AsyncMock(return_value="https://panel.example")),
            ("app.api.panel_pg_infra_api.panel_ticket_dashboard_alert", AsyncMock(return_value=None)),
        ):
            patcher = patch(target, replacement)
            patcher.start()
            self.addCleanup(patcher.stop)

    async def asyncTearDown(self) -> None:
        await self.client.aclose()
        await self.session.close()
        await self.engine.dispose()

    async def get(self, staff: dict[str, Any], path: str) -> httpx.Response:
        self.staff.clear()
        self.staff.update(staff)
        return await self.client.get(path)


class PermissionTests(InfraCase):
    async def test_every_endpoint_refuses_a_staff_member_without_the_page_permission(self) -> None:
        for path in ("", "/widgets", "/nodes", "/inbounds", "/admins"):
            response = await self.get(NO_PAGES, f"/api/panel/pg{path}")
            self.assertEqual(response.status_code, 403, path)

    async def test_the_admins_page_is_for_staff_with_that_permission_only(self) -> None:
        self.assertEqual((await self.get(SHOP_A, "/api/panel/pg/admins")).status_code, 403)
        self.assertEqual((await self.get(SHOP_A, "/api/panel/pg/inbounds")).status_code, 403)
        self.assertEqual((await self.get(OWNER, "/api/panel/pg/admins")).status_code, 200)

    async def test_answers_are_not_cacheable(self) -> None:
        for path in ("", "/widgets", "/nodes", "/inbounds", "/admins"):
            response = await self.get(OWNER, f"/api/panel/pg{path}")
            self.assertEqual(response.headers["cache-control"], "private, no-store", path)


class NodesTests(InfraCase):
    async def test_rows_carry_only_the_screen_fields_and_never_the_node_key_or_certificate(self) -> None:
        response = await self.get(OWNER, "/api/panel/pg/nodes")
        self.assertEqual(response.status_code, 200)
        for secret in (KEY_SECRET, CA_SECRET, "api_key", "server_ca"):
            self.assertNotIn(secret, response.text)
        body = response.json()
        self.assertEqual([n["name"] for n in body["nodes"]], ["Berlin", "Paris"])
        self.assertEqual(set(body["nodes"][0]), {"id", "name", "address", "port", "status", "status_label", "status_kind", "traffic_up", "traffic_down", "traffic_total", "traffic_up_text", "traffic_down_text", "traffic_total_text"})
        self.assertEqual(body["nodes"][0]["traffic_total"], 5 * GB)
        self.assertEqual([n["status_kind"] for n in body["nodes"]], ["ok", "err"])
        self.assertEqual([n["status_label"] for n in body["nodes"]], ["متصل", "غیرفعال"])
        self.assertIsNone(body["error"])

    async def test_capabilities_follow_the_staff_grants(self) -> None:
        owner = (await self.get(OWNER, "/api/panel/pg/nodes")).json()["can"]
        self.assertEqual(owner, {"reconnect": True, "create": False, "update": True, "delete": False})
        shop = (await self.get(SHOP_A, "/api/panel/pg/nodes")).json()["can"]
        self.assertFalse(any(shop.values()))

    async def test_the_read_client_is_chosen_from_the_signed_in_staff_not_from_the_request(self) -> None:
        shop_a, shop_b = FakePg(), FakePg()
        shop_a.nodes = [pg_node(10, "A node")]
        shop_b.nodes = [pg_node(20, "B node")]
        self.read_clients = {"shop_a": shop_a, "shop_b": shop_b}
        first = (await self.get(SHOP_A, "/api/panel/pg/nodes?shop=shop_b&admin=shop_b")).json()
        second = (await self.get(SHOP_B, "/api/panel/pg/nodes")).json()
        self.assertEqual([n["name"] for n in first["nodes"]], ["A node"])
        self.assertEqual([n["name"] for n in second["nodes"]], ["B node"])
        self.assertEqual([c["pg_admin_username"] for c in self.read_calls], ["shop_a", "shop_b"])

    async def test_a_principal_without_safe_credentials_gets_the_refusal_not_the_owners_nodes(self) -> None:
        with patch("app.services.pg_nodes_panel.staff_pg_read_client", AsyncMock(side_effect=PgReadDenied())):
            body = (await self.get(SHOP_A, "/api/panel/pg/nodes")).json()
        self.assertEqual(body["nodes"], [])
        self.assertIn("اعتبارنامه", body["error"])

    async def test_a_panel_failure_shows_a_safe_message_never_the_exception_text(self) -> None:
        self.pg.get_nodes = AsyncMock(side_effect=RuntimeError("Traceback: password=hunter2 at /app/secret.py"))
        response = await self.get(OWNER, "/api/panel/pg/nodes")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("hunter2", response.text)
        self.assertNotIn("Traceback", response.text)
        self.assertEqual(response.json()["nodes"], [])
        self.assertTrue(response.json()["error"])

    async def test_missing_live_figures_still_list_the_nodes(self) -> None:
        self.pg.get_nodes_realtime = AsyncMock(side_effect=RuntimeError("realtime down"))
        body = (await self.get(OWNER, "/api/panel/pg/nodes")).json()
        self.assertEqual(len(body["nodes"]), 2)

    async def test_the_list_is_bounded(self) -> None:
        self.pg.nodes = [pg_node(i, f"n{i}") for i in range(1, pg_nodes_panel.MAX_NODES + 40)]
        body = (await self.get(OWNER, "/api/panel/pg/nodes")).json()
        self.assertEqual(len(body["nodes"]), pg_nodes_panel.MAX_NODES)

    async def test_realtime_stats_supply_the_traffic_a_node_does_not_carry(self) -> None:
        self.pg.nodes = [{"id": 1, "name": "bare", "address": "1.1.1.1", "status": "connected"}]
        self.pg.get_nodes_realtime = AsyncMock(return_value={"1": {"uplink": 4 * GB, "downlink": GB}})
        node = (await self.get(OWNER, "/api/panel/pg/nodes")).json()["nodes"][0]
        self.assertEqual((node["traffic_up"], node["traffic_down"], node["traffic_total"]), (4 * GB, GB, 5 * GB))
        self.pg.get_nodes_realtime.assert_awaited()

    async def test_a_node_without_an_id_has_a_null_id_so_the_screen_offers_no_actions(self) -> None:
        self.pg.nodes = [{"name": "ghost", "address": "1.1.1.1", "status": "connected"}]
        body = (await self.get(OWNER, "/api/panel/pg/nodes")).json()
        self.assertIsNone(body["nodes"][0]["id"])

    async def test_the_notice_appears_when_the_panel_was_slow_or_down(self) -> None:
        self.assertIsNone((await self.get(OWNER, "/api/panel/pg/nodes")).json()["notice"])
        self.budget_failure = "timeout"
        self.assertEqual((await self.get(OWNER, "/api/panel/pg/nodes")).json()["notice"], {"kind": "unavailable", "minutes": 0})


class InboundsTests(InfraCase):
    async def test_tags_are_listed_and_secret_looking_details_are_hidden(self) -> None:
        response = await self.get(OWNER, "/api/panel/pg/inbounds")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["tags"], ["vless-ws", "trojan", "named"])
        for secret in ("PRIVATE-KEY-SECRET", "TOKEN-SECRET"):
            self.assertNotIn(secret, response.text)
        rows = {row["key"]: row["value"] for row in body["details"]["rows"]}
        self.assertIn("443", rows["vless-ws"])
        self.assertEqual(rows["api_token"], pg_nodes_panel.HIDDEN_VALUE)

    async def test_a_details_text_is_kept_as_one_block_and_redacted(self) -> None:
        self.pg.get_inbounds_details = AsyncMock(return_value="plain text password=hunter2")
        body = (await self.get(OWNER, "/api/panel/pg/inbounds")).json()
        self.assertEqual(body["details"]["rows"], [])
        self.assertNotIn("hunter2", body["details"]["text"])

    async def test_a_shop_reads_inbounds_through_its_own_client_never_the_owners(self) -> None:
        shop_a, shop_b = FakePg(), FakePg()
        shop_a.get_inbounds = AsyncMock(return_value=["a-only"])
        shop_b.get_inbounds = AsyncMock(return_value=["b-only"])
        self.read_clients = {"shop_a": shop_a, "shop_b": shop_b}
        with_page = {**SHOP_A, "pg_permissions": ["pg_inbounds"]}
        other_page = {**SHOP_B, "pg_permissions": ["pg_inbounds"]}
        self.assertEqual((await self.get(with_page, "/api/panel/pg/inbounds?admin=shop_b")).json()["tags"], ["a-only"])
        self.assertEqual((await self.get(other_page, "/api/panel/pg/inbounds")).json()["tags"], ["b-only"])
        self.pg.get_inbounds.assert_not_awaited()

    async def test_a_failing_panel_keeps_the_tags_already_read(self) -> None:
        self.pg.get_inbounds_details = AsyncMock(side_effect=RuntimeError("secret internal detail"))
        response = await self.get(OWNER, "/api/panel/pg/inbounds")
        self.assertNotIn("secret internal detail", response.text)
        body = response.json()
        self.assertEqual(body["tags"], ["vless-ws", "trojan", "named"])
        self.assertTrue(body["error"])


class OverviewTests(InfraCase):
    async def test_the_shell_is_local_data_only_and_carries_no_figures(self) -> None:
        body = (await self.get(OWNER, "/api/panel/pg")).json()
        self.assertEqual(body, {"owner": True, "external_url": "https://panel.example", "ticket_alert": None, "remediation": None})
        self.pg.get_system_stats.assert_not_awaited()

    async def test_the_shell_shows_a_shop_its_ticket_alert(self) -> None:
        alert = {"title": "یک تیکت", "detail": "پاسخ", "href": "/tickets", "extra": "dropped"}
        with patch("app.api.panel_pg_infra_api.panel_ticket_dashboard_alert", AsyncMock(return_value=alert)):
            shop = (await self.get(SHOP_A, "/api/panel/pg")).json()
            owner = (await self.get(OWNER, "/api/panel/pg")).json()
        self.assertEqual(shop["ticket_alert"], {"title": "یک تیکت", "detail": "پاسخ", "href": "/tickets"})
        self.assertFalse(shop["owner"])
        self.assertIsNone(owner["ticket_alert"])

    async def test_the_shell_tells_a_secondary_admin_what_credentials_are_missing(self) -> None:
        self.session.add(PgStaffAccess(pg_username="sam", web_username="sam", web_password_hash=HASH_SECRET, is_active=True))
        await self.session.commit()
        staff = {"role": "pg_staff", "username": "sam", "pg_admin_username": "sam", "pg_permissions": ["pg_overview"]}
        response = await self.get(staff, "/api/panel/pg")
        self.assertEqual(response.json()["remediation"], {"username_aligned": True, "credentials_ready": False, "can_self_serve": True})
        self.assertNotIn(HASH_SECRET, response.text)

    async def test_the_owner_sees_the_panel_wide_figures(self) -> None:
        body = (await self.get(OWNER, "/api/panel/pg/widgets")).json()
        self.assertTrue(body["owner"])
        self.assertEqual(body["version"], "1.4.0")
        self.assertEqual(body["counts"]["total"], 40)
        self.assertEqual(body["counts"]["online"], 3)
        self.assertEqual(body["facts"], {"admins": 2, "groups": 1, "hosts": 3, "nodes": 2})
        self.assertEqual((body["nodes_connected"], body["nodes_total"]), (1, 2))
        self.assertEqual(body["host"]["cpu_percent"], 41)
        self.assertEqual([n["name"] for n in body["nodes"]], ["Berlin", "Paris"])
        self.assertEqual(body["live"]["rate_up"], 1024)
        self.assertEqual([s["key"] for s in body["segments"]], ["active", "expired"])
        for secret in (KEY_SECRET, CA_SECRET):
            self.assertNotIn(secret, str(body))

    async def test_a_shop_never_receives_panel_wide_figures_nor_touches_the_owner_client(self) -> None:
        shop_overview = {
            "ready": True,
            "error": None,
            "username": "shop_a",
            "status_label": "فعال",
            "status_badge": "active",
            "users": {"label": "کاربران", "has_limit": True, "pct": 10.0, "remain_pct": 90.0, "tone": "ok", "exhausted": False, "used_text": "1", "limit_text": "10", "remain_text": "9", "ratio_text": "1/10"},
            "traffic": None,
            "constraints": [{"label": "HWID", "value_text": "2"}],
            "lifetime_text": None,
            "user_stats": {"total": 5, "online": 1, "active": 4, "expired": 1, "limited": 0, "disabled": 0, "on_hold": 0},
        }
        with patch("app.services.pg_overview_panel.build_reseller_pg_overview", AsyncMock(return_value=shop_overview)):
            response = await self.get(SHOP_A, "/api/panel/pg/widgets")
        body = response.json()
        self.assertFalse(body["owner"])
        for key in ("version", "facts", "host", "live", "nodes", "nodes_total"):
            self.assertNotIn(key, body)
        self.assertEqual(body["counts"]["total"], 5)
        self.assertEqual(body["limits"]["username"], "shop_a")
        self.assertEqual(body["limits"]["users"]["ratio_text"], "1/10")
        self.pg.get_system_stats.assert_not_awaited()
        self.pg.get_nodes.assert_not_awaited()
        self.assertNotIn("user_stats", body)

    async def test_an_unreadable_shop_account_shows_a_safe_reason(self) -> None:
        unreadable = {"ready": False, "error": "Traceback: password=hunter2", "username": "shop_a", "user_stats": None}
        with patch("app.services.pg_overview_panel.build_reseller_pg_overview", AsyncMock(return_value=unreadable)):
            response = await self.get(SHOP_A, "/api/panel/pg/widgets")
        self.assertNotIn("hunter2", response.text)
        body = response.json()
        self.assertFalse(body["ready"])
        self.assertIsNone(body["limits"])
        self.assertTrue(body["account_error"])

    async def test_a_hanging_panel_returns_what_arrived_within_the_deadline(self) -> None:
        async def hang(**kwargs: object) -> dict[str, Any]:
            await asyncio.sleep(30)
            return {}

        self.pg.get_system_stats = AsyncMock(side_effect=hang)
        with patch.object(pg_overview_panel, "WIDGETS_TIMEOUT_SEC", 0.05):
            response = await self.get(OWNER, "/api/panel/pg/widgets")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["counts"]["total"], 0)
        self.assertIsNone(body["host"])

    async def test_a_failing_stats_call_flags_the_error_and_keeps_the_rest(self) -> None:
        self.pg.get_system_stats = AsyncMock(side_effect=RuntimeError("boom internal"))
        response = await self.get(OWNER, "/api/panel/pg/widgets")
        body = response.json()
        self.assertEqual(body["error"], pg_overview_panel.PG_STATS_ERROR)
        self.assertNotIn("boom internal", response.text)
        self.assertEqual(body["facts"]["admins"], 2)

    async def test_the_last_good_notice_comes_with_the_widgets(self) -> None:
        self.budget_failure = "timeout"
        notice = (await self.get(OWNER, "/api/panel/pg/widgets")).json()["notice"]
        self.assertEqual(notice, {"kind": "unavailable", "minutes": 0})


def seed_plans() -> list[ResellerPlan]:
    return [
        ResellerPlan(id=1, name="Monthly", plan_kind="subscription", billing_mode="fixed", duration_days=30, is_active=True),
        ResellerPlan(id=2, name="PAYG", plan_kind="subscription", billing_mode="payg", price_per_gb=1500, is_active=True),
        ResellerPlan(id=3, name="Old", plan_kind="subscription", is_active=False),
        ResellerPlan(id=4, name="Extra volume", plan_kind="addon_volume", is_active=True),
    ]


class AdminsTests(InfraCase):
    async def asyncSetUp(self) -> None:
        await super().asyncSetUp()
        self.pg.admins = [
            {"id": 1, "username": "root", "role": {"id": 1, "name": "Owner"}, "status": "active", "total_users": 4, "max_users": 10, "used_traffic": GB, "data_limit": 5 * GB, "password": "LEAKED-PW"},
            {"id": 2, "username": "Sam", "role_id": 2, "is_sudo": False, "note": "staff note"},
            {"id": 3, "username": "rex", "role": {"id": 2, "name": "Seller"}, "total_users": 1},
            {"id": 4, "username": "eve", "total_users": 0},
        ]
        self.pg.details = {"sam": {"total_users": 7, "max_users": 20, "used_traffic": 2 * GB, "data_limit": 10 * GB, "lifetime_used_traffic": 9 * GB}}
        self.session.add_all(seed_plans())
        await self.session.flush()
        self.session.add_all(
            [
                ResellerProfile(user_id=40, pg_admin_username="rex", web_username="rex", web_password_hash=HASH_SECRET, is_active=True),
                PgStaffAccess(pg_username="sam", web_username="sam", web_password_hash=HASH_SECRET, is_active=True, note="staff note"),
            ]
        )
        await self.session.commit()

    async def test_admins_carry_usage_and_how_each_reaches_the_web_panel_without_secrets(self) -> None:
        response = await self.get(OWNER, "/api/panel/pg/admins")
        self.assertEqual(response.status_code, 200)
        for secret in (HASH_SECRET, "LEAKED-PW", '"password"', "web_password_hash"):
            self.assertNotIn(secret, response.text)
        by_name = {a["username"]: a for a in response.json()["admins"]}
        self.assertEqual(set(by_name), {"root", "Sam", "rex", "eve"})
        self.assertEqual(by_name["root"]["web"]["source"], "owner")
        self.assertEqual(by_name["Sam"]["web"]["source"], "pg_staff")
        self.assertEqual(by_name["Sam"]["web"]["note"], "staff note")
        self.assertFalse(by_name["Sam"]["web"]["credentials_ready"])
        self.assertEqual(by_name["rex"]["web"]["source"], "reseller")
        self.assertEqual(by_name["rex"]["web"]["reseller_user_id"], 40)
        self.assertEqual(by_name["eve"]["web"]["source"], "none")
        self.assertEqual(by_name["root"]["role_name"], "Owner")
        self.assertTrue(by_name["root"]["users_text"].startswith("۴") or "4" in by_name["root"]["users_text"])

    async def test_an_admin_the_list_gave_no_usage_for_is_read_individually_and_a_failed_read_shows_a_dash(self) -> None:
        by_name = {a["username"]: a for a in (await self.get(OWNER, "/api/panel/pg/admins")).json()["admins"]}
        # «Sam» had no usage in the list: the panel is asked for that one admin.
        self.pg.get_admin.assert_any_await("sam")
        self.assertIsNotNone(by_name["Sam"]["lifetime_text"])
        self.assertNotEqual(by_name["Sam"]["traffic_text"], "—")
        # «eve» has a user count in the list, «root» and «rex» too: never fetched one by one.
        fetched = {call.args[0] for call in self.pg.get_admin.await_args_list}
        self.assertEqual(fetched, {"sam"})

    async def test_individual_reads_run_a_few_at_a_time_not_all_at_once(self) -> None:
        self.pg.admins = [{"id": i, "username": f"u{i}"} for i in range(1, 31)]
        body = (await self.get(OWNER, "/api/panel/pg/admins")).json()
        self.assertEqual(len(body["admins"]), 30)
        self.assertLessEqual(self.pg.peak, pg_admins_panel.DETAIL_CONCURRENCY)
        self.assertGreater(self.pg.peak, 1)

    async def test_the_list_is_bounded(self) -> None:
        self.pg.admins = [{"id": i, "username": f"u{i}", "total_users": 1} for i in range(1, pg_admins_panel.MAX_ADMINS + 30)]
        body = (await self.get(OWNER, "/api/panel/pg/admins")).json()
        self.assertEqual(len(body["admins"]), pg_admins_panel.MAX_ADMINS)

    async def test_the_owner_role_is_never_offered_for_a_new_admin(self) -> None:
        body = (await self.get(OWNER, "/api/panel/pg/admins")).json()
        self.assertEqual(body["roles"], [{"id": 2, "name": "Seller"}])

    async def test_each_form_is_offered_only_the_plans_it_may_use(self) -> None:
        plans = (await self.get(OWNER, "/api/panel/pg/admins")).json()["plans"]
        self.assertEqual([p["name"] for p in plans["create"]], ["Monthly", "PAYG"])
        grant_names = [p["name"] for p in plans["grant"]]
        self.assertNotIn("Old", grant_names)
        self.assertNotIn("Extra volume", grant_names)
        self.assertIn("ظرفیت فعلی", grant_names)
        current = next(p for p in plans["grant"] if p["plan_kind"] == "current_capacity")
        self.assertEqual(plans["grant_default_id"], current["id"])

    async def test_the_create_form_is_offered_every_reseller_permission(self) -> None:
        from app.services.resellers import FEATURE_PERMS

        body = (await self.get(OWNER, "/api/panel/pg/admins")).json()
        self.assertEqual([(p["key"], p["label"]) for p in body["feature_perms"]], list(FEATURE_PERMS))

    async def test_only_the_explicit_owner_may_toggle_oversell(self) -> None:
        with patch("app.services.pg_admins_panel.is_explicit_owner_staff", return_value=False):
            self.assertFalse((await self.get(OWNER, "/api/panel/pg/admins")).json()["can_toggle_oversell"])
        with patch("app.services.pg_admins_panel.is_explicit_owner_staff", return_value=True):
            self.assertTrue((await self.get(OWNER, "/api/panel/pg/admins")).json()["can_toggle_oversell"])

    async def test_web_rows_of_admins_that_left_the_panel_are_dropped_on_load(self) -> None:
        self.session.add(PgStaffAccess(pg_username="gone", web_username="gone", web_password_hash=HASH_SECRET, is_active=True))
        await self.session.commit()
        await self.get(OWNER, "/api/panel/pg/admins")
        from sqlalchemy import select

        names = set((await self.session.scalars(select(PgStaffAccess.pg_username))).all())
        self.assertEqual(names, {"sam"})

    async def test_a_failing_panel_shows_a_safe_message_and_an_empty_list(self) -> None:
        self.pg.get_admins = AsyncMock(side_effect=RuntimeError("Traceback password=hunter2"))
        response = await self.get(OWNER, "/api/panel/pg/admins")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("hunter2", response.text)
        body = response.json()
        self.assertEqual(body["admins"], [])
        self.assertTrue(body["error"])


class PlanOptionTests(unittest.TestCase):
    def plan(self, plan_id: int, kind: str) -> dict[str, Any]:
        return {"id": plan_id, "name": f"p{plan_id}", "plan_kind": kind, "billing_mode": "fixed", "price_per_gb": 0, "duration_days": 0}

    def test_grant_falls_back_to_every_non_addon_plan_when_there_is_no_subscription_or_capacity_plan(self) -> None:
        options = pg_admins_panel.plan_options([self.plan(1, "other"), self.plan(2, "addon_users")])
        self.assertEqual([p["id"] for p in options["grant"]], [1])
        self.assertIsNone(options["grant_default_id"])

    def test_the_current_capacity_plan_is_the_default_grant(self) -> None:
        options = pg_admins_panel.plan_options([self.plan(1, "subscription"), self.plan(2, "current_capacity")])
        self.assertEqual(options["grant_default_id"], 2)
        self.assertEqual([p["id"] for p in options["create"]], [1])


class SafeErrorTests(unittest.TestCase):
    def test_a_panel_answer_shows_its_persian_message_and_anything_else_the_fallback(self) -> None:
        self.assertEqual(safe_pg_error(PasarGuardError("اجازه این عمل را ندارید"), fallback="x"), "اجازه این عمل را ندارید")
        self.assertEqual(safe_pg_error(RuntimeError("حتی متن فارسی از خطای داخلی نشان داده نمی‌شود"), fallback="x"), "x")
        self.assertEqual(safe_pg_error(ValueError("db password=hunter2"), fallback="x"), "x")

    def test_a_service_message_is_shown_only_as_persian_text_without_secrets(self) -> None:
        self.assertEqual(safe_persian_text("ادمین پاسارگارد تنظیم نشده است", fallback="x"), "ادمین پاسارگارد تنظیم نشده است")
        self.assertEqual(safe_persian_text("some english internal detail", fallback="x"), "x")
        self.assertNotIn("hunter2", safe_persian_text("خطا password=hunter2", fallback="x"))


class NodeCapabilityTests(unittest.TestCase):
    def test_a_grant_in_the_session_or_the_role_matrix_counts(self) -> None:
        with patch("app.services.pg_nodes_panel.staff_pg_action", MagicMock(side_effect=lambda staff, resource, action: action == "delete")):
            can = pg_nodes_panel.node_capabilities({"pg_actions": {"nodes": {"reconnect": True}}})
        self.assertEqual(can, {"reconnect": True, "create": False, "update": False, "delete": True})


if __name__ == "__main__":
    unittest.main()
