"""Signal handlers for the ``scheduling`` app."""
from __future__ import annotations

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

from apps.notifications.models import NotificationLog, NotificationType
from .models import Appointment, AppointmentStatus

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Appointment, dispatch_uid="scheduling.appointment_created_or_cancelled")
def _on_appointment_saved(sender, instance: Appointment, created: bool, **kwargs):
    """Send real-time notification to the patient when appointment is created or cancelled."""
    patient = getattr(instance, "patient", None)
    if patient is None:
        return

    try:
        from apps.notifications.services import enqueue

        # Case 1: Newly Created Appointment
        if created:
            already_sent = NotificationLog.objects.filter(
                patient=patient,
                type=NotificationType.GENERIC,
                context__appointment_id=str(instance.pk),
                context__event="appointment_created",
            ).exists()
            if not already_sent:
                start_local = timezone.localtime(instance.scheduled_start)
                msg = (
                    f"Hurmatli {patient.first_name} {patient.last_name}, "
                    f"sizga {start_local.strftime('%d.%m.%Y')} kuni soat {start_local.strftime('%H:%M')} da "
                    f"shifokor {instance.doctor.user.first_name} {instance.doctor.user.last_name} qabuliga navbat belgilandi."
                )
                enqueue(
                    notification_type=NotificationType.GENERIC,
                    message=msg,
                    patient=patient,
                    context={
                        "appointment_id": str(instance.pk),
                        "event": "appointment_created",
                    },
                )

        # Case 2: Cancelled Appointment
        elif instance.status == AppointmentStatus.CANCELLED:
            already_sent = NotificationLog.objects.filter(
                patient=patient,
                type=NotificationType.APPOINTMENT_CANCELLED,
                context__appointment_id=str(instance.pk),
            ).exists()
            if not already_sent:
                start_local = timezone.localtime(instance.scheduled_start)
                msg = (
                    f"Hurmatli {patient.first_name} {patient.last_name}, "
                    f"sizning {start_local.strftime('%d.%m.%Y')} kuni soat {start_local.strftime('%H:%M')} dagi "
                    f"shifokor {instance.doctor.user.first_name} {instance.doctor.user.last_name} qabuliga bo'lgan navbatingiz bekor qilindi."
                )
                enqueue(
                    notification_type=NotificationType.APPOINTMENT_CANCELLED,
                    message=msg,
                    patient=patient,
                    context={
                        "appointment_id": str(instance.pk),
                    },
                )
    except Exception:  # noqa: BLE001
        logger.exception(
            "scheduling: failed to enqueue notification for appointment=%s",
            instance.pk,
        )


__all__ = ["_on_appointment_saved"]
