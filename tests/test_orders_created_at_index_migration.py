"""The orders creation-time index is added once, tolerates a rerun and is removed on downgrade."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from tests.pgtest import new_schema, pg_sync_engine

ROOT = Path(__file__).resolve().parents[1]


def load_migration():
    spec = importlib.util.spec_from_file_location("orders_index_migration", ROOT / "alembic/versions/0063_orders_created_at_index.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class OrdersCreatedAtIndexMigrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.migration = load_migration()
        self.engine = pg_sync_engine()
        with self.engine.begin() as conn:
            conn.execute(sa.text("CREATE TABLE orders (id INTEGER PRIMARY KEY, created_at TIMESTAMPTZ)"))

    def run_step(self, conn: sa.Connection, *, down: bool = False) -> None:
        context = MigrationContext.configure(conn)
        with Operations.context(context), context.begin_transaction():
            (self.migration.downgrade if down else self.migration.upgrade)()

    def names(self, conn: sa.Connection) -> set[str]:
        names = {index["name"] for index in sa.inspect(conn).get_indexes("orders")}
        conn.commit()  # the concurrent build must start outside a transaction
        return names

    def test_upgrade_twice_then_downgrade(self) -> None:
        with self.engine.connect() as conn:
            self.run_step(conn)
            self.run_step(conn)
            self.assertIn("ix_orders_created_at", self.names(conn))
            self.run_step(conn, down=True)
            self.assertNotIn("ix_orders_created_at", self.names(conn))

    def test_a_database_without_the_table_is_left_alone(self) -> None:
        other = pg_sync_engine()
        with other.connect() as conn:
            self.run_step(conn)
            self.run_step(conn, down=True)
        other.dispose()

    def test_there_is_a_single_migration_head(self) -> None:
        from alembic.config import Config
        from alembic.script import ScriptDirectory

        config = Config(str(ROOT / "alembic.ini"))
        config.set_main_option("script_location", str(ROOT / "alembic"))
        self.assertEqual(len(ScriptDirectory.from_config(config).get_heads()), 1)


class OrdersCreatedAtIndexPostgresTests(unittest.TestCase):
    """Runs the migration the way Alembic does: inside a migration transaction, in its own schema."""

    def setUp(self) -> None:
        self.migration = load_migration()
        self.schema = new_schema()
        self.engine = pg_sync_engine(schema=self.schema)
        with self.engine.begin() as conn:
            conn.execute(sa.text("CREATE TABLE orders (id SERIAL PRIMARY KEY, created_at TIMESTAMPTZ)"))
            conn.execute(sa.text("INSERT INTO orders (created_at) SELECT now() - g * interval '1 hour' FROM generate_series(1, 500) g"))

    def tearDown(self) -> None:
        with self.engine.begin() as conn:
            conn.execute(sa.text(f'DROP SCHEMA "{self.schema}" CASCADE'))
        self.engine.dispose()

    def run_step(self, *, down: bool = False) -> None:
        with self.engine.connect() as conn:
            context = MigrationContext.configure(conn)
            with Operations.context(context), context.begin_transaction():
                (self.migration.downgrade if down else self.migration.upgrade)()

    def index_state(self) -> bool | None:
        """``True`` valid, ``False`` invalid, ``None`` missing."""
        with self.engine.connect() as conn:
            row = conn.execute(sa.text(
                "SELECT i.indisvalid FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid "
                "JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'ix_orders_created_at' AND n.nspname = :s"
            ), {"s": self.schema}).first()
        return None if row is None else bool(row[0])

    def test_concurrent_build_is_idempotent_and_downgrades(self) -> None:
        self.run_step()
        self.run_step()
        self.assertIs(self.index_state(), True)
        self.run_step(down=True)
        self.assertIsNone(self.index_state())
        self.run_step(down=True)
        self.run_step()
        self.assertIs(self.index_state(), True)

    def test_an_interrupted_build_is_rebuilt(self) -> None:
        with self.engine.begin() as conn:
            conn.execute(sa.text("CREATE INDEX ix_orders_created_at ON orders (created_at)"))
            conn.execute(sa.text(
                "UPDATE pg_index SET indisvalid = false WHERE indexrelid = 'ix_orders_created_at'::regclass"
            ))
        self.assertIs(self.index_state(), False)
        self.run_step()
        self.assertIs(self.index_state(), True)

    def test_the_index_is_built_and_dropped_concurrently(self) -> None:
        # CONCURRENTLY only works outside a transaction, so seeing it run proves the bot can keep
        # writing orders while a large table is indexed.
        statements: list[str] = []
        sa.event.listen(self.engine, "before_cursor_execute", lambda *args: statements.append(args[2]))
        self.run_step()
        self.run_step(down=True)
        index_ddl = [sql for sql in statements if "ix_orders_created_at" in sql and sql.lstrip().upper().startswith(("CREATE", "DROP"))]
        self.assertEqual(len(index_ddl), 2, index_ddl)
        self.assertTrue(all("CONCURRENTLY" in sql for sql in index_ddl), index_ddl)
