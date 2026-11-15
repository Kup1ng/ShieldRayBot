"""Web connection tests share bot rules, isolate shops and keep secrets private."""

from __future__ import annotations

import json
import unittest
from urllib.parse import parse_qs, urlsplit
from collections.abc import AsyncIterator
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import FastAPI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from connection_monitor_support import MonitorDatabaseCase, OWNER_STAFF, subscription_fixture_key

from app.api.app import create_api_app, render
from app.api.connection_status_pages import register_connection_status_pages
from app.api.panel_ops_api import register_panel_ops_api
from app.db.models import ConnectionMonitorSnapshot, ConnectionMonitorState, ConnectionMonitorTarget, OrgPrincipal, UserService
from app.services.connection_monitor_settings import set_monitor_account
from app.services.connection_monitor_preferences import pause_monitor_target, save_monitor_preferences
from app.services.connection_monitor_access import MonitorAccess
from app.services.connection_monitor_accounts import ACCOUNT_MESSAGES
from app.services.connection_monitor_preferences import MonitorPreferences
from app.services.connection_status import public_connection_page
from app.services.connection_status_texts import (
    LATIN_MIXED_MONITOR_TEXTS, LEGACY_HOST_PROMPTS, LEGACY_HOST_STATUS_TEXTS, LEGACY_MONITOR_TEXTS,
    MONITOR_TEXT_DEFAULTS, REASON_LABELS, readable_monitor_texts,
)
from app.services.users import clear_settings_cache, get_all_settings, set_settings_bulk
from app.services.pasarguard import PasarGuardError


TOKEN = "synthetic-monitor-token-123456"


