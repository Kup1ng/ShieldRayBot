"""0114 gives cashback rules a unique request key; it keeps existing rules and is safe to repeat."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from tests.pgtest import pg_sync_engine

ROOT = Path(__file__).resolve().parents[1]
KEY = "0123456789abcdef0123456789abcdef"


def _load_migration():
    path = ROOT / "alembic/versions/0114_cashback_rule_request_key.py"
    spec = importlib.util.spec_from_file_location("cashback_rule_request_key_migration", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class CashbackRuleRequestKeyMigrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.migration = _load_migration()
        self.engine = pg_sync_engine()
        self.addCleanup(self.engine.dispose)
        with self.engine.begin() as conn:
            conn.execute(sa.text("CREATE TABLE cashback_rules (id INTEGER PRIMARY KEY, shop_id INTEGER, name VARCHAR(128))"))
            conn.execute(sa.text("INSERT INTO cashback_rules (id, shop_id, name) VALUES (1, 5, 'old'), (2, 5, 'old copy')"))

    def _run(self, conn: sa.Connection, *, down: bool = False) -> None:
        with Operations.context(MigrationContext.configure(conn)):
            (self.migration.downgrade if down else self.migration.upgrade)()

    def _names(self, conn: sa.Connection) -> list[str]:
        return list(conn.execute(sa.text("SELECT name FROM cashback_rules ORDER BY id")).scalars())

    def test_upgrade_twice_keeps_rules_and_refuses_a_reused_key(self) -> None:
        with self.engine.begin() as conn:
            self._run(conn)
            self._run(conn)
            self.assertEqual(self._names(conn), ["old", "old copy"])
            conn.execute(sa.text("INSERT INTO cashback_rules (id, shop_id, name, request_key) VALUES (3, 5, 'new', :key)"), {"key": KEY})
            with self.assertRaises(sa.exc.IntegrityError):
                conn.execute(sa.text("INSERT INTO cashback_rules (id, shop_id, name, request_key) VALUES (4, 6, 'dup', :key)"), {"key": KEY})

    def test_downgrade_twice_keeps_every_rule_and_upgrades_again(self) -> None:
        with self.engine.begin() as conn:
            self._run(conn)
            conn.execute(sa.text("INSERT INTO cashback_rules (id, shop_id, name, request_key) VALUES (3, 5, 'new', :key)"), {"key": KEY})
        with self.engine.begin() as conn:
            self._run(conn, down=True)
            self._run(conn, down=True)
            self.assertNotIn("request_key", {column["name"] for column in sa.inspect(conn).get_columns("cashback_rules")})
            self.assertEqual(self._names(conn), ["old", "old copy", "new"])
            self._run(conn)
            self.assertIn("request_key", {column["name"] for column in sa.inspect(conn).get_columns("cashback_rules")})

    def test_revision_follows_the_current_head(self) -> None:
        self.assertEqual(self.migration.down_revision, "0113_service_import_offer_dismissal")


if __name__ == "__main__":
    unittest.main()
