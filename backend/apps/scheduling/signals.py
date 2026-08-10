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
        from apps.notifications.services import enqueue, notify_roles

        start_local = timezone.localtime(instance.scheduled_start)
        dt_str = f"{start_local.strftime('%d.%m.%Y')} soat {start_local.strftime('%H:%M')}"
        doc_user = instance.doctor.user if instance.doctor else None
        doc_name = doc_user.get_full_name() if doc_user else "Shifokor"
        patient_name = f"{patient.first_name} {patient.last_name}"

        # Case 1: Newly Created Appointment
        if created:
            already_sent = NotificationLog.objects.filter(
                patient=patient,
                type=NotificationType.GENERIC,
                context__appointment_id=str(instance.pk),
                context__event="appointment_created",
            ).exists()
            if not already_sent:
                # 1. Patient Notification
                msg_p = f"Hurmatli {patient_name}, sizga {dt_str} da Dr. {doc_name} qabuliga navbat belgilandi."
                enqueue(
                    notification_type=NotificationType.GENERIC,
                    message=msg_p,
                    patient=patient,
                    context={"appointment_id": str(instance.pk), "event": "appointment_created"},
                )
                # 2. Doctor Notification
                if doc_user:
                    msg_d = f"📅 Sizga yangi bemor ({patient_name}) {dt_str} ga qabulga yozildi."
                    enqueue(
                        notification_type=NotificationType.GENERIC,
                        message=msg_d,
                        user=doc_user,
                        context={"appointment_id": str(instance.pk), "event": "appointment_created"},
                    )
                # 3. Bosh Shifokor Multicast Notification
                msg_bs = f"📋 Yangi navbat belgilandi: Bemor {patient_name} -> Dr. {doc_name} ({dt_str})"
                notify_roles(
                    ["bosh_shifokor"],
                    notification_type=NotificationType.GENERIC,
                    message=msg_bs,
                    context={"appointment_id": str(instance.pk), "event": "appointment_created"},
                )

        # Case 2: Cancelled Appointment
        elif instance.status == AppointmentStatus.CANCELLED:
            already_sent = NotificationLog.objects.filter(
                patient=patient,
                type=NotificationType.APPOINTMENT_CANCELLED,
                context__appointment_id=str(instance.pk),
            ).exists()
            if not already_sent:
                msg_p = f"Hurmatli {patient_name}, sizning {dt_str} dagi Dr. {doc_name} qabuliga bo'lgan navbatingiz bekor qilindi."
                enqueue(
                    notification_type=NotificationType.APPOINTMENT_CANCELLED,
                    message=msg_p,
                    patient=patient,
                    context={"appointment_id": str(instance.pk)},
                )
                if doc_user:
                    msg_d = f"⚠️ {dt_str} dagi {patient_name} bilan navbat bekor qilindi."
                    enqueue(
                        notification_type=NotificationType.APPOINTMENT_CANCELLED,
                        message=msg_d,
                        user=doc_user,
                        context={"appointment_id": str(instance.pk)},
                    )
                msg_bs = f"⚠️ Navbat bekor qilindi: Bemor {patient_name} -> Dr. {doc_name} ({dt_str})"
                notify_roles(
                    ["bosh_shifokor"],
                    notification_type=NotificationType.APPOINTMENT_CANCELLED,
                    message=msg_bs,
                    context={"appointment_id": str(instance.pk)},
                )
    except Exception:  # noqa: BLE001
        logger.exception(
            "scheduling: failed to enqueue notification for appointment=%s",
            instance.pk,
        )


__all__ = ["_on_appointment_saved"]
