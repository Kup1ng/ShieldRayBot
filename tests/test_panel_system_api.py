"""JSON data of the React panel-system settings tabs: Owner only, no secrets, only what the screens show."""

from __future__ import annotations

import json
import unittest
from collections.abc import AsyncIterator
from contextlib import ExitStack
from typing import Any
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import FastAPI, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.api.panel_system_api import register_panel_system_api
from app.db.models import Base
from app.services import panel_system
from app.services.users import set_setting
from tests.pgtest import pg_engine

OWNER = {"role": "admin", "org_principal_id": 1, "org_depth": 0}
SHOP = {"role": "reseller", "bot_user_id": 7, "permissions": ["shop_settings"]}

BOT_TOKEN = "123456:BOT-TOKEN-SECRET-VALUE"
PG_PASSWORD = "PG-PASSWORD-SECRET"
PG_API_KEY = "PG-API-KEY-SECRET"
SEALED_BACKUP_TOKEN = "sealed:BACKUP-BOT-TOKEN-SECRET"
SECRETS = (BOT_TOKEN, PG_PASSWORD, PG_API_KEY, SEALED_BACKUP_TOKEN)

SETUP_VALUES = {
    "BOT_TOKEN": BOT_TOKEN,
    "PG_PASSWORD": PG_PASSWORD,
    "PG_API_KEY": PG_API_KEY,
    "WEB_PORT": "9100",
    "CURRENCY": "تومان",
    "PUBLIC_BASE_URL": "https://panel.example.com",
}
BACKUP_ROW = {
    "id": "20260101-000000",
    "filename": "pgclock-backup-20260101-000000.zip",
    "path": "/srv/secret-location/pgclock-backup-20260101-000000.zip",
    "size": 10,
    "size_human": "۱ KB",
    "mtime": "2026-01-01T00:00:00+00:00",
    "created_at": "2026-01-01T00:00:00+00:00",
    "app_version": "9.9.9",
    "include_env": True,
    "files": ["env/.env"],
    "sha256": "a" * 64,
    "note": "قبل از تغییر",
}
IDLE_RESTORE = {
    "state": "idle", "percent": 0, "step": "", "step_key": "", "message": "", "error": None, "safety_id": None,
    "awaiting_restart": False, "restart_required": False, "pre_boot_id": None,
    "actor": "web:owner", "source": "/srv/secret-location/source.zip",
}
CERT_STATUS = {
    "has_cert": True, "certbot": True, "certbot_path": "/usr/bin/certbot", "cert_path": "/data/ssl/fullchain.pem",
    "key_path": "/data/ssl/privkey.pem", "letsencrypt_live": "", "domain": "panel.example.com", "email": "a@example.com",
    "issued_at": None, "expires_at": "2027-01-01", "expired": False, "ssl_enabled": True, "self_signed": False,
    "mode": "letsencrypt", "last_error": None, "pending_domain": "", "pending_email": "", "public_https": "https://panel.example.com",
    "miniapp_domain": "", "pending_miniapp_domain": "", "public_miniapp": "https://panel.example.com/miniapp/",
    "web_port": 9100, "progress": {"pct": 40, "message": "در حال دریافت", "done": False, "ok": None, "restarting": False,
                                    "https_url": "", "updated_at": "internal"}, "running": True, "port80_busy": False,
}


def update_context(**overrides: Any) -> dict[str, Any]:
    context = {
        "update_info": {"remote_version": "9.9.9", "checked": True, "update_available": True, "label": "آماده", "repo_url": "x"},
        "status": {"state": "idle", "percent": 0, "log": ["git remote: https://token@example.com"], "message": "", "error": None,
                   "awaiting_restart": False, "restart_required": False, "pre_boot_id": None, "from_version": "1.0.0", "to_version": None},
        "local_version": "1.0.0",
        "steps": [],
        "changelog": {"title": "تغییرات", "blocks": [], "has_notes": False},
        "update_channel": "main",
        "update_channel_label": "پایدار",
        "update_channels": [{"id": "main", "label": "پایدار"}, {"id": "dev", "label": "توسعه"}],
        "deployed_channel_label": "پایدار",
        "migration_preflight": {"blocked": False, "tone": "ok", "label": "", "message": "", "channel": "main", "db_revision": "x"},
        "can_start_update": True,
        "channel_check_message": "آپدیت هست",
        "channel_check_tone": "warn",
    }
    context.update(overrides)
    return context


class SystemApiCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.engine = pg_engine()
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        self.session = async_sessionmaker(self.engine, expire_on_commit=False)()
        self.staff: dict[str, Any] = dict(OWNER)
        app = FastAPI()

        async def get_db() -> AsyncIterator[AsyncSession]:
            yield self.session

        async def require_admin() -> dict[str, Any]:
            if self.staff.get("role") != "admin":
                raise HTTPException(403)
            return self.staff

        register_panel_system_api(
            app, require_staff=require_admin, require_admin=require_admin, require_perm=lambda perm: require_admin,
            require_pg_perm=lambda perm: require_admin, get_db=get_db,
        )
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://panel.test")
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.stack.enter_context(patch("app.services.setup_wizard.current_setup_values", return_value=dict(SETUP_VALUES)))
        self.stack.enter_context(patch("app.services.pwa.write_pwa_meta"))
        self.stack.enter_context(patch("app.services.backup.list_backups", return_value=[dict(BACKUP_ROW)]))
        self.stack.enter_context(patch("app.services.backup.resolve_stale_restore_status", return_value=dict(IDLE_RESTORE)))
        self.stack.enter_context(patch("app.services.backup.read_restore_notice", return_value=["هشدار ریستور"]))
        self.stack.enter_context(patch("app.services.panel_system.cert_status", return_value=dict(CERT_STATUS)))

    async def asyncTearDown(self) -> None:
        await self.client.aclose()
        await self.session.close()
        await self.engine.dispose()

    async def get_json(self, path: str) -> dict[str, Any]:
        response = await self.client.get(path)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.headers["cache-control"], "private, no-store")
        for secret in SECRETS:
            self.assertNotIn(secret, response.text)
        return response.json()


class OwnerOnlyTests(SystemApiCase):
    PATHS = (
        "/api/panel/system/general",
        "/api/panel/system/pwa",
        "/api/panel/system/backup",
        "/api/panel/system/ssl",
        "/api/panel/system/update",
    )

    async def test_a_shop_owner_cannot_read_any_system_tab(self) -> None:
        self.staff = dict(SHOP)
        for path in self.PATHS:
            response = await self.client.get(path)
            self.assertEqual(response.status_code, 403, path)
            self.assertNotIn("panel.example.com", response.text)

    async def test_the_owner_reads_every_system_tab(self) -> None:
        with patch("app.services.panel_system.update_page_context", AsyncMock(return_value=update_context())):
            for path in self.PATHS:
                response = await self.client.get(path)
                self.assertEqual(response.status_code, 200, path)


class GeneralTabTests(SystemApiCase):
    async def test_only_the_three_editable_values_are_returned(self) -> None:
        data = await self.get_json("/api/panel/system/general")
        self.assertEqual(data, {"web_port": "9100", "currency": "تومان", "public_base_url": "https://panel.example.com"})


class BackupTabTests(SystemApiCase):
    async def test_backups_hide_server_paths_and_secrets(self) -> None:
        await set_setting(self.session, "backup_telegram_bot_token", SEALED_BACKUP_TOKEN)
        await set_setting(self.session, "backup_telegram_chat_ids", "12345")
        await self.session.commit()
        data = await self.get_json("/api/panel/system/backup")
        self.assertEqual(len(data["backups"]), 1)
        row = data["backups"][0]
        self.assertTrue(row["is_latest"])
        self.assertEqual(row["sha256_prefix"], "a" * 16)
        self.assertNotIn("path", row)
        self.assertNotIn("secret-location", json.dumps(data))
        self.assertEqual(data["restore_warnings"], ["هشدار ریستور"])

    async def test_the_backup_bot_token_is_reported_as_set_but_never_returned(self) -> None:
        await set_setting(self.session, "backup_telegram_bot_token", SEALED_BACKUP_TOKEN)
        await self.session.commit()
        data = await self.get_json("/api/panel/system/backup")
        fields = {field["key"]: field for group in data["groups"] for field in group["fields"]}
        token = fields["backup_telegram_bot_token"]
        self.assertTrue(token["secret_set"])
        self.assertEqual(token["value"], "")
        self.assertEqual(fields["backup_keep_count"]["options"][0], {"id": "5", "label": "۵ بکاپ"})

    async def test_restore_status_lists_only_the_progress_fields(self) -> None:
        data = await self.get_json("/api/panel/system/backup")
        self.assertNotIn("source", data["restore"])
        self.assertNotIn("actor", data["restore"])
        self.assertEqual(data["restore"]["state"], "idle")

    async def test_telegram_delivery_state_is_split_into_kind_and_message(self) -> None:
        await set_setting(self.session, "backup_telegram_last_status", "skipped: حجم زیاد است")
        await set_setting(self.session, "backup_telegram_last_at", "2026-01-01T10:20:30")
        await set_setting(self.session, "backup_last_verify_ok", "0")
        await self.session.commit()
        data = await self.get_json("/api/panel/system/backup")
        self.assertEqual(data["telegram"], {"kind": "skipped", "message": "حجم زیاد است", "at": "2026-01-01T10:20"})
        self.assertEqual(data["last_verify"], "failed")


