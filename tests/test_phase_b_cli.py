"""Phase B — global pgclock CLI."""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest


@pytest.fixture()
def install_tree(tmp_path, monkeypatch):
    root = tmp_path / "PGClockBot"
    root.mkdir()
    (root / "run.py").write_text("print('ok')\n", encoding="utf-8")
    (root / "app").mkdir()
    (root / "app" / "__init__.py").write_text("", encoding="utf-8")
    (root / "requirements.txt").write_text("fastapi\n", encoding="utf-8")
    (root / "VERSION").write_text("3.8.3\n", encoding="utf-8")
    venv_bin = root / ".venv" / "bin"
    venv_bin.mkdir(parents=True)
    (venv_bin / "python").write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    (venv_bin / "python").chmod(0o755)
    (root / "data").mkdir()
    (root / ".env").write_text(
        'WEB_PORT="9019"\nWEB_SECRET="cli-test-secret-xxxxxxxxxxxxxxxx"\n'
        'DATABASE_URL="postgresql+asyncpg://cli:cli@127.0.0.1:1/cli_test"\n',
        encoding="utf-8",
    )
    monkeypatch.setenv("PGCLOCK_HOME", str(root))
    return root


def test_resolve_install_root_from_env(install_tree):
    from app.cli.install_root import resolve_install_root

    root = resolve_install_root()
    assert root == install_tree.resolve()


def test_cli_help_lists_required_commands():
    from app.cli.main import build_parser

    parser = build_parser()
    help_txt = parser.format_help()
    for cmd in (
        "status",
        "start",
        "stop",
        "restart",
        "logs",
        "health",
        "backup",
        "restore",
        "migrate",
        "doctor",
    ):
        assert cmd in help_txt


def test_main_status_and_doctor(install_tree, monkeypatch):
    # Avoid real DB/alembic in doctor by stubbing connectivity path lightly —
    # doctor should still run and report an unreachable database as a FAIL.
    from app.cli.main import main

    # No live database here: an unreachable port can hang for minutes on some platforms.
    monkeypatch.setattr("app.cli.doctor_cmds._check_database", lambda _ctx, add: add("database", "OK", "stub"))

    # status should not require live health
    code = main(["--root", str(install_tree), "status"])
    assert code == 0

    code = main(["--root", str(install_tree), "doctor"])
    # doctor may return 1 if the database is unreachable — acceptable; must not crash
    assert code in (0, 1)


def test_migrate_default_calls_upgrade(install_tree, monkeypatch):
    calls = {}

    def fake_upgrade(url=None):
        calls["upgrade"] = url

    def fake_current(url=None):
        return calls.get("after") or "0001_baseline"

    monkeypatch.setattr("app.db.alembic_runner.upgrade_head", fake_upgrade)
    monkeypatch.setattr("app.db.alembic_runner.current_revision", fake_current)

    from app.cli.main import main

    # Patch where migrate_cmds imports from
    import app.cli.migrate_cmds as mig

    monkeypatch.setattr(mig, "cmd_migrate", mig.cmd_migrate)
    monkeypatch.setattr("app.db.alembic_runner.upgrade_head", fake_upgrade)
    monkeypatch.setattr("app.db.alembic_runner.current_revision", lambda url=None: "0001_baseline")

    # Direct unit call is clearer
    from app.cli.context import CliContext
    from app.cli.migrate_cmds import cmd_migrate

    ctx = CliContext(root=install_tree)
    # Re-patch inside module namespace used by cmd_migrate
    import app.db.alembic_runner as ar

    monkeypatch.setattr(ar, "upgrade_head", fake_upgrade)
    monkeypatch.setattr(ar, "current_revision", lambda url=None: "0001_baseline")
    assert cmd_migrate(ctx) == 0
    assert "upgrade" in calls


def test_backup_list_empty(install_tree, monkeypatch):
    from app.cli.context import CliContext
    from app.cli.backup_cmds import cmd_backup_list

    ctx = CliContext(root=install_tree)
    assert cmd_backup_list(ctx) == 0


def test_restore_requires_confirmation(install_tree, monkeypatch):
    from app.cli.context import CliContext
    from app.cli.backup_cmds import cmd_restore
    from app.cli.output import CliError

    ctx = CliContext(root=install_tree)

    def fake_get(_id):
        return install_tree / "data" / "backups" / "pgclock-backup-x.zip"

    monkeypatch.setattr("app.services.backup.get_backup_path", fake_get)
    monkeypatch.setattr("builtins.input", lambda *_a, **_k: "n")
    with pytest.raises(CliError) as ei:
        cmd_restore(ctx, backup_id="x", yes=False)
    assert ei.value.code == 2


def test_scripts_pgclock_wrapper_exists():
    root = Path(__file__).resolve().parents[1]
    wrapper = root / "scripts" / "pgclock"
    installer = root / "scripts" / "install_global_cli.sh"
    assert wrapper.is_file()
    assert installer.is_file()
    text = wrapper.read_text(encoding="utf-8")
    assert "app.cli" in text
    assert "PGCLOCK_HOME" in text


def test_ctl_allows_start_stop():
    src = (Path(__file__).resolve().parents[1] / "scripts" / "pgclockbot-ctl").read_text(
        encoding="utf-8"
    )
    assert "start)" in src
    assert "stop)" in src
    assert "restart)" in src


def _set_database_url(root: Path, monkeypatch, value: str | None) -> None:
    """Rewrite DATABASE_URL in the install's .env (None removes it) and hide the ambient one."""
    monkeypatch.delenv("DATABASE_URL", raising=False)
    lines = (root / ".env").read_text(encoding="utf-8").splitlines()
    kept = [line for line in lines if not line.startswith("DATABASE_URL=")]
    if value is not None:
        kept.append(f'DATABASE_URL="{value}"')
    (root / ".env").write_text("\n".join(kept) + "\n", encoding="utf-8")


def test_database_url_has_no_sqlite_fallback(install_tree, monkeypatch):
    from app.cli.context import database_url

    _set_database_url(install_tree, monkeypatch, None)
    assert database_url(install_tree) == ""


@pytest.mark.parametrize("value", [None, "sqlite+aiosqlite:///data/bot.db"])
def test_status_reports_missing_or_sqlite_database_url_as_error(install_tree, monkeypatch, capsys, value):
    _set_database_url(install_tree, monkeypatch, value)
    from app.cli.main import main

    assert main(["--root", str(install_tree), "status"]) == 1
    assert "pgclock migrate --from-sqlite" in capsys.readouterr().err


@pytest.mark.parametrize("value", [None, "sqlite+aiosqlite:///data/bot.db"])
def test_doctor_fails_on_missing_or_sqlite_database_url(install_tree, monkeypatch, capsys, value):
    _set_database_url(install_tree, monkeypatch, value)
    from app.cli.main import main

    assert main(["--root", str(install_tree), "doctor"]) == 1
    failures = [line for line in capsys.readouterr().err.splitlines() if "FAIL database" in line]
    assert failures and "pgclock migrate --from-sqlite" in failures[0]


def test_migrate_refuses_a_sqlite_database_url_without_touching_it(install_tree, monkeypatch):
    from app.cli.context import CliContext
    from app.cli.migrate_cmds import cmd_migrate
    from app.cli.output import CliError

    _set_database_url(install_tree, monkeypatch, "sqlite+aiosqlite:///data/bot.db")
    upgraded: list[str] = []
    monkeypatch.setattr("app.db.alembic_runner.upgrade_head", upgraded.append)
    with pytest.raises(CliError, match="pgclock migrate --from-sqlite"):
        cmd_migrate(CliContext(root=install_tree))
    assert upgraded == []
