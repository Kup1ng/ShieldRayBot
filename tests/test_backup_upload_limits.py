"""Backup uploads are copied to disk in chunks and checked for size before anything decompresses."""

from __future__ import annotations

import io
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from app.services import backup


class BackupUploadLimitTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)
        patcher = patch.object(backup, "BACKUP_DIR", self.dir)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_too_many_members_is_refused_without_decompressing(self):
        archive = self.dir / "many.zip"
        with zipfile.ZipFile(archive, "w") as zf:
            for i in range(5001):
                zf.writestr(f"f{i}", b"")
        with patch.object(zipfile.ZipFile, "testzip", side_effect=AssertionError("decompressed")):
            ok, err, _ = backup.validate_backup_archive(archive)
        self.assertFalse(ok)
        self.assertIn("تعداد", err)

    def test_an_upload_over_the_limit_is_refused_and_not_kept(self):
        with patch.object(backup, "MAX_UPLOAD_BYTES", 4096):
            result = backup.save_uploaded_backup_stream(io.BytesIO(b"x" * 10_000), filename="big.zip")
        self.assertFalse(result["ok"])
        self.assertEqual(result["error"], backup.UPLOAD_TOO_LARGE)
        self.assertEqual(list(self.dir.iterdir()), [])

    def test_a_tiny_upload_is_refused(self):
        result = backup.save_uploaded_backup(b"PK", filename="tiny.zip")
        self.assertEqual((result["ok"], result["error"]), (False, backup.UPLOAD_TOO_SMALL))
        self.assertEqual(list(self.dir.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
