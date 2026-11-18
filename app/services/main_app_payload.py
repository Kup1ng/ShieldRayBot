"""The «Open» button guide of the Mini App settings tabs as JSON for the React panel."""

from __future__ import annotations

from typing import Any

from app.services.miniapp_main_app import MainAppGuide


def main_app_payload(guide: MainAppGuide | None) -> dict[str, Any] | None:
    """What the guide card shows; ``enabled`` is None when Telegram could not be asked."""
    if guide is None:
        return None
    return {
        "url": guide.url,
        "bot_username": guide.bot_username,
        "enabled": guide.enabled,
        "open_link": guide.open_link,
    }
