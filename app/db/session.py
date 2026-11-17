from __future__ import annotations

import logging
import os

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings
from app.db import Base
from app.db.engine_url import normalize_async_url, parse_engine

# Register models on Base.metadata for Alembic / legacy paths
import app.db.models  # noqa: F401

log = logging.getLogger(__name__)

def postgres_pool_options(config) -> dict[str, object]:
    """Pool settings for a PostgreSQL engine, sized from DB_POOL_SIZE / DB_MAX_OVERFLOW."""
    return {"pool_pre_ping": True, "pool_size": config.db_pool_size, "max_overflow": config.db_max_overflow}


POSTGRESQL_ONLY = (
    "ShieldRay runs on PostgreSQL only: set DATABASE_URL to a postgresql+asyncpg:// URL. "
    "An old SQLite database is moved with: pgclock migrate --from-sqlite --source <sqlite url>"
)


def _postgresql_url(raw: str) -> str:
    """The configured URL, refused unless it is PostgreSQL (SQLite support was removed)."""
    try:
        url = normalize_async_url(raw)
    except ValueError:
        raise RuntimeError(POSTGRESQL_ONLY) from None
    if not parse_engine(url).is_postgresql:
        raise RuntimeError(POSTGRESQL_ONLY)
    return url


settings = get_settings()
_db_url = _postgresql_url(settings.database_url)
_engine_info = parse_engine(_db_url)
# Never hang forever on a dead/mis-authed Postgres — panel boot was
# blocked on init_db() with no listener until this connect returned.
_engine_kwargs: dict = {"echo": False, "future": True, "connect_args": {"timeout": 15}}
_engine_kwargs.update(postgres_pool_options(settings))
engine = create_async_engine(_db_url, **_engine_kwargs)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

# Allow tests / migrator to force legacy create_all bootstrap
_ALLOW_CREATE_ALL = os.environ.get("PGCLOCK_ALLOW_CREATE_ALL", "").strip() in {
    "1",
    "true",
    "yes",
}


def _tables_exist(sync_conn) -> bool:
    from sqlalchemy import inspect

    insp = inspect(sync_conn)
    return insp.has_table("bot_users") and insp.has_table("settings")


def _alembic_version_exists(sync_conn) -> bool:
    from sqlalchemy import inspect

    return inspect(sync_conn).has_table("alembic_version")


async def init_db() -> None:
    """Initialize schema via Alembic; legacy create_all only as controlled fallback.

    Must not hang forever — uvicorn only binds *after* this returns. Postgres
    connect/auth failures previously left the unit \"active\" with no listener.
    """
    from app.db.alembic_runner import stamp_head, upgrade_head

    log.info(
        "init_db start · dialect=%s · target=%s",
        _engine_info.dialect,
        (_db_url.split("@", 1)[-1] if "@" in _db_url else _engine_info.dialect),
    )

    async with engine.begin() as conn:
        has_tables = await conn.run_sync(lambda c: _tables_exist(c))
        has_alembic = await conn.run_sync(lambda c: _alembic_version_exists(c))

    if has_tables and not has_alembic:
        # A database created before Alembic: stamp head only if Phase 1–3 objects exist.
        log.warning("Existing database without alembic_version — stamping Alembic head")
        async with engine.begin() as conn:
            await conn.run_sync(_assert_ready_to_stamp_head)
        stamp_head(_db_url)
    else:
        # Fresh DB or already under Alembic — upgrade to head (no create_all).
        try:
            upgrade_head(_db_url)
        except Exception:
            if _ALLOW_CREATE_ALL or not has_tables:
                log.exception(
                    "Alembic upgrade failed; falling back to create_all "
                    "(set PGCLOCK_ALLOW_CREATE_ALL=1 to silence in labs)"
                )
                async with engine.begin() as conn:
                    await conn.run_sync(Base.metadata.create_all)
                try:
                    stamp_head(_db_url)
                except Exception:
                    log.exception("Failed to stamp Alembic head after create_all fallback")
            else:
                raise

    log.info("init_db done · dialect=%s", _engine_info.dialect)


def _missing_alembic_head_schema(sync_conn) -> list[str]:
    """Return required Phase 1–3 objects that are absent (never invent data)."""
    from sqlalchemy import inspect

    insp = inspect(sync_conn)
    missing: list[str] = []
    if not insp.has_table("org_principals"):
        missing.append("org_principals")
        return missing
    cols = {c["name"] for c in insp.get_columns("org_principals")}
    if "pg_password_enc" not in cols:
        missing.append("org_principals.pg_password_enc")
    if "pg_api_key_enc" not in cols:
        missing.append("org_principals.pg_api_key_enc")
    if not insp.has_table("org_principal_provisions"):
        missing.append("org_principal_provisions")
    if not insp.has_table("org_principal_web_identities"):
        missing.append("org_principal_web_identities")
    idx_names = {ix.get("name") for ix in insp.get_indexes("org_principals")}
    if "uq_org_principals_bot_user_id" not in idx_names:
        missing.append("uq_org_principals_bot_user_id")
    return missing


def _assert_ready_to_stamp_head(sync_conn) -> None:
    """Refuse to stamp Alembic head when the compatibility migrator is incomplete."""
    missing = _missing_alembic_head_schema(sync_conn)
    if not missing:
        return
    raise RuntimeError(
        "Pre-Alembic database is missing required schema after the "
        "compatibility migrator: "
        + ", ".join(missing)
        + ". Refusing to stamp Alembic head as current."
    )
