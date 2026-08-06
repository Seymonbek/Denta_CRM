"""Celery tasks for the ``scheduling`` app.

Contains three recurring tasks:

* :func:`send_appointment_reminder_1day` — one-day-ahead reminders.
* :func:`send_appointment_reminder_2hour` — two-hour-ahead reminders.
* :func:`send_followup_invite`         — profilaktik taklifnoma
  (patients who had a treatment 6+ months ago and no recent visits).

Reminders are idempotent: the appointment's ``reminder_*_sent`` flags
are set once notifications have been enqueued so re-running the task
never spams a patient.
"""
from __future__ import annotations

import logging
from datetime import timedelta

from celery import shared_task
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _appointment_msg(appointment, kind: str) -> str:
    when = timezone.localtime(appointment.scheduled_start)
    doctor = appointment.doctor.user.get_full_name() if appointment.doctor_id else "?"
    label = "1 kun" if kind == "1d" else "2 soat"
    return (
        f"Eslatma: {label} qoldi. "
        f"Navbat {when:%Y-%m-%d %H:%M} da, shifokor: {doctor}."
    )


def _enqueue_appointment_reminder(appointment, *, kind: str) -> None:
    """Create a NotificationLog for the appointment's patient/user."""
    from apps.notifications.models import NotificationType
    from apps.notifications.services import enqueue

    notif_type = (
        NotificationType.APPOINTMENT_REMINDER_1D
        if kind == "1d"
        else NotificationType.APPOINTMENT_REMINDER_2H
    )

    # Reminder recipients: patient (primary) + creating user (fallback).
    patient = appointment.patient
    if patient and (patient.telegram_chat_id or True):
        enqueue(
            notification_type=notif_type,
            message=_appointment_msg(appointment, kind),
            patient=patient,
            context={
                "appointment_id": str(appointment.pk),
                "scheduled_start": appointment.scheduled_start.isoformat(),
                "kind": kind,
            },
        )


# ---------------------------------------------------------------------------
# 1-day reminder
# ---------------------------------------------------------------------------
@shared_task(name="apps.scheduling.tasks.send_appointment_reminder_1day")
def send_appointment_reminder_1day() -> int:
    """Enqueue reminders for appointments starting ~24 hours from now.

    Windows: appointments with ``scheduled_start`` inside
    ``[now + 23h, now + 25h)`` and ``reminder_1d_sent == False``.
    Returns the number of reminders enqueued.
    """
    from apps.scheduling.models import BLOCKING_STATUSES, Appointment

    now = timezone.now()
    window_start = now + timedelta(hours=23)
    window_end = now + timedelta(hours=25)

    count = 0
    qs = Appointment.objects.filter(
        is_active=True,
        status__in=BLOCKING_STATUSES,
        reminder_1d_sent=False,
        scheduled_start__gte=window_start,
        scheduled_start__lt=window_end,
    ).select_related("patient", "doctor", "doctor__user")

    for appointment in qs:
        with transaction.atomic():
            _enqueue_appointment_reminder(appointment, kind="1d")
            appointment.reminder_1d_sent = True
            appointment.save(update_fields=["reminder_1d_sent", "updated_at"])
            count += 1

    if count:
        logger.info("scheduling: sent 1-day reminders for %s appointments", count)
    return count


# ---------------------------------------------------------------------------
# 2-hour reminder
# ---------------------------------------------------------------------------
@shared_task(name="apps.scheduling.tasks.send_appointment_reminder_2hour")
def send_appointment_reminder_2hour() -> int:
    """Enqueue reminders for appointments starting ~2 hours from now."""
    from apps.scheduling.models import BLOCKING_STATUSES, Appointment

    now = timezone.now()
    window_start = now + timedelta(hours=1, minutes=45)
    window_end = now + timedelta(hours=2, minutes=15)

    count = 0
    qs = Appointment.objects.filter(
        is_active=True,
        status__in=BLOCKING_STATUSES,
        reminder_2h_sent=False,
        scheduled_start__gte=window_start,
        scheduled_start__lt=window_end,
    ).select_related("patient", "doctor", "doctor__user")

    for appointment in qs:
        with transaction.atomic():
            _enqueue_appointment_reminder(appointment, kind="2h")
            appointment.reminder_2h_sent = True
            appointment.save(update_fields=["reminder_2h_sent", "updated_at"])
            count += 1

    if count:
        logger.info("scheduling: sent 2-hour reminders for %s appointments", count)
    return count


# ---------------------------------------------------------------------------
# Follow-up invite
# ---------------------------------------------------------------------------
@shared_task(name="apps.scheduling.tasks.send_followup_invite")
def send_followup_invite(*, months: int = 6) -> int:
    """Send a profilaktik taklif to patients with no recent treatment.

    Patients who had a completed treatment ``months`` ago (± a small
    window) and no visits since receive a Telegram taklifnoma.
    """
    from apps.notifications.models import NotificationType
    from apps.notifications.services import enqueue
    from apps.patients.models import Patient
    from apps.treatments.models import Treatment

    threshold = timezone.now() - timedelta(days=30 * months)

    # Patients whose most recent treatment is older than threshold.
    stale_patients = (
        Patient.objects.filter(
            is_active=True,
            treatments__is_active=True,
            treatments__created_at__lt=threshold,
        )
        .exclude(
            treatments__created_at__gte=threshold,
        )
        .distinct()
    )

    count = 0
    for patient in stale_patients:
        # Guard: skip if we already sent a follow-up in the last month.
        from apps.notifications.models import NotificationLog

        recently = NotificationLog.objects.filter(
            patient=patient,
            type=NotificationType.FOLLOWUP_INVITE,
            created_at__gte=timezone.now() - timedelta(days=30),
        ).exists()
        if recently:
            continue

        message = (
            "Assalomu alaykum! Klinikamizda profilaktik ko'rikga taklif "
            "qilamiz. Qulay vaqtni belgilash uchun biz bilan bog'laning."
        )
        enqueue(
            notification_type=NotificationType.FOLLOWUP_INVITE,
            message=message,
            patient=patient,
            context={"patient_id": str(patient.pk)},
        )
        count += 1

    if count:
        logger.info("scheduling: sent follow-up invites to %s patients", count)
    _ = Treatment  # silence unused import for mypy strict mode
    return count


__all__ = [
    "send_appointment_reminder_1day",
    "send_appointment_reminder_2hour",
    "send_followup_invite",
]
