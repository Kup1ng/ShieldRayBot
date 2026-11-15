"""The public PWA icon is resized once per source file, and again after a new upload."""

from __future__ import annotations

import os
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from app.services import pwa


def png(color: tuple[int, int, int, int]) -> bytes:
    buf = BytesIO()
    Image.new("RGBA", (64, 64), color).save(buf, format="PNG")
    return buf.getvalue()


class PwaIconCacheTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.src = Path(self.tmp.name) / "icon.png"
        self.src.write_bytes(png((255, 0, 0, 255)))
        self.patch = patch.object(pwa, "source_icon_path", return_value=self.src)
        self.patch.start()
        pwa._ICON_CACHE.clear()

    def tearDown(self):
        self.patch.stop()
        pwa._ICON_CACHE.clear()
        self.tmp.cleanup()

    def test_repeated_requests_resize_once(self):
        with patch.object(pwa, "_resize_png", wraps=pwa._resize_png) as resize:
            first = pwa.icon_bytes(512, maskable=True)
            for _ in range(20):
                self.assertEqual(pwa.icon_bytes(512, maskable=True), first)
        self.assertEqual(resize.call_count, 1)

    def test_a_new_upload_is_served_instead_of_the_cached_icon(self):
        before = pwa.icon_bytes(192)
        self.src.write_bytes(png((0, 0, 255, 255)))
        stat = self.src.stat()
        os.utime(self.src, ns=(stat.st_atime_ns, stat.st_mtime_ns + 10_000_000))
        self.assertNotEqual(pwa.icon_bytes(192), before)

    def test_cache_stays_bounded(self):
        for i in range(40):
            stat = self.src.stat()
            os.utime(self.src, ns=(stat.st_atime_ns, stat.st_mtime_ns + 1_000_000))
            pwa.icon_bytes(180 + (i % 3))
        self.assertLessEqual(len(pwa._ICON_CACHE), pwa._ICON_CACHE_LIMIT)


if __name__ == "__main__":
    unittest.main()
