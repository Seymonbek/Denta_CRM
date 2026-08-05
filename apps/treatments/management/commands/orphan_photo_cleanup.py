"""T133 — Remove orphaned treatment-photo files from MEDIA_ROOT.

Deletes files (and their thumbnail siblings) that live under
``MEDIA_ROOT/treatments/`` but are NOT referenced by any live
:class:`~apps.treatments.models.TreatmentPhoto` row. Historical test
runs (before the T133 conftest change) filled the repo's
``dentacrm/backend/media/treatments/`` with 170+ UUID directories;
this command cleans them up on demand and can be scheduled via Celery
Beat for periodic housekeeping in prod.

Usage:

    python manage.py orphan_photo_cleanup           # dry-run (default)
    python manage.py orphan_photo_cleanup --apply   # actually delete
    python manage.py orphan_photo_cleanup --apply --verbosity 2

The command NEVER deletes a directory that still contains a file
referenced by a live TreatmentPhoto row — the set of live paths is
computed up-front and every candidate is checked against it before
removal. Soft-deleted photos (``is_active=False``) are considered
live so their files stay recoverable via the admin's
``simple_history`` audit trail.
"""
from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand

from apps.treatments.models import TreatmentPhoto


class Command(BaseCommand):
    help = "Delete orphaned treatment photo files not referenced by any row."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Actually delete files. Without this flag the command "
                 "runs in dry-run mode and only lists what would be removed.",
        )
        parser.add_argument(
            "--subdir",
            default="treatments",
            help="Subdirectory of MEDIA_ROOT to sweep (default: treatments).",
        )

    def handle(self, *args: Any, **options: Any) -> None:
        apply_flag: bool = options["apply"]
        subdir: str = options["subdir"]

        media_root = Path(settings.MEDIA_ROOT)
        target_dir = media_root / subdir
        if not target_dir.exists():
            self.stdout.write(
                self.style.NOTICE(f"{target_dir} does not exist — nothing to do.")
            )
            return

        live_paths = _collect_live_paths()
        removed_files = 0
        removed_dirs = 0
        skipped_dirs = 0

        # Walk one level at a time so we can remove empty parent dirs.
        for entry in sorted(target_dir.iterdir()):
            if not entry.is_dir():
                continue
            if _dir_contains_live_photo(entry, live_paths, media_root):
                skipped_dirs += 1
                continue
            # Every file below this directory is orphaned. Delete.
            if apply_flag:
                # Count files before removal for the report.
                for _ in entry.rglob("*"):
                    removed_files += 1
                shutil.rmtree(entry, ignore_errors=True)
            else:
                for path in entry.rglob("*"):
                    if path.is_file():
                        removed_files += 1
                        self.stdout.write(f"  would delete: {path}")
            removed_dirs += 1
            if apply_flag:
                self.stdout.write(
                    self.style.WARNING(f"deleted directory: {entry}")
                )
            else:
                self.stdout.write(
                    self.style.NOTICE(f"would delete directory: {entry}")
                )

        verb = "removed" if apply_flag else "would remove"
        self.stdout.write(
            self.style.SUCCESS(
                f"{verb} {removed_files} file(s) in {removed_dirs} dir(s); "
                f"kept {skipped_dirs} live dir(s)."
            )
        )
        if not apply_flag:
            self.stdout.write(
                self.style.NOTICE("Re-run with --apply to actually delete.")
            )


def _collect_live_paths() -> set[str]:
    """Return every file path currently referenced by a TreatmentPhoto row.

    Includes soft-deleted rows (``is_active=False``) so their files
    stay recoverable through history.
    """
    live: set[str] = set()
    for photo in TreatmentPhoto.objects.all().only(
        "image", "thumbnail", "thumbnail_path"
    ):
        image = getattr(photo, "image", None)
        if image and getattr(image, "name", ""):
            live.add(image.name)
        thumbnail = getattr(photo, "thumbnail", None)
        if thumbnail and getattr(thumbnail, "name", ""):
            live.add(thumbnail.name)
        thumb_path = getattr(photo, "thumbnail_path", "") or ""
        if thumb_path:
            live.add(thumb_path)
    return live


def _dir_contains_live_photo(
    entry: Path, live_paths: set[str], media_root: Path,
) -> bool:
    """Does any file below ``entry`` match a live TreatmentPhoto row?"""
    for candidate in entry.rglob("*"):
        if not candidate.is_file():
            continue
        try:
            rel = candidate.relative_to(media_root).as_posix()
        except ValueError:
            continue
        if rel in live_paths:
            return True
    return False
