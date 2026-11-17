"""The SQLite→PostgreSQL migration's length check names rows by their real primary key."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import sqlalchemy as sa

from app.db.models import Base, BotUser, PurchaseContact
from app.db.validate import scan_varchar_overflows


class VarcharOverflowScanTests(unittest.TestCase):
    def setUp(self) -> None:
        # The migration tool's source is an old SQLite file; that is the one place SQLite is read.
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.engine = sa.create_engine(f"sqlite:///{Path(self._tmp.name) / 'old.db'}")
        self.addCleanup(self.engine.dispose)
        Base.metadata.create_all(self.engine)

    def test_tables_without_an_id_column_are_scanned_by_their_key(self) -> None:
        self.assertIn("id", BotUser.__table__.c)
        self.assertNotIn("id", PurchaseContact.__table__.c)
        too_long = "x" * (BotUser.__table__.c.referral_code.type.length + 3)
        with self.engine.begin() as conn:
            conn.execute(sa.insert(BotUser.__table__).values(id=7, telegram_id=7, referral_code=too_long, role="user"))
        violations = scan_varchar_overflows(self.engine)
        self.assertIn(
            {"table": "bot_users", "column": "referral_code", "id": 7, "length": len(too_long),
             "max": BotUser.__table__.c.referral_code.type.length},
            violations,
        )

    def test_a_clean_database_has_no_violations(self) -> None:
        with self.engine.begin() as conn:
            conn.execute(sa.insert(BotUser.__table__).values(id=1, telegram_id=1, referral_code="ok", role="user"))
        self.assertEqual(scan_varchar_overflows(self.engine), [])


if __name__ == "__main__":
    unittest.main()
