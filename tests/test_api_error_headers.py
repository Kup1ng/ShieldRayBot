"""The app's error handler keeps an exception's headers, so the Mini App can read why it was refused."""

from __future__ import annotations

import unittest
from unittest.mock import patch

import httpx
from fastapi import HTTPException

from app.api.app import create_api_app
from app.services.miniapp_auth import ERROR_HEADER, TERMS, mini_reject


def _app_with_refusals():
    app = create_api_app()

    @app.get("/api/mini/test-refusal")
    async def refusal() -> None:
        raise mini_reject(403, TERMS)

    @app.get("/api/mini/test-plain-refusal")
    async def plain_refusal() -> None:
        raise HTTPException(404, "پیدا نشد")

    return app


class ErrorHeaderTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        # A finished install: before setup every path is sent to the setup wizard.
        setup_done = patch("app.api.app.is_setup_complete", return_value=True)
        setup_done.start()
        self.addCleanup(setup_done.stop)
        transport = httpx.ASGITransport(app=_app_with_refusals())
        self.client = httpx.AsyncClient(transport=transport, base_url="http://test")
        self.addAsyncCleanup(self.client.aclose)

    async def test_a_mini_app_refusal_keeps_its_reason_header_through_the_app_handler(self) -> None:
        response = await self.client.get("/api/mini/test-refusal")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.headers.get(ERROR_HEADER), TERMS)
        self.assertEqual(response.json(), {"detail": "ابتدا قوانین را بپذیرید"})

    async def test_an_error_without_headers_still_answers_plain_json(self) -> None:
        response = await self.client.get("/api/mini/test-plain-refusal")
        self.assertEqual(response.status_code, 404)
        self.assertIsNone(response.headers.get(ERROR_HEADER))
        self.assertEqual(response.json(), {"detail": "پیدا نشد"})


if __name__ == "__main__":
    unittest.main()
