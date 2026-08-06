"""Signal handlers for the ``treatments`` app.

* ``post_save`` on :class:`TreatmentPhoto` enqueues the
  :func:`process_treatment_photo` Celery task so a 300px thumbnail is
  generated asynchronously.

When ``CELERY_TASK_ALWAYS_EAGER`` is True (unit tests) the task runs
in-process — no broker required.
"""
from __future__ import annotations

import logging

from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import TreatmentPhoto

logger = logging.getLogger(__name__)


@receiver(
    post_save,
    sender=TreatmentPhoto,
    dispatch_uid="treatments.photo.generate_thumbnail",
)
def _on_photo_saved(sender, instance: TreatmentPhoto, created: bool, **kwargs):
    """Kick off thumbnail generation for newly-uploaded photos."""
    if not created:
        return
    if not instance.image:
        return

    try:
        from .tasks import process_treatment_photo
    except Exception:  # noqa: BLE001
        logger.exception(
            "treatments: cannot import process_treatment_photo (photo=%s)",
            instance.pk,
        )
        return

    try:
        if getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False):
            # Run inline so tests never need a broker.
            process_treatment_photo.apply(args=[str(instance.pk)])
        else:
            process_treatment_photo.delay(str(instance.pk))
    except Exception:  # noqa: BLE001
        logger.exception(
            "treatments: failed to enqueue thumbnail for photo %s",
            instance.pk,
        )


__all__ = ["_on_photo_saved"]
