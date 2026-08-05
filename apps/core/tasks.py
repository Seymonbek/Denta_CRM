"""Cross-cutting Celery tasks that don't belong to a single domain app.

Currently exposes :func:`backup_database` — a nightly ``pg_dump`` of the
active PostgreSQL database written into ``MEDIA_ROOT/backups/`` (or a
configurable ``DB_BACKUPS_DIR``). Backups are opt-in via the
``DB_BACKUPS_ENABLED`` setting so tests and dev environments don't try
to shell out to ``pg_dump``.
"""
from __future__ import annotations

import logging
import os
import subprocess
from datetime import datetime
from pathlib import Path

from celery import shared_task
from django.conf import settings
from django.db import connection

logger = logging.getLogger(__name__)


def _resolve_backups_dir() -> Path:
    override = getattr(settings, "DB_BACKUPS_DIR", "") or ""
    if override:
        return Path(override)
    return Path(getattr(settings, "MEDIA_ROOT", ".")) / "backups"


@shared_task(name="apps.core.tasks.backup_database")
def backup_database() -> str:
    """Write a ``pg_dump`` of the default DB to disk.

    Returns the resolved backup path (or a short reason string when the
    task is skipped). Always safe to run — never raises.
    """
    if not getattr(settings, "DB_BACKUPS_ENABLED", False):
        logger.info("core: DB_BACKUPS_ENABLED is False, skipping backup")
        return "disabled"

    db_conf = connection.settings_dict
    engine = db_conf.get("ENGINE", "")
    if "postgresql" not in engine:
        logger.info("core: DB engine %s is not postgres, skipping", engine)
        return "unsupported-engine"

    backups_dir = _resolve_backups_dir()
    backups_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    filename = backups_dir / f"dentacrm-{timestamp}.sql"

    env = os.environ.copy()
    if db_conf.get("PASSWORD"):
        env["PGPASSWORD"] = db_conf["PASSWORD"]

    cmd = [
        "pg_dump",
        "--host", str(db_conf.get("HOST") or "localhost"),
        "--port", str(db_conf.get("PORT") or "5432"),
        "--username", str(db_conf.get("USER") or "postgres"),
        "--dbname", str(db_conf.get("NAME") or "postgres"),
        "--file", str(filename),
        "--no-owner",
        "--format", "plain",
    ]

    try:
        subprocess.run(
            cmd,
            check=True,
            env=env,
            capture_output=True,
            timeout=60 * 30,
        )
        logger.info("core: database backup written to %s", filename)
        return str(filename)
    except FileNotFoundError:
        logger.warning("core: pg_dump binary not found in PATH")
        return "pg_dump-missing"
    except subprocess.CalledProcessError as exc:
        logger.error(
            "core: pg_dump failed rc=%s stderr=%s",
            exc.returncode,
            (exc.stderr or b"").decode("utf-8", "replace")[:500],
        )
        return "failed"
    except Exception as exc:  # noqa: BLE001
        logger.exception("core: backup task crashed: %s", exc)
        return "crashed"


__all__ = ["backup_database"]
