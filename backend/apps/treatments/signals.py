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


__all__ = ["_on_photo_saved", "_on_treatment_saved"]


@receiver(post_save, sender="treatments.Treatment", dispatch_uid="treatments.treatment.notify_on_create")
def _on_treatment_saved(sender, instance, created: bool, **kwargs):
    if not created:
        return

    try:
        from apps.notifications.models import NotificationType
        from apps.notifications.services import enqueue, notify_roles

        patient = instance.patient
        patient_name = f"{patient.first_name} {patient.last_name}"
        proc_name = instance.procedure_type.name if instance.procedure_type else "Muolaja"
        doc_user = instance.doctor.user if instance.doctor else None
        doc_name = doc_user.get_full_name() if doc_user else "Shifokor"
        price_str = f"{instance.price:,.0f}"

        # 1. Patient Notification
        msg_p = f"Hurmatli {patient_name}, sizga '{proc_name}' muolajasi kiritildi. Shifokor: Dr. {doc_name}."
        enqueue(
            notification_type=NotificationType.GENERIC,
            message=msg_p,
            patient=patient,
            context={"treatment_id": str(instance.pk)},
        )

        # 2. Bosh Shifokor Notification
        msg_bs = f"🦷 Dr. {doc_name} bemor {patient_name}ga '{proc_name}' muolajasini kiritdi (Narxi: {price_str} so'm)"
        notify_roles(
            ["bosh_shifokor"],
            notification_type=NotificationType.GENERIC,
            message=msg_bs,
            context={"treatment_id": str(instance.pk)},
        )
    except Exception:  # noqa: BLE001
        logger.exception("treatments: failed to send treatment notification for %s", instance.pk)
