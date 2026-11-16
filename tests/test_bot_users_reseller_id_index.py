"""``bot_users.reseller_id`` — filtered by every reseller-scoped query (tenant
isolation: bot's "my customers" list, dashboards, finance) — must be indexed,
both in the ORM model and via an Alembic migration so existing databases
pick it up on upgrade.
"""

from __future__ import annotations

import unittest


class BotUsersResellerIdIndexTests(unittest.TestCase):
    def test_model_column_is_indexed(self):
        from app.db.models import BotUser

        col = BotUser.__table__.c.reseller_id
        self.assertTrue(
            col.index, "bot_users.reseller_id must be indexed (tenant-isolation queries filter on it)"
        )

    def test_migration_creates_index_on_postgresql(self):
        from sqlalchemy import inspect

        from app.db.alembic_runner import upgrade_head
        from tests.pgtest import ensure_schema, new_schema, pg_sync_engine, sync_url

        schema = ensure_schema(new_schema())
        upgrade_head(sync_url(schema))
        engine = pg_sync_engine(schema=schema)
        try:
            names = {ix["name"] for ix in inspect(engine).get_indexes("bot_users")}
            self.assertIn("ix_bot_users_reseller_id", names)
        finally:
            engine.dispose()


if __name__ == "__main__":
    unittest.main()
