"""Pages of the React frontend (``frontend/``), exported into ``app/web/static/spa``.

The export's HTML is returned through FastAPI rather than as a static file so it keeps the
security middleware: the CSP nonce stamped on every ``<script>``, frame rules and
``no-store``. Assets the pages load live under ``/static/spa`` and are served as static files.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path

from fastapi import HTTPException
from fastapi.responses import HTMLResponse

logger = logging.getLogger(__name__)

SPA_DIR = Path(__file__).resolve().parents[1] / "web" / "static" / "spa"

# A page is an exported route such as "users" or "pg/users". Names come from code, never from a
# request; the pattern still refuses anything that could leave the export folder.
PAGE_NAME = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*$")

FRONTEND_MISSING = "رابط کاربری ساخته نشده است؛ در پوشهٔ frontend دستور npm run export را اجرا کنید."

_cache: dict[str, tuple[float, str]] = {}


def spa_html(page: str) -> str:
    """The exported HTML of ``page``, re-read only when the file changes (hot path)."""
    if not PAGE_NAME.fullmatch(page):
        raise ValueError(f"invalid SPA page name: {page}")
    path = SPA_DIR / page / "index.html"
    try:
        mtime = path.stat().st_mtime
    except OSError:
        logger.error("SPA page %s is missing at %s", page, path)
        raise HTTPException(503, FRONTEND_MISSING) from None
    cached = _cache.get(page)
    if cached and cached[0] == mtime:
        return cached[1]
    html = path.read_text(encoding="utf-8")
    _cache[page] = (mtime, html)
    return html


def spa_response(page: str) -> HTMLResponse:
    response = HTMLResponse(spa_html(page))
    # Never let an intermediary serve a shell without the current launch context.
    response.headers["Cache-Control"] = "no-store"
    return response