class MonitorWebTests(MonitorDatabaseCase):
    async def test_previous_host_prompts_become_config_prompts_without_overriding_custom_text(self) -> None:
        async with self.Session() as session:
            await set_settings_bulk(session, {**LEGACY_HOST_PROMPTS, "connection_status_name_prompt": "نام دلخواه"})
            ui = await get_all_settings(session)
            self.assertEqual(ui["connection_status_name_prompt"], "نام دلخواه")
            self.assertEqual(ui["connection_status_order_prompt"], MONITOR_TEXT_DEFAULTS["connection_status_order_prompt"])

    async def test_subscription_cards_show_protocol_transport_security_and_keep_native_names_as_plain_data(self) -> None:
        await self.attach()
        native = self.panel.subscription_xray.return_value
        native[0]["remarks"] = '<script>alert("name")</script>'
        native[0]["outbounds"][0]["streamSettings"] = {
            "network": "xhttp", "security": "tls", "tlsSettings": {"serverName": "tls.example"},
            "xhttpSettings": {"path": "/upload", "mode": "auto"},
        }
        native.append({"remarks": "Shadowsocks config", "outbounds": [{
            "tag": "proxy", "protocol": "shadowsocks", "settings": {"servers": [{
                "address": "ss.example", "port": 8388, "method": "chacha20-ietf-poly1305", "password": "synthetic-hidden-password",
            }]},
        }]})
        response = await self.hosts()
        self.assertEqual(response.status_code, 200)
        choices = response.json()["choices"]
        details = {value for choice in choices for value in (choice["protocol"], choice["transport"], choice["security"])}
        self.assertTrue({"vless", "xhttp", "tls", "shadowsocks", "tcp"} <= details, details)
        # The name is plain data: the React page escapes it, the server never builds markup from it.
        self.assertEqual(choices[0]["name"], native[0]["remarks"])
        self.assertEqual(next(choice["port"] for choice in choices if choice["protocol"] == "shadowsocks"), 8388)
        self.assertNotIn("synthetic-hidden-password", response.text)
        self.assertNotIn("11111111-1111-4111-8111-111111111111", response.text)
        self.assertTrue(all(choice["config_key"] for choice in choices))
        self.panel.get_hosts.assert_not_awaited()

    async def test_unsupported_subscription_entry_keeps_its_position_with_an_explanation(self) -> None:
        await self.attach()
        self.panel.subscription_xray.return_value[0]["outbounds"][0]["protocol"] = "freedom"
        response = await self.hosts()
        self.assertEqual(response.status_code, 200)
        first, second = response.json()["choices"][:2]
        self.assertIn("نام متغیر 1", first["name"])
        self.assertIn("نام متغیر 2", second["name"])
        self.assertLess(first["position"], second["position"])
        self.assertTrue(first["issue"])
        self.assertEqual(second["issue"], "")

    async def asyncSetUp(self) -> None:
        await super().asyncSetUp()
        self.staff = dict(OWNER_STAFF)
        fixture = json.loads((Path(__file__).parent / "fixtures/connection_monitor_catalog.json").read_text())
        self.panel = SimpleNamespace(
            get_current_admin=AsyncMock(side_effect=AssertionError("Owner API must not be called")),
            get_user_by_username=AsyncMock(return_value={
                "id": 900, "username": "Monitor-Only", "status": "active", "admin": None,
                "used_traffic": 0, "data_limit": 0, "expire": None,
                "subscription_url": f"https://panel.example/sub/{TOKEN}",
            }),
            get_user_by_id=AsyncMock(), get_hosts=AsyncMock(return_value=fixture["hosts"]),
            get_inbounds_details=AsyncMock(return_value=fixture["inbounds"]),
            subscription_xray=AsyncMock(return_value=fixture["native_configs"]),
        )
        self.panel.get_user_by_id.return_value = self.panel.get_user_by_username.return_value
        for patcher in (
            patch("app.services.connection_monitor_accounts.get_pg", return_value=self.panel),
            patch("app.services.connection_monitor_panel.get_pg", return_value=self.panel),
            patch("app.services.secret_box._root_secret", return_value=b"synthetic-test-root-never-production"),
            patch("app.services.connection_monitor_admin.XrayBinary.verify", return_value=Path("/synthetic/xray")),
            patch("app.services.connection_status_panel.get_settings", return_value=SimpleNamespace(
                connection_monitor_xray_path="/synthetic/xray", connection_monitor_xray_sha256="a" * 64)),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)

        async def get_db() -> AsyncIterator[AsyncSession]:
            async with self.Session() as session:
                yield session

        self.app = FastAPI()
        register_connection_status_pages(self.app, render=render, require_staff=lambda: self.staff, get_db=get_db)
        register_panel_ops_api(
            self.app, require_staff=lambda: self.staff, require_admin=lambda: self.staff,
            require_perm=lambda _perm: (lambda: self.staff), require_pg_perm=lambda _perm: (lambda: self.staff), get_db=get_db,
        )
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://test")
        clear_settings_cache()
        self.addCleanup(clear_settings_cache)

    async def asyncTearDown(self) -> None:
        await self.client.aclose()
        await super().asyncTearDown()

    async def attach(self) -> None:
        response = await self.client.post("/connection-status/account", data={"username": "monitor-only"})
        self.assertEqual(response.status_code, 303, response.text)
        self.assertNotIn("error=", response.headers["location"])

    async def status(self) -> dict:
        response = await self.client.get("/api/panel/connection-status")
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    async def hosts(self) -> httpx.Response:
        return await self.client.get("/api/panel/connection-status/hosts")

    async def select_host(self) -> int:
        await self.attach()
        response = await self.client.post(f"/connection-status/configs/{subscription_fixture_key()}")
        self.assertEqual(response.status_code, 303)
        self.assertNotIn("error=", response.headers["location"])
        async with self.Session() as session:
            return await session.scalar(select(ConnectionMonitorTarget.id))

    async def test_active_hosts_refuse_a_revoked_link_and_keep_the_account_controls_available(self) -> None:
        await self.attach()
        self.panel.subscription_xray.side_effect = PasarGuardError(TOKEN, 404)
        response = await self.hosts()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["error"], ACCOUNT_MESSAGES["account_changed"])
        self.assertEqual(response.json()["choices"], [])
        self.assertNotIn(TOKEN, response.text)
        # The account card still loads from local data.
        self.assertTrue((await self.status())["settings"]["has_account"])

    async def test_active_hosts_load_after_the_panel_regenerates_the_same_users_link(self) -> None:
        await self.attach()
        self.panel.get_user_by_id.return_value = {
            **self.panel.get_user_by_username.return_value,
            "subscription_url": "https://panel.example/sub/newly-issued-token-123456",
        }
        response = await self.hosts()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["error"], "")
        self.assertIn("نام متغیر 1", response.json()["choices"][0]["name"])
        self.panel.subscription_xray.assert_awaited_once_with(TOKEN, subscription_url=self.panel.get_user_by_id.return_value["subscription_url"])
        self.assertNotIn(TOKEN, response.text)

    async def test_empty_page_data_has_no_targets_and_makes_no_panel_calls_or_secrets(self) -> None:
        response = await self.client.get("/api/panel/connection-status")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), {
            "settings": {"has_account": False, "username": "", "enabled": False},
            "binary_configured": True, "targets": [], "next_id": None,
        })
        self.panel.get_current_admin.assert_not_called()
        self.panel.get_hosts.assert_not_called()
        self.panel.get_user_by_username.assert_not_called()
        self.assertNotIn(TOKEN, response.text)

    async def test_register_select_publish_queue_and_pause_use_the_shared_services(self) -> None:
        target_id = await self.select_host()
        response = await self.hosts()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["total_count"], len(response.json()["choices"]))
        self.panel.subscription_xray.assert_awaited()
        response = await self.client.post("/connection-status/runtime", data={"enabled": "1"})
        self.assertNotIn("error=", response.headers["location"])
        hostile_name = '<script>alert("host")</script>'
        response = await self.client.post(f"/connection-status/targets/{target_id}", data={
            "public_name": hostile_name, "display_order": "7", "is_public": "1", "host_id": "72", "shop_id": "2",
        })
        self.assertNotIn("error=", response.headers["location"])
        async with self.Session() as session:
            target = await session.get(ConnectionMonitorTarget, target_id)
            self.assertEqual((target.subscription_key, target.pg_host_id, target.reseller_id, target.public_name, target.display_order, target.is_public),
                             (subscription_fixture_key(), None, None, hostile_name, 7, True))
            state = await session.scalar(select(ConnectionMonitorState))
            state.catalog_synced_at = self.now
            for row in (await session.scalars(select(ConnectionMonitorSnapshot))).all():
                row.status, row.checked_at, row.delay_ms = "healthy", self.now, 123
            await session.commit()
            public = await public_connection_page(session, now=self.now)
            self.assertEqual(public.entries[0].public_name, hostile_name)
        before_calls = self.panel.get_hosts.await_count
        response = await self.client.get("/api/panel/connection-status")
        self.assertEqual(self.panel.get_hosts.await_count, before_calls)
        target = response.json()["targets"][0]
        # Plain data: the React page escapes it, the server never builds markup from it.
        self.assertEqual(target["public_name"], hostile_name)
        self.assertEqual((target["status"], target["delay_ms"], target["is_public"]), ("healthy", 123, True))
        self.assertNotIn("منقضی", target["reason_text"])
        self.assertNotIn(TOKEN, response.text)
        response = await self.client.post(f"/connection-status/targets/{target_id}/check")
        self.assertNotIn("error=", response.headers["location"])
        async with self.Session() as session:
            self.assertTrue((await session.get(ConnectionMonitorTarget, target_id)).manual_pending)
        self.assertEqual(self.panel.get_hosts.await_count, before_calls)
        response = await self.client.post(f"/connection-status/targets/{target_id}/pause")
        self.assertNotIn("error=", response.headers["location"])
        async with self.Session() as session:
            target = await session.get(ConnectionMonitorTarget, target_id)
            self.assertFalse(target.test_enabled)
            self.assertFalse(target.is_public)

    async def test_private_name_can_be_empty_and_publication_without_name_is_rejected_atomically(self) -> None:
        target_id = await self.select_host()
        response = await self.client.post(f"/connection-status/targets/{target_id}", data={
            "public_name": "", "display_order": "5", "is_public": "0",
        })
        self.assertNotIn("error=", response.headers["location"])
        response = await self.client.post(f"/connection-status/targets/{target_id}", data={
            "public_name": "", "display_order": "9", "is_public": "1",
        })
        self.assertIn("error=", response.headers["location"])
        async with self.Session() as session:
            target = await session.get(ConnectionMonitorTarget, target_id)
            self.assertEqual((target.display_order, target.public_name, target.is_public), (5, "", False))

    async def test_a_stale_edit_form_cannot_restart_a_host_paused_during_the_request(self) -> None:
        target_id = await self.select_host()

        async def pause_before_save(session: AsyncSession, access: MonitorAccess, preferences: MonitorPreferences,
                                    *, expected_target_id: int | None = None) -> int:
            async with self.Session() as other:
                await pause_monitor_target(other, access, target_id=target_id)
            return await save_monitor_preferences(session, access, preferences, expected_target_id=expected_target_id)

        with patch("app.services.connection_monitor_actions.save_monitor_preferences", side_effect=pause_before_save):
            response = await self.client.post(f"/connection-status/targets/{target_id}", data={
                "public_name": "stale edit", "display_order": "9", "is_public": "0",
            })
        self.assertIn("error=", response.headers["location"])
        async with self.Session() as session:
            target = await session.get(ConnectionMonitorTarget, target_id)
            self.assertEqual((target.test_enabled, target.is_public, target.public_name), (False, False, ""))

    async def test_reseller_customer_legacy_admin_and_disabled_owner_cannot_read_or_mutate(self) -> None:
        for staff in ({"role": "reseller", "bot_user_id": 2, "permissions": ["connection_status_manage"]},
                      {"role": "user", "bot_user_id": 4}, {"role": "admin"},
                      {**OWNER_STAFF, "org_status": "disabled"}):
            self.staff.clear()
            self.staff.update(staff)
            for path, data in (("/connection-status/account", {"username": "monitor-only"}),
                               ("/connection-status/runtime", {"enabled": "1"}), (f"/connection-status/configs/{subscription_fixture_key()}", {}),
                               ("/connection-status/targets/1/check", {}), ("/connection-status/targets/1/pause", {}),
                               ("/connection-status/targets/1/delete", {}),
                               ("/connection-status/targets/1", {"public_name": "x", "display_order": "0", "is_public": "0"})):
                with self.subTest(staff=staff, path=path):
                    self.assertEqual((await self.client.post(path, data=data)).status_code, 403)
            for path in ("/connection-status", "/api/panel/connection-status", "/api/panel/connection-status/hosts"):
                with self.subTest(staff=staff, path=path):
                    self.assertEqual((await self.client.get(path)).status_code, 403)
        self.panel.get_hosts.assert_not_called()
        self.panel.get_user_by_username.assert_not_called()

    async def test_other_shop_target_cannot_be_edited_or_checked_by_id(self) -> None:
        await self.attach()
        async with self.Session() as session:
            session.add(ConnectionMonitorTarget(id=999, reseller_id=2, pg_host_id=41, test_enabled=True, public_name="other"))
            await session.commit()
        for suffix, data in (("", {"public_name": "changed", "display_order": "1", "is_public": "0"}),
                             ("/pause", {}), ("/check", {}), ("/delete", {})):
            response = await self.client.post("/connection-status/targets/999" + suffix, data=data)
            self.assertIn("error=", response.headers["location"])
        async with self.Session() as session:
            target = await session.get(ConnectionMonitorTarget, 999)
            self.assertEqual((target.public_name, target.test_enabled, target.is_public), ("other", True, False))

    async def test_panel_failure_keeps_local_status_and_returns_safe_errors(self) -> None:
        await self.select_host()
        self.panel.subscription_xray.side_effect = httpx.ConnectError(TOKEN)
        response = await self.hosts()
        self.assertEqual(response.status_code, 200)
        self.assertIn("ارتباط با پنل برقرار نشد", response.json()["error"])
        self.assertNotIn(TOKEN, response.text)
        status = await self.status()
        self.assertEqual(len(status["targets"]), 1)
        self.assertIn("status_label", status["targets"][0])

    async def test_invalid_values_are_rejected_without_partial_edits(self) -> None:
        target_id = await self.select_host()
        for value in ("-1", "2147483648", "nan", "true", "1.5"):
            response = await self.client.post(f"/connection-status/targets/{target_id}", data={
                "public_name": "changed", "display_order": value, "is_public": "0",
            })
            self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual((await self.client.get("/api/panel/connection-status?after=-1")).status_code, 422)
        self.assertEqual((await self.client.get("/api/panel/connection-status/hosts?offset=-1")).status_code, 422)
        async with self.Session() as session:
            self.assertEqual((await session.get(ConnectionMonitorTarget, target_id)).public_name, "")

    async def test_labels_the_page_shows_are_persian_without_latin_copy(self) -> None:
        await self.select_host()
        status = await self.status()
        hosts = (await self.hosts()).json()
        labels = [value for target in status["targets"] for value in (target["status_label"], target["reason_text"], target["checked_text"])]
        labels += [choice["issue"] for choice in hosts["choices"]]
        for latin in ("Test user", "Real delay", "Experimental", "Username", "PasarGuard", "subscription", "password"):
            for label in labels:
                self.assertNotIn(latin, label, latin)
        self.assertTrue(all(target["status_label"] for target in status["targets"]))

    async def test_missing_core_is_reported_as_not_configured_while_settings_stay_available(self) -> None:
        await self.attach()
        with patch("app.services.connection_status_panel.get_settings", return_value=SimpleNamespace(
            connection_monitor_xray_path="", connection_monitor_xray_sha256="")):
            status = await self.status()
        self.assertFalse(status["binary_configured"])
        self.assertTrue(status["settings"]["has_account"])
        self.assertFalse(status["settings"]["enabled"])

    async def test_status_badges_carry_no_telegram_emoji(self) -> None:
        target_id = await self.select_host()
        self.assertEqual((await self.client.post(f"/connection-status/targets/{target_id}/pause")).status_code, 303)
        target = (await self.status())["targets"][0]
        self.assertEqual((target["status"], target["status_label"].strip()), ("paused", "متوقف"))

    async def test_delete_removes_the_target(self) -> None:
        target_id = await self.select_host()
        response = await self.client.post(f"/connection-status/targets/{target_id}/delete")
        self.assertEqual(response.status_code, 303)
        self.assertNotIn("error=", response.headers["location"])
        async with self.Session() as session:
            self.assertIsNone(await session.get(ConnectionMonitorTarget, target_id))
            self.assertEqual(len((await session.scalars(select(ConnectionMonitorSnapshot))).all()), 0)
        self.assertEqual((await self.status())["targets"], [])

    async def test_web_rechecks_owner_after_the_panel_request(self) -> None:
        async def revoke(_username: str) -> dict[str, object]:
            async with self.Session() as session:
                owner = await session.get(OrgPrincipal, 1)
                owner.status = "disabled"
                await session.commit()
            return self.panel.get_user_by_id.return_value
        self.panel.get_user_by_username.side_effect = revoke
        response = await self.client.post("/connection-status/account", data={"username": "monitor-only"})
        self.assertIn("error=", response.headers["location"])
        async with self.Session() as session:
            self.assertIsNone((await session.scalar(select(ConnectionMonitorState))).pg_user_id)

    async def test_customer_test_user_is_rejected_with_an_actionable_error(self) -> None:
        async with self.Session() as session:
            session.add(UserService(bot_user_id=5, pg_user_id=900, pg_username="Monitor-Only", remark="customer"))
            await session.commit()
        response = await self.client.post("/connection-status/account", data={"username": "monitor-only"})
        message = parse_qs(urlsplit(response.headers["location"]).query)["error"][0]
        self.assertIn("یک کاربر جدا", message)
        self.assertNotIn(TOKEN, message)

    async def test_pasting_a_long_subscription_link_never_echoes_it_in_validation_errors(self) -> None:
        response = await self.client.post("/connection-status/account", data={
            "username": f"https://panel.example/sub/{TOKEN}" + "x" * 128,
        })
        self.assertNotIn(TOKEN, response.text)
        self.assertEqual(response.status_code, 303)
        self.assertNotIn(TOKEN, response.headers["location"])
        self.panel.get_user_by_username.assert_not_awaited()

    async def test_old_default_texts_are_readable_and_custom_settings_are_preserved(self) -> None:
        async with self.Session() as session:
            await set_settings_bulk(session, {**LEGACY_MONITOR_TEXTS, "menu_order": "shop,services", "connection_status_name_prompt": "نام دلخواه"})
            ui = await get_all_settings(session)
            self.assertEqual(ui["connection_status_account_prompt"], MONITOR_TEXT_DEFAULTS["connection_status_account_prompt"])
            self.assertEqual(ui["connection_status_name_prompt"], "نام دلخواه")
            self.assertEqual(ui["menu_order"], "shop,services")

    async def test_existing_test_user_can_be_registered_again_without_panel_owner_access(self) -> None:
        async with self.Session() as session:
            await set_monitor_account(session, self.access, username="monitor-only")
        await self.attach()
        async with self.Session() as session:
            self.assertEqual((await session.scalar(select(ConnectionMonitorState))).pg_username, "Monitor-Only")
        self.panel.get_current_admin.assert_not_awaited()

    async def test_real_panel_middleware_rejects_missing_csrf_and_accepts_the_valid_form(self) -> None:
        with patch("app.api.app.DATA_DIR", Path(self.temporary.name)):
            app = create_api_app()
        route = next(route for route in app.routes if getattr(route, "path", None) == "/connection-status")
        dependencies = list(route.dependant.dependencies)
        while dependencies:
            dependency = dependencies.pop()
            if dependency.call.__name__ == "require_staff":
                app.dependency_overrides[dependency.call] = lambda: self.staff
            elif dependency.call.__name__ == "get_db":
                async def get_db() -> AsyncIterator[AsyncSession]:
                    async with self.Session() as session:
                        yield session
                app.dependency_overrides[dependency.call] = get_db
            dependencies.extend(dependency.dependencies)
        with patch("app.api.app.is_setup_complete", return_value=True):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test",
                                         cookies={"session": "synthetic-session", "csrf": "synthetic-csrf"}) as client:
                denied = await client.post("/connection-status/account", data={"username": "monitor-only"}, headers={"Origin": "http://test"})
                self.assertEqual(denied.status_code, 403)
                self.panel.get_user_by_username.assert_not_awaited()
                accepted = await client.post("/connection-status/account", data={
                    "username": "monitor-only", "csrf_token": "synthetic-csrf",
                }, headers={"Origin": "http://test"})
        self.assertEqual(accepted.status_code, 303, accepted.text)
        self.assertNotIn("error=", accepted.headers["location"])


