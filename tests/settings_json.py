"""Reading the bot-settings JSON (``/api/panel/settings``) the way the old page's HTML was read."""

from __future__ import annotations

from typing import Any

SETTINGS_API = "/api/panel/settings"


def settings_url(tab: str) -> str:
    return f"{SETTINGS_API}?tab={tab}"


def settings_fields(body: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Every field of the tab's groups by key."""
    return {field["key"]: field for group in body.get("groups") or [] for field in group["fields"]}


def settings_group(body: dict[str, Any], name: str) -> dict[str, Any]:
    return next(group for group in body["groups"] if group["name"] == name)
