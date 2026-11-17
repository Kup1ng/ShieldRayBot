"""0115 keeps the web top-up form's key on its payment; it keeps every payment and is safe to repeat."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from tests.pgtest import pg_sync_engine

ROOT = Path(__file__).resolve().parents[1]
KEY = "k" * 32


def _load_migration():
    path = ROOT / "alembic/versions/0115_payment_topup_request_key.py"
    spec = importlib.util.spec_from_file_location("payment_topup_request_key_migration", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class PaymentTopupRequestKeyMigrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.migration = _load_migration()
        self.engine = pg_sync_engine()
        self.addCleanup(self.engine.dispose)
        with self.engine.begin() as conn:
            conn.execute(sa.text("CREATE TABLE payments (id INTEGER PRIMARY KEY, user_id INTEGER, amount INTEGER)"))
            conn.execute(sa.text("INSERT INTO payments (id, user_id, amount) VALUES (1, 5, 1000), (2, 5, 1000)"))

    def _run(self, conn: sa.Connection, *, down: bool = False) -> None:
        with Operations.context(MigrationContext.configure(conn)):
            (self.migration.downgrade if down else self.migration.upgrade)()

    def _insert(self, conn: sa.Connection, payment_id: int, user_id: int) -> None:
        conn.execute(
            sa.text("INSERT INTO payments (id, user_id, amount, request_key) VALUES (:id, :user, 1000, :key)"),
            {"id": payment_id, "user": user_id, "key": KEY},
        )

    def test_upgrade_twice_allows_one_payment_per_account_and_key(self) -> None:
        with self.engine.begin() as conn:
            self._run(conn)
            self._run(conn)
            self._insert(conn, 3, 5)
            self._insert(conn, 4, 6)
            with self.assertRaises(sa.exc.IntegrityError):
                self._insert(conn, 5, 5)

    def test_downgrade_twice_keeps_every_payment_and_upgrades_again(self) -> None:
        with self.engine.begin() as conn:
            self._run(conn)
            self._insert(conn, 3, 5)
        with self.engine.begin() as conn:
            self._run(conn, down=True)
            self._run(conn, down=True)
            self.assertNotIn("request_key", {column["name"] for column in sa.inspect(conn).get_columns("payments")})
            self.assertEqual(list(conn.execute(sa.text("SELECT id FROM payments ORDER BY id")).scalars()), [1, 2, 3])
            self._run(conn)

    def test_revision_follows_the_cashback_key_migration(self) -> None:
        self.assertEqual(self.migration.down_revision, "0114_cashback_rule_request_key")


if __name__ == "__main__":
    unittest.main()
