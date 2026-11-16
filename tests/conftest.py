"""Every test runs on PostgreSQL: one throwaway database per pytest process.

Set ``PGCLOCK_TEST_DATABASE_URL`` to a server where the user may create databases, e.g.
``postgresql+asyncpg://shieldray:<password>@127.0.0.1:55432/postgres``. The run's database is
created before any test module is imported (so ``DATABASE_URL`` already points at it when the
app's settings load) and dropped when the run ends. ``tests/pgtest.py`` hands each engine its
own schema inside it, and the schemas a test module used are dropped when that module ends.

Without the variable, tests that need no database still run (CI's design-rule job installs
only pytest); a test that asks ``pgtest`` for an engine fails and says what to set.
"""

from __future__ import annotations

import asyncio
import os
import secrets

import pytest

SOURCE_ENV = "PGCLOCK_TEST_DATABASE_URL"
RUN_DATABASE_ENV = "PGCLOCK_TEST_RUN_DATABASE_URL"
# Lets app modules import (the app refuses a non-PostgreSQL URL); nothing ever connects to it.
UNCONFIGURED_URL = "postgresql+asyncpg://unconfigured@127.0.0.1:9/unconfigured"
_created: dict[str, object] = {}
_kept_schemas: list[str] = []


def _source_url():  # -> sqlalchemy URL
    # Imported here so a pytest-only install (no SQLAlchemy) can still run the pure tests.
    from sqlalchemy.engine import make_url

    url = make_url(os.environ[SOURCE_ENV].strip())
    if not url.drivername.startswith("postgresql"):
        raise pytest.UsageError(f"{SOURCE_ENV} must be a PostgreSQL URL")
    return url.set(drivername="postgresql+asyncpg")


async def _admin(url, statement: str) -> None:
    # Imported here for the same reason as above: asyncpg is only needed when a database is used.
    import asyncpg

    connection = await asyncpg.connect(
        user=url.username, password=url.password, host=url.host or "127.0.0.1",
        port=url.port or 5432, database=url.database or "postgres",
    )
    try:
        await connection.execute(statement)
    finally:
        await connection.close()


def pytest_configure(config: pytest.Config) -> None:
    if not os.environ.get(SOURCE_ENV, "").strip():
        os.environ.setdefault("DATABASE_URL", UNCONFIGURED_URL)
        return
    source = _source_url()
    name = f"shieldray_t_{os.getpid()}_{secrets.token_hex(4)}"
    asyncio.run(_admin(source, f'CREATE DATABASE "{name}"'))
    _created.update(source=source, name=name)
    run_url = source.set(database=name).render_as_string(hide_password=False)
    os.environ[RUN_DATABASE_ENV] = run_url
    # The app's own engine (app.db.session) reads this when its settings first load.
    os.environ["DATABASE_URL"] = run_url


def _drop_schemas(schemas: list[str]) -> list[str]:
    """Drop the given schemas of this run's database; return those still locked by an open transaction."""
    # Imported here for the same reason as above. psycopg (sync) keeps this off the tests' event loops.
    import psycopg
    from sqlalchemy.engine import make_url

    url = make_url(os.environ[RUN_DATABASE_ENV])
    kept: list[str] = []
    with psycopg.connect(
        user=url.username, password=url.password, host=url.host or "127.0.0.1",
        port=url.port or 5432, dbname=url.database, autocommit=True,
    ) as connection:
        connection.execute("SET lock_timeout = '5s'")
        for schema in schemas:
            # One schema per statement: dropping them all at once can overflow the server's lock table.
            try:
                connection.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')
            except psycopg.errors.LockNotAvailable:
                kept.append(schema)
    return kept


@pytest.fixture(autouse=True, scope="module")
def _drop_module_schemas():
    """Without this, one process running many modules keeps every test's tables until the end."""
    if RUN_DATABASE_ENV not in os.environ:
        yield
        return
    # Imported here: pgtest needs SQLAlchemy, which a pytest-only install lacks.
    from tests.pgtest import USED_SCHEMAS

    start = len(USED_SCHEMAS)
    yield
    # Names come from pgtest, which accepts only plain lowercase identifiers.
    _kept_schemas.extend(_drop_schemas(USED_SCHEMAS[start:]))


def pytest_terminal_summary(terminalreporter: pytest.TerminalReporter) -> None:
    if _kept_schemas:
        terminalreporter.write_line(
            f"pgtest: {len(_kept_schemas)} schema(s) were still in use when their module ended; "
            "they went with the run's database"
        )


@pytest.fixture(autouse=True, scope="session")
def _app_engine_follows_fixed_ids():
    """Tests that use the app's own engine insert fixed ids too; keep its sequences ahead of them."""
    if RUN_DATABASE_ENV in os.environ:
        # Imported here: the app must load after pytest_configure has set DATABASE_URL.
        from app.db.session import engine
        from tests.pgtest import follow_explicit_ids

        follow_explicit_ids(engine.sync_engine)
    yield


def pytest_unconfigure(config: pytest.Config) -> None:
    if "name" not in _created:
        return
    source, name = _created["source"], _created["name"]
    asyncio.run(_admin(source, f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
    _created.clear()
