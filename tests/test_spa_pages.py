"""Pages of the React frontend are served from the export with no-store and fail closed when missing."""

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

from app.api import spa_pages


class SpaPagesTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        spa_pages._cache.clear()
        self.patch = patch.object(spa_pages, "SPA_DIR", self.root)
        self.patch.start()

    def tearDown(self) -> None:
        self.patch.stop()
        spa_pages._cache.clear()
        self.tmp.cleanup()

    def _write(self, html: str, *, mtime: float) -> None:
        page = self.root / "miniapp" / "index.html"
        page.parent.mkdir(parents=True, exist_ok=True)
        page.write_text(html, encoding="utf-8")
        os.utime(page, (mtime, mtime))

    def test_the_exported_page_is_returned_uncached_by_intermediaries(self) -> None:
        self._write("<html><body>mini</body></html>", mtime=1_000)
        response = spa_pages.spa_response("miniapp")
        self.assertEqual(response.headers["cache-control"], "no-store")
        self.assertIn(b"mini", response.body)

    def test_a_rebuilt_page_is_picked_up_without_a_restart(self) -> None:
        self._write("old", mtime=1_000)
        self.assertEqual(spa_pages.spa_html("miniapp"), "old")
        self._write("new", mtime=2_000)
        self.assertEqual(spa_pages.spa_html("miniapp"), "new")

    def test_a_missing_build_is_a_clear_503_not_a_crash(self) -> None:
        with self.assertRaises(HTTPException) as ctx:
            spa_pages.spa_html("miniapp")
        self.assertEqual(ctx.exception.status_code, 503)

    def test_only_known_pages_can_be_served(self) -> None:
        with self.assertRaises(ValueError):
            spa_pages.spa_html("../../config")


if __name__ == "__main__":
    unittest.main()
