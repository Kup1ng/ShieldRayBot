"""An old SQLite backup is still listed but is never restored; it must be moved to PostgreSQL first."""

from __future__ import annotations

import hashlib
import json
import zipfile
from pathlib import Path

import pytest

from app.services import backup as backup_mod


@pytest.fixture
def isolated_backups(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    (data_dir / "backups").mkdir(parents=True)
    monkeypatch.setattr(backup_mod, "ROOT_DIR", tmp_path)
    monkeypatch.setattr(backup_mod, "DATA_DIR", data_dir)
    monkeypatch.setattr(backup_mod, "BACKUP_DIR", data_dir / "backups")
    monkeypatch.setattr(backup_mod, "RESTORE_STATUS_FILE", data_dir / "backup_restore.json")
    monkeypatch.setattr(backup_mod, "RESTORE_NOTICE_FILE", data_dir / "backup_restore_notice.json")
    return data_dir


def _write_sqlite_archive(data_dir: Path, *, declare_engine: bool) -> Path:
    payload = b"SQLite format 3\x00 pretend database"
    admin = b'{"u":"old"}'
    manifest = {
        "magic": backup_mod.MAGIC,
        "created_at": "2024-01-01T00:00:00+00:00",
        "app_version": "0.0.1",
        "files": [
            {"path": "data/bot.db", "sha256": hashlib.sha256(payload).hexdigest(), "size": len(payload)},
            {"path": "data/web_admin.json", "sha256": hashlib.sha256(admin).hexdigest(), "size": len(admin)},
        ],
    }
    if declare_engine:
        manifest["db_engine"] = "sqlite"
    path = data_dir / "backups" / f"{backup_mod.BACKUP_PREFIX}old-sqlite.zip"
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr(backup_mod.MANIFEST_NAME, json.dumps(manifest))
        zf.writestr("data/bot.db", payload)
        zf.writestr("data/web_admin.json", admin)
    return path


@pytest.mark.parametrize("declare_engine", [True, False])
def test_sqlite_archive_is_listed_and_valid(isolated_backups, declare_engine):
    path = _write_sqlite_archive(isolated_backups, declare_engine=declare_engine)

    ok, err, manifest = backup_mod.validate_backup_archive(path)

    assert ok, err
    assert manifest["db_engine"] == "sqlite"
    listed = backup_mod.list_backups()
    assert [item["filename"] for item in listed] == [path.name]
    assert listed[0]["db_engine"] == ("sqlite" if declare_engine else "")


@pytest.mark.parametrize("declare_engine", [True, False])
def test_sqlite_archive_is_refused_for_restore_and_nothing_changes(isolated_backups, monkeypatch, declare_engine):
    path = _write_sqlite_archive(isolated_backups, declare_engine=declare_engine)
    live_admin = isolated_backups / "web_admin.json"
    live_admin.write_text('{"u":"live"}', encoding="utf-8")
    touched: list[str] = []
    monkeypatch.setattr(backup_mod, "restore_database", lambda *_a, **_k: touched.append("restore_database"))
    monkeypatch.setattr(backup_mod, "dump_database", lambda *_a, **_k: touched.append("dump_database"))

    result = backup_mod.restore_backup(path, restore_env=True, safety_backup=True, restart=False, actor="test")

    assert result["ok"] is False
    assert result["error"] == backup_mod.SQLITE_BACKUP_MESSAGE
    assert "SQLite" in result["error"] and "pgclock migrate --from-sqlite" in result["error"]
    assert touched == []
    assert live_admin.read_text(encoding="utf-8") == '{"u":"live"}'
    # No safety backup was made and the archive itself is still there.
    assert [p.name for p in (isolated_backups / "backups").glob("*.zip")] == [path.name]
    status = backup_mod.read_restore_status()
    assert status["state"] == "error"
    assert status["error"] == backup_mod.SQLITE_BACKUP_MESSAGE


def test_new_backups_are_always_postgresql(isolated_backups, monkeypatch):
    def fake_dump(dest: Path) -> None:
        dest.write_bytes(b"PGDMP fake")

    monkeypatch.setattr(backup_mod, "dump_database", fake_dump)

    created = backup_mod.create_backup(note="pg only", include_env=False, created_by="test")

    assert created["db_engine"] == "postgresql"
    ok, err, manifest = backup_mod.validate_backup_archive(Path(created["path"]))
    assert ok, err
    assert manifest["db_engine"] == "postgresql"
    assert manifest["db_path"] == "data/postgres.dump"
    with zipfile.ZipFile(created["path"]) as zf:
        assert "data/bot.db" not in zf.namelist()
        assert "data/postgres.dump" in zf.namelist()
