"""Oversized request bodies are refused before any middleware or route buffers them."""

from __future__ import annotations

import unittest

from starlette.requests import Request
from starlette.responses import PlainTextResponse

from app.api.body_limit import DEFAULT_MAX_BODY_BYTES, BodySizeLimitMiddleware

CHUNK = 1024 * 1024


class FiniteBody:
    """An ASGI receive that streams ``size`` bytes in 1 MB chunks."""

    def __init__(self, size: int) -> None:
        self.left = size

    async def __call__(self):
        chunk = min(CHUNK, self.left)
        self.left -= chunk
        return {"type": "http.request", "body": b"x" * chunk, "more_body": self.left > 0}


class EndlessBody:
    """An ASGI receive that streams 1 MB chunks forever and counts what was read."""

    def __init__(self) -> None:
        self.read = 0

    async def __call__(self):
        self.read += CHUNK
        return {"type": "http.request", "body": b"x" * CHUNK, "more_body": True}


async def call(app, *, path: str = "/upload", headers: list | None = None, receive=None):
    sent: list[dict] = []

    async def send(message):
        sent.append(message)

    scope = {
        "type": "http", "method": "POST", "path": path, "raw_path": path.encode(), "query_string": b"",
        "headers": headers or [], "scheme": "http", "server": ("panel.test", 80), "client": ("1.2.3.4", 5),
        "root_path": "", "http_version": "1.1",
    }
    await app(scope, receive or EndlessBody(), send)
    start = next(m for m in sent if m["type"] == "http.response.start")
    return start["status"]


async def reading_app(scope, receive, send):
    body = await Request(scope, receive).body()
    await PlainTextResponse(str(len(body)))(scope, receive, send)


class BodySizeLimitMiddlewareTests(unittest.IsolatedAsyncioTestCase):
    async def test_declared_length_over_the_limit_is_refused_without_reading(self):
        body = EndlessBody()
        app = BodySizeLimitMiddleware(reading_app, default_limit=4 * CHUNK)
        status = await call(app, headers=[(b"content-length", str(5 * CHUNK).encode())], receive=body)
        self.assertEqual(status, 413)
        self.assertEqual(body.read, 0)

    async def test_chunked_body_stops_being_read_at_the_limit(self):
        body = EndlessBody()
        app = BodySizeLimitMiddleware(reading_app, default_limit=4 * CHUNK)
        self.assertEqual(await call(app, receive=body), 413)
        self.assertEqual(body.read, 5 * CHUNK)

    async def test_malformed_length_is_refused(self):
        app = BodySizeLimitMiddleware(reading_app)
        self.assertEqual(await call(app, headers=[(b"content-length", b"12abc")]), 400)

    async def test_body_within_the_limit_reaches_the_route(self):
        async def small():
            return {"type": "http.request", "body": b"hello", "more_body": False}

        app = BodySizeLimitMiddleware(reading_app, default_limit=CHUNK)
        self.assertEqual(await call(app, headers=[(b"content-length", b"5")], receive=small), 200)

    async def test_a_path_with_its_own_limit_accepts_more(self):
        app = BodySizeLimitMiddleware(reading_app, default_limit=CHUNK, path_limits={"/backup/upload": 8 * CHUNK})
        declared = [(b"content-length", str(4 * CHUNK).encode())]
        self.assertEqual(await call(app, headers=declared), 413)
        status = await call(app, path="/backup/upload", headers=declared, receive=FiniteBody(4 * CHUNK))
        self.assertEqual(status, 200)


class PanelAppBodyLimitTests(unittest.IsolatedAsyncioTestCase):
    async def test_unauthenticated_endless_body_with_a_fake_session_cookie_is_bounded(self):
        from app.api.app import create_api_app

        body = EndlessBody()
        headers = [
            (b"host", b"panel.test"), (b"origin", b"http://panel.test"),
            (b"cookie", b"session=forged"), (b"content-type", b"application/json"),
        ]
        status = await call(create_api_app(), path="/anything", headers=headers, receive=body)
        self.assertIn(status, (403, 413))
        self.assertEqual(body.read, DEFAULT_MAX_BODY_BYTES + CHUNK)


if __name__ == "__main__":
    unittest.main()
