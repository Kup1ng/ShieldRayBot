# Phase A — Database Foundation

**Version:** builds on 3.8.3  
**Scope:** PostgreSQL + Alembic + SQLite→PG tooling + PostgreSQL backup/restore  
**Out of scope:** global CLI, identity sync, permissions parity, node ops

**Runtime model:** one `DATABASE_URL` per process, PostgreSQL only. The app refuses
any other URL at startup, the tests run on PostgreSQL (`tests/conftest.py`,
`tests/pgtest.py`), and the one place that still reads SQLite is the offline
migration of an old SQLite database documented below. There is no
dual-write / dual-runtime path.

---

## Phase 0 — Baseline (required before cutover)

```bash
# Ensure schema exists (creates/stamps Alembic on current DATABASE_URL)
.venv/bin/python -m scripts.alembic_upgrade

# Create production baseline: ZIP backup (pg_dump) + configs + git/version + restore verify
.venv/bin/python -m scripts.phase0_baseline --note "pre-phase-a"
```

Artifacts land in `data/baselines/phase0-<timestamp>/`:

| File | Purpose |
|------|---------|
| `BASELINE.json` | Git commit, version, hashes, restore verification |
| `pgclock-backup-*.zip` | Full archive |
| `config/env` | `.env` snapshot |
| `config/web_admin.json` | Owner credentials (if present) |

Restore verification is a **sandbox dry-run** (live data is not overwritten).

---

## Phase A — PostgreSQL production setup

**Default path:** `bash pgclock.sh install` installs PostgreSQL packages, starts
the service, creates role/database `pgclock`, and writes `DATABASE_URL` into `.env`.
No SQLite scaffold on fresh installs.

Optional override (managed/remote Postgres):

```bash
export PGCLOCK_DATABASE_URL="postgresql+asyncpg://user:SECRET@host:5432/db"
bash pgclock.sh install
```

Manual provision (if you are not using the installer):

```bash
sudo bash scripts/setup_postgres.sh pgclock pgclock
# prints DATABASE_URL=postgresql+asyncpg://...
.venv/bin/python -m scripts.alembic_upgrade
```

Recommended `.env`:

```env
DATABASE_URL="postgresql+asyncpg://pgclock:SECRET@127.0.0.1:5432/pgclock"
```

---

## Alembic

```bash
.venv/bin/python -m scripts.alembic_upgrade          # upgrade head
.venv/bin/python -m scripts.alembic_upgrade --current
.venv/bin/python -m scripts.alembic_upgrade --downgrade
```

Baseline revision: `0001_baseline` (full schema from `app.db.models` + `uq_wallet_referral_reason`).

`init_db()` on startup:

1. If tables exist but `alembic_version` missing → legacy additive migrator once → `stamp head`
2. Else → `alembic upgrade head`
3. `create_all` only as emergency fallback (empty DB / `PGCLOCK_ALLOW_CREATE_ALL=1`)

---

## SQLite → PostgreSQL migration

```bash
# 1) Phase 0 baseline first
.venv/bin/python -m scripts.phase0_baseline

# 2) Prepare empty PostgreSQL + schema
sudo bash scripts/setup_postgres.sh
.venv/bin/python -m scripts.migrate_sqlite_to_pg \
  --source 'sqlite+aiosqlite:////ABS/PATH/data/bot.db' \
  --target 'postgresql+asyncpg://pgclock:SECRET@127.0.0.1:5432/pgclock'

# 3) Point .env DATABASE_URL at PostgreSQL and restart service
```

Validation compares row counts, settings keys, wallet/billing sums, and reports VARCHAR overflows.

---

## Backup / restore

Backups hold `data/postgres.dump` (`pg_dump -Fc`, restored with `pg_restore`); the manifest's
`db_engine` is always `postgresql`. An old archive that holds a SQLite database (`data/bot.db`
or `db_engine: sqlite`) is still listed but refused for restore: move it into PostgreSQL with
`pgclock migrate --from-sqlite` first.

---

## Rollback

1. Stop service  
2. Restore the Phase 0 backup ZIP into PostgreSQL (`pg_restore` through the panel or CLI)  
3. Start service  
4. Keep the abandoned database for forensics (do not drop immediately)

A SQLite runtime is no longer supported, so rolling back to SQLite is not an option.

Alembic downgrade: `.venv/bin/python -m scripts.alembic_upgrade --downgrade` (drops baseline schema — destructive).

---

## Phase 0 verification (this branch)

Executed in the migration environment before Phase A merge:

```text
.venv/bin/python -m scripts.phase0_baseline --note "phase0-verified-before-phase-a"
→ ok=true, restore_verification.ok=true, sqlite tables_sample present
.venv/bin/python -m scripts.migrate_sqlite_to_pg … → ok=true, counts matched
pytest tests/test_phase0_baseline.py tests/test_phase_a_database.py → 6 passed
```

## Final verification pass (pre-approval)

```text
Full suite: 826 passed, 22 failed (848 total)
  - Same 22 failures reproduce on origin/main (pre-existing; not Phase A regressions)
  - Prior Phase A audit flake BackupManifestPathTests: fixed and passing
SQLite smoke (clean): init / login / health / backup / restore → all ok
PostgreSQL smoke (clean DB pgclock_smoke): init / login / health / backup / restore → all ok
```

**Recommendation:** Approve Phase A. Do not start Phase B until explicitly requested.
