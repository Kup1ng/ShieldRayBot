"""Customer-safe error text for the PasarGuard pages of the React panel."""

from __future__ import annotations

import re

from app.services.pasarguard import PasarGuardError
from app.services.redact import user_safe_error

PERSIAN_LETTER = re.compile(r"[؀-ۿ]")


def safe_pg_error(exc: BaseException, *, fallback: str) -> str:
    """The panel's own Persian message for a PasarGuard answer; any other failure shows ``fallback``.

    The detail of a database, transport or programming error stays in the server log.
    """
    if isinstance(exc, PasarGuardError):
        return user_safe_error(exc, fallback=fallback)
    return fallback


def safe_persian_text(text: str, *, fallback: str) -> str:
    """A service's message when it is Persian text without secrets; English or empty text shows ``fallback``."""
    cleaned = user_safe_error(text, fallback=fallback)
    return cleaned if PERSIAN_LETTER.search(cleaned) else fallback
