"""Celery tasks for the ``treatments`` app.

The main task, :func:`process_treatment_photo`, is fired by the
``post_save`` signal on :class:`TreatmentPhoto` (see :mod:`signals`).
It resizes the source image with Pillow to a max-dimension of 300px
while preserving aspect ratio, then stores the result in the
``thumbnail`` ImageField.

Design decisions:

* The task is idempotent — running it multiple times regenerates the
  thumbnail from the source (source of truth is the ``image`` field).
* It never crashes if the source is missing or Pillow raises; those
  cases are logged so operators can react without blocking the queue.
* Tests configure ``CELERY_TASK_ALWAYS_EAGER = True`` so the task runs
  in-process (see ``tests/conftest.py``).
"""
from __future__ import annotations

import io
import logging
import os
from pathlib import Path

from celery import shared_task
from django.core.files.base import ContentFile

logger = logging.getLogger(__name__)

# Maximum thumbnail dimension (px) — PROJECT_BRIEF § "Celery Tasks".
THUMB_MAX_DIM: int = 300
THUMB_FORMAT: str = "JPEG"
THUMB_QUALITY: int = 82


def _thumbnail_filename(source_name: str) -> str:
    """Return ``<name>_thumb.jpg`` for a given source filename."""
    base = os.path.basename(source_name or "photo")
    stem, _ext = os.path.splitext(base)
    return f"{stem or 'photo'}_thumb.jpg"


def _generate_thumbnail_bytes(source_bytes: bytes) -> bytes:
    """Return JPEG-encoded thumbnail bytes for ``source_bytes``."""
    from PIL import Image, ImageOps

    with Image.open(io.BytesIO(source_bytes)) as image:
        # Exif orientation → normal orientation so the thumbnail matches
        # what the user sees on their phone.
        image = ImageOps.exif_transpose(image)
        if image.mode not in {"RGB", "RGBA"}:
            image = image.convert("RGB")
        image.thumbnail((THUMB_MAX_DIM, THUMB_MAX_DIM), Image.LANCZOS)
        if image.mode == "RGBA":
            # JPEG has no alpha channel — flatten onto white.
            background = Image.new("RGB", image.size, (255, 255, 255))
            background.paste(image, mask=image.split()[3])
            image = background
        buffer = io.BytesIO()
        image.save(buffer, format=THUMB_FORMAT, quality=THUMB_QUALITY, optimize=True)
        return buffer.getvalue()


@shared_task(
    name="apps.treatments.tasks.process_treatment_photo",
    bind=True,
    max_retries=2,
    default_retry_delay=15,
)
def process_treatment_photo(self, photo_id: str) -> str:  # noqa: ARG001
    """Generate a 300px thumbnail for the given :class:`TreatmentPhoto`.

    Returns a short status string for logging (``ok`` / ``missing`` /
    ``no-source`` / ``error``).
    """
    from .models import TreatmentPhoto

    try:
        photo = TreatmentPhoto.objects.get(pk=photo_id)
    except TreatmentPhoto.DoesNotExist:
        logger.warning("treatments: photo %s not found — skipping thumb", photo_id)
        return "missing"

    if not photo.image:
        logger.info("treatments: photo %s has no source image", photo_id)
        return "no-source"

    try:
        # Read source bytes.
        source_bytes: bytes
        try:
            with photo.image.open("rb") as fh:
                source_bytes = fh.read()
        finally:
            try:
                photo.image.close()
            except Exception:  # noqa: BLE001
                pass

        thumb_bytes = _generate_thumbnail_bytes(source_bytes)
        thumb_name = _thumbnail_filename(getattr(photo.image, "name", "photo"))
        photo.thumbnail.save(thumb_name, ContentFile(thumb_bytes), save=False)
        # Mirror into thumbnail_path for callers that only need a string.
        photo.thumbnail_path = photo.thumbnail.name or ""
        photo.save(update_fields=["thumbnail", "thumbnail_path", "updated_at"])
        return "ok"
    except FileNotFoundError:
        logger.warning(
            "treatments: source file missing for photo %s (%s)",
            photo_id,
            getattr(photo.image, "name", ""),
        )
        return "no-source"
    except Exception as exc:  # noqa: BLE001
        logger.exception("treatments: thumbnail generation failed for %s: %s", photo_id, exc)
        return "error"


__all__ = ["process_treatment_photo", "THUMB_MAX_DIM", "sweep_orphan_photos"]
_ = Path  # keep import for downstream extension without churn


@shared_task(name="apps.treatments.tasks.sweep_orphan_photos")
def sweep_orphan_photos() -> str:
    """T133 — periodic media-hygiene sweep.

    Wraps ``manage.py orphan_photo_cleanup --apply`` so Celery Beat can
    run it on a schedule. Deletes files under ``MEDIA_ROOT/treatments/``
    that no live :class:`TreatmentPhoto` row references. Idempotent:
    a second run finds nothing to remove.
    """
    from django.core.management import call_command

    call_command("orphan_photo_cleanup", "--apply", verbosity=0)
    return "ok"
