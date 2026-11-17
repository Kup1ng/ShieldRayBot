"""PostgreSQL for tests: every engine gets its own empty schema in this run's database.

``conftest.py`` creates one throwaway database per pytest process and points
``DATABASE_URL`` at it. An engine from :func:`pg_engine` or :func:`pg_sync_engine` then works
in a fresh schema of that database, so tests stay as isolated as they were with an in-memory
database, and two engines given the same ``schema`` share their tables. Every schema named
here is listed in :data:`USED_SCHEMAS`; ``conftest.py`` drops a module's schemas when the
module ends, so a long run does not pile up tables.
"""

from __future__ import annotations

import os
import re
import secrets
from typing import Any

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

RUN_DATABASE_ENV = "PGCLOCK_TEST_RUN_DATABASE_URL"
_SCHEMA_NAME = re.compile(r"[a-z_][a-z0-9_]{0,62}")
_INSERT_COLUMNS = re.compile(r'^\s*INSERT INTO "?(?P<table>[a-z_][a-z0-9_]*)"? \((?P<columns>[^)]*)\)', re.I)
# Schemas in the order they were first named in this process.
USED_SCHEMAS: list[str] = []
_used: set[str] = set()


def run_database_url() -> str:
    """The async (asyncpg) URL of this run's database."""
    try:
        return os.environ[RUN_DATABASE_ENV]
    except KeyError:
        raise RuntimeError(
            "This test needs PostgreSQL: set PGCLOCK_TEST_DATABASE_URL and run it with pytest "
            "(tests/conftest.py creates the test database)"
        ) from None


def new_schema() -> str:
    return f"t_{secrets.token_hex(6)}"


def _claimed(schema: str) -> str:
    # Identifiers cannot be bound parameters; only names made here (or as strict) are used.
    if not _SCHEMA_NAME.fullmatch(schema):
        raise ValueError(f"unsafe schema name: {schema!r}")
    if schema not in _used:
        _used.add(schema)
        USED_SCHEMAS.append(schema)
    return schema


def _use_schema(sync_engine: Engine, schema: str) -> None:
    @event.listens_for(sync_engine, "connect", insert=True)
    def _set_search_path(dbapi_connection: Any, _record: Any) -> None:
        # Outside a transaction, so the setting survives the pool's reset of the connection.
        autocommit = dbapi_connection.autocommit
        dbapi_connection.autocommit = True
        cursor = dbapi_connection.cursor()
        cursor.execute(f'CREATE SCHEMA IF NOT EXISTS "{schema}"')
        cursor.execute(f'SET SESSION search_path TO "{schema}"')
        cursor.close()
        dbapi_connection.autocommit = autocommit


def follow_explicit_ids(sync_engine: Engine) -> None:
    """After an INSERT that names ``id``, move that table's sequence past the largest id.

    Fixtures insert rows with fixed ids (``BotUser(id=5)``); the code under test then adds
    rows with generated ids. PostgreSQL's sequence does not move for a fixed id, so the next
    generated id would collide. Only test engines do this; the app never sets ids itself.
    """
    @event.listens_for(sync_engine, "after_cursor_execute")
    def _advance_sequence(conn: Any, _cursor: Any, statement: str, *_args: Any) -> None:
        match = _INSERT_COLUMNS.match(statement)
        if match is None:
            return
        columns = {column.strip().strip('"') for column in match.group("columns").split(",")}
        if "id" not in columns:
            return
        table = match.group("table")
        # A cursor of its own: the INSERT's cursor still holds the rows its RETURNING produced.
        cursor = conn.connection.cursor()
        cursor.execute(
            f"SELECT setval(seq, GREATEST(COALESCE((SELECT MAX(id) FROM \"{table}\"), 0), 1)) "
            f"FROM (SELECT pg_get_serial_sequence('\"{table}\"', 'id') AS seq) AS serial WHERE seq IS NOT NULL"
        )
        cursor.close()


def pg_engine(*, schema: str | None = None, **kwargs: Any) -> AsyncEngine:
    """An async engine on a fresh (or the given) schema of the run's database."""
    engine = create_async_engine(run_database_url(), **kwargs)
    _use_schema(engine.sync_engine, _claimed(schema or new_schema()))
    follow_explicit_ids(engine.sync_engine)
    return engine


def sync_url(schema: str | None = None) -> str:
    """A psycopg URL of the run's database; with ``schema`` its connections start in that schema.

    Only sync (psycopg) consumers understand the schema option: Alembic through
    ``upgrade_head(url)``, or ``create_engine``. asyncpg refuses it, so async code that must
    share a schema takes an engine from :func:`pg_engine` with the same ``schema`` instead.
    """
    url = make_url(run_database_url()).set(drivername="postgresql+psycopg")
    if schema:
        url = url.update_query_dict({"options": f"-csearch_path={_claimed(schema)}"})
    return url.render_as_string(hide_password=False)


def pg_sync_engine(*, schema: str | None = None, **kwargs: Any) -> Engine:
    """A sync (psycopg) engine on a fresh (or the given) schema of the run's database."""
    engine = create_engine(sync_url(), **kwargs)
    _use_schema(engine, _claimed(schema or new_schema()))
    follow_explicit_ids(engine)
    return engine


def ensure_schema(schema: str) -> str:
    """Create ``schema`` now, for code that connects with a URL from :func:`sync_url`."""
    engine = pg_sync_engine(schema=schema)
    try:
        with engine.connect():
            pass
    finally:
        engine.dispose()
    return schema