class MonitorTextDefaultsTests(unittest.TestCase):
    def test_untouched_latin_mixed_default_is_refreshed_and_custom_text_is_kept(self) -> None:
        key = "connection_status_account_prompt"
        refreshed = readable_monitor_texts({key: LATIN_MIXED_MONITOR_TEXTS[key]})
        self.assertEqual(refreshed[key], MONITOR_TEXT_DEFAULTS[key])
        custom = readable_monitor_texts({key: "متن دلخواه مدیر"})
        self.assertEqual(custom[key], "متن دلخواه مدیر")
        self.assertEqual(readable_monitor_texts({}), {})

    def test_host_wording_defaults_refresh_while_custom_copy_is_kept(self) -> None:
        refreshed = readable_monitor_texts(dict(LEGACY_HOST_STATUS_TEXTS))
        for key, previous in LEGACY_HOST_STATUS_TEXTS.items():
            self.assertEqual(refreshed[key], MONITOR_TEXT_DEFAULTS[key])
            self.assertNotEqual(refreshed[key], previous)
            self.assertIn("کانفیگ", refreshed[key])
        custom = readable_monitor_texts({
            "connection_status_title": "عنوان دلخواه مدیر",
            "connection_status_empty": "متن خالی دلخواه",
        })
        self.assertEqual(custom["connection_status_title"], "عنوان دلخواه مدیر")
        self.assertEqual(custom["connection_status_empty"], "متن خالی دلخواه")

    def test_new_defaults_use_persian_terms(self) -> None:
        for value in MONITOR_TEXT_DEFAULTS.values():
            for latin in ("Test user", "Username", "PasarGuard", "password", "token", "Real delay"):
                self.assertNotIn(latin, value)

    def test_invalid_catalog_reason_names_subscription_configs_not_hosts(self) -> None:
        label = REASON_LABELS["invalid_catalog"]
        self.assertEqual(label, "اطلاعات کانفیگ‌های اشتراک معتبر نیست.")
        self.assertNotIn("هاست", label)

