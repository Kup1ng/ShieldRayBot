"""Read models of the panel-system settings tabs (general, backup, PWA, SSL, update).

Each function returns only what its screen shows, never a secret: the bot token, panel passwords,
API keys and the sealed backup-bot token stay on the server. Blocking work (disk, sockets,
subprocesses) is meant to run through ``asyncio.to_thread`` at the call site.
"""

from __future__ import annotations

import asyncio
from typing import Any
from urllib.parse import urlparse

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.engine_url import pg_connection_parts
from app.services import backup as backup_service
from app.services import panel_brand, pwa
from app.services.panel_update import STEPS as UPDATE_STEPS
from app.services.panel_update import update_page_context
from app.services.ssl_certs import cert_status, normalize_domain
from app.services.users import SETTING_GROUPS, TAB_SETTING_GROUPS, get_all_settings

TELEGRAM_STATUS_KEY = "backup_telegram_last_status"
TELEGRAM_AT_KEY = "backup_telegram_last_at"
LAST_OK_KEY = "backup_last_ok_at"
LAST_VERIFY_KEY = "backup_last_verify_ok"
MAX_KEPT_BACKUPS = backup_service.MAX_BACKUPS
RESTORE_STATUS_FIELDS = (
    "state",
    "percent",
    "step",
    "step_key",
    "message",
    "error",
    "safety_id",
    "awaiting_restart",
    "restart_required",
    "pre_boot_id",
)
UPDATE_STATUS_FIELDS = (*RESTORE_STATUS_FIELDS, "from_version", "to_version")
SECRET_KIND = "password"


def general_payload() -> dict[str, Any]:
    """Port, currency and public address: the three values the General tab edits."""
    from app.services.setup_wizard import current_setup_values

    values = current_setup_values()
    return {
        "web_port": values.get("WEB_PORT") or "9000",
        "currency": values.get("CURRENCY") or "تومان",
        "public_base_url": values.get("PUBLIC_BASE_URL") or "",
    }


async def pwa_payload(session: AsyncSession) -> dict[str, Any]:
    """Web-app (PWA) identity plus the Owner's own panel brand for the same tab."""
    cfg = await pwa.load_pwa_settings(session)
    own = await panel_brand.load_own_values(session, None)
    effective = await panel_brand.load_brand(session, None)
    icon_path = await asyncio.to_thread(pwa.custom_icon_path)
    icon_version = int(icon_path.stat().st_mtime) if icon_path else 0
    return {
        "pwa": {
            "name": cfg["name"],
            "short_name": cfg["short_name"],
            "name_raw": cfg["name_raw"],
            "short_name_raw": cfg["short_name_raw"],
            "description_raw": cfg["description_raw"],
            "has_custom_icon": cfg["has_custom_icon"],
            "icon_preview": f"{cfg['icon_preview']}?v={icon_version}",
        },
        "brand": {
            "name": own["name"],
            "color": own["color"],
            "has_own_logo": bool(own["logo"]),
            "effective_name": effective.name,
            "effective_logo_url": effective.logo_url,
            "has_custom_logo": effective.has_custom_logo,
            "fallback_name": panel_brand.DEFAULT_NAME,
            "name_max": panel_brand.NAME_MAX,
            "logo_max_bytes": panel_brand.LOGO_MAX_BYTES,
            "default_color": {"label": panel_brand.DEFAULT_COLOR_LABEL, "swatch": panel_brand.DEFAULT_COLOR_HEX},
            "presets": [{"key": p.key, "label": p.label, "swatch": p.dark_brand} for p in panel_brand.PRESETS],
        },
    }


def _backup_row(item: dict[str, Any], *, is_latest: bool) -> dict[str, Any]:
    return {
        "id": item["id"],
        "filename": item["filename"],
        "created_at": item["created_at"],
        "size_human": item["size_human"],
        "app_version": item["app_version"],
        "note": item["note"],
        "include_env": item["include_env"],
        "sha256_prefix": (item["sha256"] or "")[:16],
        "is_latest": is_latest,
    }


def _field_view(field: tuple, values: dict[str, str]) -> dict[str, Any]:
    """One settings field of the schedule form; a secret only tells whether it is set."""
    key, label = field[0], field[1]
    kind = field[2] if len(field) > 2 else "text"
    help_text = field[3] if len(field) > 3 else ""
    options = field[4] if len(field) > 4 else []
    raw = values.get(key, "") or ""
    secret = kind == SECRET_KIND
    return {
        "key": key,
        "label": label,
        "kind": kind,
        "help": help_text,
        "options": [{"id": str(value), "label": str(text)} for value, text in options],
        "value": "" if secret else raw,
        "secret_set": bool(raw) if secret else False,
    }


def _schedule_groups(values: dict[str, str]) -> list[dict[str, Any]]:
    names = TAB_SETTING_GROUPS.get("backup") or []
    return [
        {"title": name, "fields": [_field_view(field, values) for field in SETTING_GROUPS[name]]}
        for name in names
        if name in SETTING_GROUPS
    ]


def _telegram_status(values: dict[str, str]) -> dict[str, str]:
    raw = (values.get(TELEGRAM_STATUS_KEY) or "").strip()
    if not raw:
        return {"kind": "none", "message": "", "at": ""}
    kind, _, rest = raw.partition(":")
    message = rest.strip() if rest else raw
    kind = kind.strip() if kind.strip() in {"ok", "skipped"} else "error"
    return {"kind": kind, "message": message, "at": (values.get(TELEGRAM_AT_KEY) or "")[:16]}


