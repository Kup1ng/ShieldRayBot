"""0116 joins ShieldRay's request-key branch and upstream's entry approvals into one head."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory

from app.db.alembic_runner import alembic_config, downgrade_one, upgrade_head
from tests.pgtest import ensure_schema, new_schema, pg_sync_engine, sync_url

ROOT = Path(__file__).resolve().parents[1]
MERGE = "0116_merge_entry_approvals"
BRANCH_HEADS = {"0115_payment_topup_request_key", "0114_entry_approvals"}


def _load_merge():
    spec = importlib.util.spec_from_file_location("merge_entry_approvals", ROOT / f"alembic/versions/{MERGE}.py")
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class MergeRevisionTests(unittest.TestCase):
    def test_the_history_has_one_head_with_both_branches_below_it(self) -> None:
        script = ScriptDirectory.from_config(alembic_config())
        self.assertEqual(list(script.get_heads()), [MERGE])
        self.assertEqual(set(script.get_revision(MERGE).down_revision), BRANCH_HEADS)
        below = {rev.revision for rev in script.iterate_revisions(MERGE, "base")}
        self.assertTrue({"0114_cashback_rule_request_key", *BRANCH_HEADS} <= below)

    def test_an_empty_database_upgrades_twice_and_the_join_changes_no_table(self) -> None:
        schema = ensure_schema(new_schema())
        url = sync_url(schema)
        upgrade_head(url)
        upgrade_head(url)
        engine = pg_sync_engine(schema=schema)
        self.addCleanup(engine.dispose)
        with engine.begin() as conn:
            self.assertEqual(self._shape(conn), (True, True, True))
            self.assertEqual(set(conn.execute(sa.text("SELECT version_num FROM alembic_version")).scalars()), {MERGE})
            # Alembic cannot step back from a join with "-1"; its own downgrade must leave both branches whole.
            with Operations.context(MigrationContext.configure(conn)):
                _load_merge().downgrade()
            self.assertEqual(self._shape(conn), (True, True, True))

    def test_one_step_back_from_the_join_keeps_both_branches_and_upgrades_again(self) -> None:
        schema = ensure_schema(new_schema())
        url = sync_url(schema)
        upgrade_head(url)
        engine = pg_sync_engine(schema=schema)
        self.addCleanup(engine.dispose)
        downgrade_one(url)
        with engine.connect() as conn:
            self.assertEqual(set(conn.execute(sa.text("SELECT version_num FROM alembic_version")).scalars()), BRANCH_HEADS)
            self.assertEqual(self._shape(conn), (True, True, True))
        upgrade_head(url)
        with engine.connect() as conn:
            self.assertEqual(set(conn.execute(sa.text("SELECT version_num FROM alembic_version")).scalars()), {MERGE})

    @staticmethod
    def _shape(conn: sa.Connection) -> tuple[bool, bool, bool]:
        inspector = sa.inspect(conn)
        return (
            inspector.has_table("entry_approvals"),
            "request_key" in {column["name"] for column in inspector.get_columns("cashback_rules")},
            "request_key" in {column["name"] for column in inspector.get_columns("payments")},
        )


if __name__ == "__main__":
    unittest.main()
