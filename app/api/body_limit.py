"""Refuse request bodies larger than any route accepts, before anything reads them.

The CSRF check buffers the body of every cookie-carrying mutation and FastAPI parses form bodies
before a route's login dependency runs, so without this cap an anonymous client could stream an
unbounded body into memory or a temporary file. A declared ``Content-Length`` over the limit is
refused at once; a chunked body is counted while it arrives and reading stops at the limit.
"""

from __future__ import annotations

import logging

from starlette.responses import PlainTextResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger(__name__)

MB = 1024 * 1024
# Guide videos (50 MB, Telegram's bot upload limit) plus multipart overhead.
DEFAULT_MAX_BODY_BYTES = 64 * MB
# Backup archives are accepted up to 500 MB by the upload route itself.
PATH_MAX_BODY_BYTES: dict[str, int] = {"/backup/upload": 520 * MB}
TOO_LARGE_MESSAGE = "حجم درخواست از حد مجاز بیشتر است"
BAD_LENGTH_MESSAGE = "طول درخواست نامعتبر است"


class _BodyTooLarge(Exception):
    """The streamed body passed the limit; raised from ``receive`` to stop the reading app."""


def _declared_length(scope: Scope) -> int | None:
    """The Content-Length header; -1 when it is present but not a whole number."""
    for name, value in scope.get("headers") or ():
        if name == b"content-length":
            text = value.decode("latin-1").strip()
            return int(text) if text.isascii() and text.isdigit() else -1
    return None


class BodySizeLimitMiddleware:
    def __init__(
        self,
        app: ASGIApp,
        *,
        default_limit: int = DEFAULT_MAX_BODY_BYTES,
        path_limits: dict[str, int] | None = None,
    ) -> None:
        self.app = app
        self.default_limit = default_limit
        self.path_limits = PATH_MAX_BODY_BYTES if path_limits is None else path_limits

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        limit = self.path_limits.get(scope.get("path", ""), self.default_limit)
        declared = _declared_length(scope)
        if declared is not None and declared < 0:
            await PlainTextResponse(BAD_LENGTH_MESSAGE, status_code=400)(scope, receive, send)
            return
        if declared is not None and declared > limit:
            await PlainTextResponse(TOO_LARGE_MESSAGE, status_code=413)(scope, receive, send)
            return
        await self._call_counted(scope, receive, send, limit)

    async def _call_counted(self, scope: Scope, receive: Receive, send: Send, limit: int) -> None:
        received = 0
        started = False

        async def counted_receive() -> Message:
            nonlocal received
            if received > limit:
                # A middleware that swallowed the first refusal never reads further.
                raise _BodyTooLarge()
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    raise _BodyTooLarge()
            return message

        async def tracked_send(message: Message) -> None:
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, counted_receive, tracked_send)
        except _BodyTooLarge:
            logger.warning("request body over %s bytes refused path=%s", limit, scope.get("path", ""))
            if not started:
                await PlainTextResponse(TOO_LARGE_MESSAGE, status_code=413)(scope, receive, send)
