"""Signal handlers for the ``prescriptions`` app."""
from __future__ import annotations

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.notifications.models import NotificationLog, NotificationStatus, NotificationType
from .models import Prescription

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Prescription, dispatch_uid="prescriptions.prescription_created")
def _on_prescription_created(sender, instance: Prescription, created: bool, **kwargs):
    """Enqueue a notification to the patient when a prescription is created."""
    if not created:
        return
    treatment = getattr(instance, "treatment", None)
    if treatment is None:
        return
    patient = getattr(treatment, "patient", None)
    if patient is None:
        return

    try:
        from apps.notifications.services import enqueue

        msg = (
            f"Hurmatli {patient.first_name} {patient.last_name}, "
            f"sizning davolashingiz bo'yicha shifokor tomonidan quyidagi retsept yozildi:\n\n"
            f"{instance.content}"
        )

        enqueue(
            notification_type=NotificationType.PRESCRIPTION_SENT,
            message=msg,
            patient=patient,
            context={
                "prescription_id": str(instance.pk),
                "treatment_id": str(treatment.pk),
            },
        )
    except Exception:  # noqa: BLE001
        logger.exception(
            "prescriptions: failed to enqueue notification for prescription=%s",
            instance.pk,
        )


@receiver(post_save, sender=NotificationLog, dispatch_uid="prescriptions.sync_sent_at")
def _on_notification_sent(sender, instance: NotificationLog, created: bool, **kwargs):
    """Sync sent_to_telegram_at on Prescription when its notification log is sent."""
    if created:
        return
    if instance.type != NotificationType.PRESCRIPTION_SENT:
        return
    if instance.status != NotificationStatus.SENT:
        return

    prescription_id = instance.context.get("prescription_id")
    if not prescription_id:
        return

    try:
        prescription = Prescription.objects.get(pk=prescription_id)
        if prescription.sent_to_telegram_at is None:
            prescription.sent_to_telegram_at = instance.sent_at or instance.updated_at
            prescription.save(update_fields=["sent_to_telegram_at", "updated_at"])
    except Prescription.DoesNotExist:
        pass
    except Exception:  # noqa: BLE001
        logger.exception(
            "prescriptions: failed to sync sent_to_telegram_at for prescription=%s",
            prescription_id,
        )


__all__ = [
    "_on_prescription_created",
    "_on_notification_sent",
]