class SslTabTests(SystemApiCase):
    async def test_certificate_state_and_progress_are_returned_without_internal_fields(self) -> None:
        data = await self.get_json("/api/panel/system/ssl")
        self.assertEqual(data["domain"], "panel.example.com")
        self.assertTrue(data["running"])
        self.assertEqual(data["progress"]["pct"], 40)
        self.assertNotIn("updated_at", data["progress"])

    async def test_the_domain_falls_back_to_the_public_address_before_any_certificate(self) -> None:
        status = {**CERT_STATUS, "domain": "", "has_cert": False}
        with patch("app.services.panel_system.cert_status", return_value=status):
            data = await self.get_json("/api/panel/system/ssl")
        self.assertEqual(data["domain"], "panel.example.com")


class PwaTabTests(SystemApiCase):
    async def test_pwa_identity_and_the_owner_brand_are_returned(self) -> None:
        await set_setting(self.session, "pwa_name", "فروشگاه من")
        await self.session.commit()
        data = await self.get_json("/api/panel/system/pwa")
        self.assertEqual(data["pwa"]["name_raw"], "فروشگاه من")
        self.assertTrue(data["pwa"]["icon_preview"].startswith("/pwa/icon/192?v="))
        self.assertEqual(data["brand"]["fallback_name"], "ShieldRay")
        self.assertIn("blue", {preset["key"] for preset in data["brand"]["presets"]})

    async def test_a_shop_brand_never_appears_in_the_owner_brand(self) -> None:
        from app.db.models import BotUser, ResellerSetting

        self.session.add(BotUser(id=7, telegram_id=107, referral_code="shop7", role="reseller"))
        await self.session.flush()
        self.session.add(ResellerSetting(reseller_user_id=7, key="panel_brand_name", value="Shop Seven"))
        await self.session.commit()
        data = await self.get_json("/api/panel/system/pwa")
        self.assertNotIn("Shop Seven", json.dumps(data))


class UpdateTabTests(SystemApiCase):
    async def test_update_payload_has_no_log_and_no_internal_preflight_fields(self) -> None:
        with patch("app.services.panel_system.update_page_context", AsyncMock(return_value=update_context())):
            data = await self.get_json("/api/panel/system/update")
        self.assertNotIn("log", data["status"])
        self.assertNotIn("token@example.com", json.dumps(data))
        self.assertEqual(set(data["migration"]), {"blocked", "tone", "label", "message"})
        self.assertTrue(data["can_start"])
        self.assertEqual([channel["id"] for channel in data["channels"]], ["main", "dev"])

    async def test_force_clears_the_update_cache_and_rechecks(self) -> None:
        loader = AsyncMock(return_value=update_context())
        with patch("app.services.panel_system.update_page_context", loader), patch("app.services.updates.clear_update_cache") as clear:
            await self.get_json("/api/panel/system/update")
            clear.assert_not_called()
            await self.get_json("/api/panel/system/update?force=1")
            clear.assert_called_once()
        self.assertEqual(loader.await_args_list[-1].kwargs, {"force_check": True})

    async def test_a_failing_tab_answers_a_safe_message_not_the_exception(self) -> None:
        with patch("app.services.panel_system.update_page_context", AsyncMock(side_effect=RuntimeError("secret boom /srv/x"))):
            response = await self.client.get("/api/panel/system/update")
        self.assertEqual(response.status_code, 500)
        self.assertNotIn("secret boom", response.text)


class ViewHelperTests(unittest.TestCase):
    def test_update_status_view_keeps_only_screen_fields(self) -> None:
        view = panel_system.update_status_view({"state": "running", "percent": 40, "log": ["x"], "from_version": "1"})
        self.assertEqual(view["state"], "running")
        self.assertNotIn("log", view)


if __name__ == "__main__":
    unittest.main()
