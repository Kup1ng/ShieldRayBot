"""A restored SQLite database is never paired with the write-ahead log of the file it replaced."""

from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path

from app.services.backup import _drop_stale_sqlite_journal


class RestoreDropsStaleWalTests(unittest.TestCase):
    def test_old_wal_and_shm_are_removed_and_the_restored_rows_stay(self):
        with tempfile.TemporaryDirectory() as tmp:
            live = Path(tmp) / "bot.db"
            restored = Path(tmp) / "restored.db"
            conn = sqlite3.connect(restored)
            conn.execute("create table t (v text)")
            conn.execute("insert into t values ('restored')")
            conn.commit()
            conn.close()
            restored.replace(live)
            # Leftovers of the database that lived at this path before the restore.
            (Path(tmp) / "bot.db-wal").write_bytes(b"old wal frames")
            (Path(tmp) / "bot.db-shm").write_bytes(b"old index")

            _drop_stale_sqlite_journal(live)

            self.assertFalse((Path(tmp) / "bot.db-wal").exists())
            self.assertFalse((Path(tmp) / "bot.db-shm").exists())
            conn = sqlite3.connect(live)
            try:
                self.assertEqual(conn.execute("select v from t").fetchall(), [("restored",)])
            finally:
                conn.close()

    def test_nothing_to_remove_is_fine(self):
        with tempfile.TemporaryDirectory() as tmp:
            _drop_stale_sqlite_journal(Path(tmp) / "bot.db")


if __name__ == "__main__":
    unittest.main()
