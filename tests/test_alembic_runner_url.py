"""Alembic receives the database URL unchanged, percent signs included."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from app.db import alembic_runner

ENCODED = "postgresql+asyncpg://shop:p%40ss%25w@db.local:5432/shieldray?options=-csearch_path%3Dt_abc"


class AlembicUrlTests(unittest.TestCase):
    def test_a_percent_encoded_url_reaches_alembic_unchanged(self) -> None:
        cfg = alembic_runner.alembic_config(ENCODED)
        self.assertEqual(
            cfg.get_main_option("sqlalchemy.url"),
            "postgresql+psycopg://shop:p%40ss%25w@db.local:5432/shieldray?options=-csearch_path%3Dt_abc",
        )

    def test_upgrade_adds_the_connect_timeout_and_keeps_the_encoding(self) -> None:
        with patch.object(alembic_runner.command, "upgrade") as upgrade:
            alembic_runner.upgrade_head(ENCODED)
        cfg, target = upgrade.call_args.args
        self.assertEqual(target, "head")
        url = cfg.get_main_option("sqlalchemy.url")
        self.assertIn("p%40ss%25w@", url)
        self.assertIn("search_path%3Dt_abc", url)
        self.assertTrue(url.endswith("&connect_timeout=15"))


if __name__ == "__main__":
    unittest.main()
