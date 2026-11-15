"""Describes bot-settings forms (tabs, groups, fields) as JSON for the React panel.

The forms still post the existing settings handlers with ``s_<key>`` fields; this module only turns the
``SETTING_GROUPS`` catalogue and the saved values into plain data. Secret values are never included, only
whether one is saved.
"""

from __future__ import annotations

import re
from typing import Any

from app.services.settings_button_labels import PLATFORM_ONLY_BTN_KEYS
from app.services.settings_tab_groups import SettingsTabGroup
from app.services.screen_titles import SCREEN_TEXT_TAB, platform_only_screen_text_keys
from app.services.users import (
    SECRET_KEYS,
    SETTING_GROUPS,
    SETTING_VISIBILITY,
    TAB_SETTING_GROUPS,
    normalize_force_join_channel_value,
)

TRUE_VALUES = frozenset({"1", "true", "yes", "on"})
FORCE_JOIN_GROUP = "کانال اجباری"
TERMS_GROUP = "قوانین ورود به ربات"
USER_ALERT_GROUP = "هشدار سرویس کاربر"
USER_ALERT_CAPTION = "هشدار خودکار برای مشتری‌های فروشگاه شما وقتی حجم یا زمان سرویس رو به اتمام است."
IMPORT_ADMINS_GROUP = "مسیرها و ادمین‌های مجاز"
# A group's own warning, drawn inside its box under the title.
GROUP_NOTICES = {FORCE_JOIN_GROUP: "forcejoin", TERMS_GROUP: "terms"}
MONEY_NUMBER_KEYS = frozenset({"referral_bonus", "stars_toman_per_star", "billing_price_per_gb", "billing_low_balance"})
PERCENT_KEYS = frozenset({"user_alert_low_traffic_pct", "user_alert_low_time_pct"})
MONEY_LIST_KEYS = frozenset({"wallet_topup_presets"})
LIST_PLACEHOLDERS = {"wallet_topup_presets": "50000", "service_import_paths": "/sub", "service_import_admins": "admin"}
_MEDIA_PATH = re.compile(r"^[\w.\-]+(?:/[\w.\-]+)*$")


def media_url(stored: str) -> str:
    """The panel URL of an uploaded file, or "" for anything that is not a plain relative path."""
    path = (stored or "").strip()
    if not path or ".." in path or not _MEDIA_PATH.fullmatch(path):
        return ""
    return f"/media/{path}"


def field_payload(field: tuple, values: dict[str, str]) -> dict[str, Any]:
    """One settings field: its kind, saved value and the rule that hides it."""
    key, label = field[0], field[1]
    kind = field[2] if len(field) > 2 else "text"
    help_text = field[3] if len(field) > 3 else ""
    options = field[4] if len(field) > 4 else []
    raw = str(values.get(key, "") or "")
    payload: dict[str, Any] = {"key": key, "label": label, "kind": kind, "help": help_text, "options": [], "value": raw}
    if kind == "toggle":
        payload["value"] = raw in TRUE_VALUES
    elif kind == "password" or key in SECRET_KEYS:
        payload["value"] = ""
        payload["has_value"] = bool(raw)
    elif kind == "select":
        payload["options"] = [{"value": value, "label": text} for value, text in options]
        payload["value"] = raw or (options[0][0] if options else "")
    elif kind == "image":
        payload["preview_url"] = media_url(raw)
    elif kind == "force_channels":
        # Saved as JSON, but older installs may hold one channel per line.
        payload["value"] = normalize_force_join_channel_value(raw)
    elif kind == "list":
        payload["list_kind"] = "money" if key in MONEY_LIST_KEYS else "text"
        payload["placeholder"] = LIST_PLACEHOLDERS.get(key, "")
    elif kind == "number":
        payload["money"] = key in MONEY_NUMBER_KEYS
        if key in PERCENT_KEYS:
            payload["min"], payload["max"] = 1, 99
    rule = SETTING_VISIBILITY.get(key)
    payload["show_when"] = {"key": rule[0], "values": list(rule[1])} if rule else None
    return payload


def visible_groups(tab: str) -> dict[str, list[tuple]]:
    """The groups a shop sees on one tab: platform-only buttons, screens and paths are removed."""
    groups = {name: SETTING_GROUPS[name] for name in TAB_SETTING_GROUPS.get(tab, []) if name in SETTING_GROUPS}
    if tab == "service_import":
        groups.pop(IMPORT_ADMINS_GROUP, None)
    if tab == "buttons":
        groups = {name: kept for name, fields in groups.items() if (kept := [f for f in fields if f[0] not in PLATFORM_ONLY_BTN_KEYS])}
    if tab == SCREEN_TEXT_TAB:
        hidden = platform_only_screen_text_keys()
        groups = {name: kept for name, fields in groups.items() if (kept := [f for f in fields if f[0] not in hidden])}
    if tab == "notifications":
        # Ops and capacity keys are Owner-only: a shop's notifications are its customers' alerts.
        groups = {name: fields for name, fields in groups.items() if name == USER_ALERT_GROUP}
    return groups


def sections_payload(groups: dict[str, list[tuple]], values: dict[str, str], *, caption: str = "") -> list[dict[str, Any]]:
    return [
        {
            "title": name,
            "notice": GROUP_NOTICES.get(name),
            "caption": caption,
            "fields": [field_payload(field, values) for field in fields],
        }
        for name, fields in groups.items()
    ]


def nav_payload(groups: tuple[SettingsTabGroup, ...], base: str) -> list[dict[str, Any]]:
    """The grouped tab strip; a tab with its own page links there instead of ``?tab=``."""
    return [
        {
            "key": group.key,
            "label": group.label,
            "active": group.is_active,
            "tabs": [{"key": tab.key, "label": tab.label, "href": tab.href or f"{base}?tab={tab.key}"} for tab in group.tabs],
        }
        for group in groups
    ]