def _verify_state(values: dict[str, str]) -> str:
    return {"1": "ok", "0": "failed"}.get(values.get(LAST_VERIFY_KEY) or "", "unknown")


def restore_status_view(status: dict[str, Any]) -> dict[str, Any]:
    return {field: status.get(field) for field in RESTORE_STATUS_FIELDS}


def update_status_view(status: dict[str, Any]) -> dict[str, Any]:
    return {field: status.get(field) for field in UPDATE_STATUS_FIELDS}


def _database_label() -> str:
    """The PostgreSQL database as host:port/name, never with its credentials."""
    try:
        parts = pg_connection_parts(get_settings().database_url)
    except ValueError:
        return ""
    return f"postgresql://{parts['host']}:{parts['port']}/{parts['dbname']}"


async def backup_payload(session: AsyncSession) -> dict[str, Any]:
    """Backups, restore progress, the schedule form and Telegram delivery state."""
    from app.services.updates import local_version

    values = await get_all_settings(session)
    backups = await asyncio.to_thread(backup_service.list_backups)
    restore = await asyncio.to_thread(backup_service.resolve_stale_restore_status)
    warnings = await asyncio.to_thread(backup_service.read_restore_notice)
    return {
        "local_version": local_version(),
        "db_path": _database_label(),
        "max_backups": MAX_KEPT_BACKUPS,
        "last_auto_backup_at": values.get(LAST_OK_KEY) or "",
        "last_verify": _verify_state(values),
        "backups": [_backup_row(item, is_latest=index == 0) for index, item in enumerate(backups)],
        "restore": restore_status_view(restore),
        "restore_warnings": warnings,
        "restore_steps": [{"key": key, "label": label} for key, label, _ in backup_service.RESTORE_STEPS],
        "telegram": _telegram_status(values),
        "groups": _schedule_groups(values),
    }


def _panel_domain_fallback() -> str:
    """The domain from the public address when no certificate named one yet."""
    from app.services.setup_wizard import current_setup_values

    public = (current_setup_values().get("PUBLIC_BASE_URL") or "").strip()
    if not public:
        return ""
    host = urlparse(public if "://" in public else f"https://{public}").hostname or ""
    return normalize_domain(host)


def ssl_payload() -> dict[str, Any]:
    """Certificate state, pending issue hints and the progress of a running job."""
    status = cert_status()
    domain = status["domain"] or _panel_domain_fallback()
    progress = status["progress"] or {}
    return {
        "domain": domain,
        "email": status["email"],
        "pending_domain": status["pending_domain"],
        "pending_email": status["pending_email"],
        "miniapp_domain": status["miniapp_domain"],
        "pending_miniapp_domain": status["pending_miniapp_domain"],
        "public_miniapp": status["public_miniapp"],
        "public_https": status["public_https"],
        "has_cert": status["has_cert"],
        "ssl_enabled": status["ssl_enabled"],
        "expired": status["expired"],
        "self_signed": status["self_signed"],
        "mode": status["mode"],
        "certbot": status["certbot"],
        "certbot_path": status["certbot_path"] or "",
        "port80_busy": status["port80_busy"],
        "running": status["running"],
        "web_port": status["web_port"],
        "issued_at": status["issued_at"],
        "expires_at": status["expires_at"],
        "cert_path": status["cert_path"],
        "key_path": status["key_path"],
        "letsencrypt_live": status["letsencrypt_live"],
        "last_error": status["last_error"],
        "progress": {
            "pct": progress.get("pct", 0),
            "message": progress.get("message", ""),
            "done": bool(progress.get("done", True)),
            "ok": progress.get("ok"),
            "restarting": bool(progress.get("restarting")),
            "https_url": progress.get("https_url", ""),
        },
    }


async def update_payload(*, force: bool) -> dict[str, Any]:
    """Versions, channels, migration check, changelog and update progress."""
    from app.services.updates import clear_update_cache

    if force:
        # The CDN and the in-process cache would hide a release published a minute ago.
        clear_update_cache()
    ctx = await update_page_context(force_check=force)
    info = ctx["update_info"]
    return {
        "local_version": ctx["local_version"],
        "remote_version": info.get("remote_version"),
        "checked": bool(info.get("checked")),
        "update_available": bool(info.get("update_available")),
        "label": info.get("label") or "",
        "channel": ctx["update_channel"],
        "channel_label": ctx["update_channel_label"],
        "channels": ctx["update_channels"],
        "deployed_channel_label": ctx["deployed_channel_label"],
        "migration": migration_view(ctx["migration_preflight"]),
        "can_start": bool(ctx["can_start_update"]),
        "changelog": ctx["changelog"],
        "check_message": ctx["channel_check_message"],
        "check_tone": ctx["channel_check_tone"],
        "status": update_status_view(ctx["status"]),
        "steps": [{"key": key, "label": label} for key, label, _ in UPDATE_STEPS],
    }


def migration_view(preflight: dict[str, Any]) -> dict[str, Any]:
    return {
        "blocked": bool(preflight.get("blocked")),
        "tone": preflight.get("tone") or "",
        "label": preflight.get("label") or "",
        "message": preflight.get("message") or "",
    }
