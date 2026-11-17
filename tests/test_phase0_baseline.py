"""Phase 0 baseline — backup, version record, restore verification (PostgreSQL archives only)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

import app.services.backup as backup
import app.services.baseline as baseline


@pytest.fixture()
def install(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    backups = data_dir / "backups"
    backups.mkdir(parents=True)
    (data_dir / "web_admin.json").write_text(
        json.dumps({"username": "admin", "password_hash": "$2b$12$testhash"}),
        encoding="utf-8",
    )
    (tmp_path / ".env").write_text('WEB_SECRET="test-secret-phase0-xxxxxx"\n', encoding="utf-8")

    monkeypatch.setattr(backup, "ROOT_DIR", tmp_path)
    monkeypatch.setattr(backup, "DATA_DIR", data_dir)
    monkeypatch.setattr(backup, "BACKUP_DIR", backups)
    monkeypatch.setattr(baseline, "ROOT_DIR", tmp_path)
    monkeypatch.setattr(baseline, "DATA_DIR", data_dir)
    monkeypatch.setattr(baseline, "BASELINE_DIR", data_dir / "baselines")
    monkeypatch.setattr(backup, "dump_database", lambda dest: dest.write_bytes(b"PGDMP fake dump"))
    return tmp_path


def test_phase0_baseline_creates_artifacts_and_verifies_restore(install):
    result = baseline.create_phase0_baseline(note="unit-test-phase0", verify_restore=True)

    assert result["ok"] is True
    root = Path(result["path"])
    assert (root / "BASELINE.json").is_file()
    assert not (root / "bot.db").exists()
    assert list(root.glob("pgclock-backup-*.zip"))
    assert (root / "config" / "env").is_file()
    assert (root / "config" / "web_admin.json").is_file()

    record = result["record"]
    assert record["magic"] == "pgclock-phase0-baseline-v1"
    assert record["git"]["commit"]
    assert "sqlite_copy" not in record and "sqlite_db_path" not in record
    verification = record["restore_verification"]
    assert verification["ok"] is True
    assert verification["engine"] == "postgresql"
    assert verification["postgres_dump_size"] == len(b"PGDMP fake dump")
    assert verification["has_web_admin"] is True
    assert verification["has_env"] is True

    latest = baseline.latest_baseline()
    assert latest is not None
    assert latest["baseline_id"] == result["baseline_id"]


def test_verify_restore_procedure_rejects_an_old_sqlite_archive(install):
    import hashlib
    import zipfile

    payload = b"SQLite format 3\x00"
    manifest = {
        "magic": backup.MAGIC,
        "db_engine": "sqlite",
        "files": [{"path": "data/bot.db", "sha256": hashlib.sha256(payload).hexdigest(), "size": len(payload)}],
    }
    archive = install / "old.zip"
    with zipfile.ZipFile(archive, "w") as zf:
        zf.writestr(backup.MANIFEST_NAME, json.dumps(manifest))
        zf.writestr("data/bot.db", payload)

    result = baseline.verify_restore_procedure(archive)

    assert result["ok"] is False
    assert result["validate_error"] == backup.SQLITE_BACKUP_MESSAGE
