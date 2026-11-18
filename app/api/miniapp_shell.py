"""The Mini App's HTML shell: the exported React page plus the bot's public username.

A browser visit (no Telegram sign-in) cannot use the app; the page sends the person to the
bot when it knows its username. The name is public and passes ``clean_bot_username``, so the
only value written into the page is a validated Telegram username.
"""

from __future__ import annotations

from html import escape

from fastapi.responses import HTMLResponse

from app.api.spa_pages import spa_html
from app.services.miniapp_main_app import clean_bot_username

SHELL_PAGE = "miniapp"
BOT_META_NAME = "pg-mini-bot"
HEAD_OPEN = "<head>"


def miniapp_shell_response(bot_username: str | None) -> HTMLResponse:
    """The Mini App page with ``<meta name="pg-mini-bot">`` carrying this bot's username ("" when unknown)."""
    html = spa_html(SHELL_PAGE)
    meta = f'<meta name="{BOT_META_NAME}" content="{escape(clean_bot_username(bot_username))}"/>'
    # The export always opens its head without attributes; without it the page still works, minus the link.
    response = HTMLResponse(html.replace(HEAD_OPEN, HEAD_OPEN + meta, 1))
    # Never let an intermediary serve a shell without the current launch context.
    response.headers["Cache-Control"] = "no-store"
    return response
