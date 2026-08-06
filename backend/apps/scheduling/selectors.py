"""Read-side query helpers for the ``scheduling`` app.

Views and services never build querysets inline — they call selectors
so filtering / ordering / prefetching stays centralised and testable.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Iterable  # noqa: UP035 - Iterable kept for compat

from django.db.models import Q, QuerySet
from django.utils import timezone

from apps.doctors.models import DoctorProfile
from apps.patients.models import Patient

from .models import BLOCKING_STATUSES, Appointment, AppointmentStatus


def _default_queryset() -> QuerySet[Appointment]:
    return (
        Appointment.objects.select_related(
            "patient",
            "doctor",
            "doctor__user",
            "department",
            "procedure_type",
        )
    )


# ---------------------------------------------------------------------------
# Base querysets
# ---------------------------------------------------------------------------
def active_appointments() -> QuerySet[Appointment]:
    """Appointments that have not been soft-hidden (``is_active=True``)."""
    return _default_queryset().filter(is_active=True)


def all_appointments() -> QuerySet[Appointment]:
    return _default_queryset()


def appointment_by_id(appointment_id: str) -> Appointment | None:
    return _default_queryset().filter(pk=appointment_id).first()


# ---------------------------------------------------------------------------
# Filters
# ---------------------------------------------------------------------------
def appointments_for_doctor(doctor: DoctorProfile) -> QuerySet[Appointment]:
    return active_appointments().filter(doctor=doctor)


def appointments_for_patient(patient: Patient) -> QuerySet[Appointment]:
    return active_appointments().filter(patient=patient).order_by(
        "-scheduled_start"
    )


def appointments_in_range(
    *,
    date_from: date | datetime | None = None,
    date_to: date | datetime | None = None,
    doctor: DoctorProfile | None = None,
    statuses: Iterable[str] | None = None,
) -> QuerySet[Appointment]:
    """Return appointments overlapping the ``[date_from, date_to]`` window.

    Any of the kwargs can be omitted:

    * ``date_from`` / ``date_to`` — treated as inclusive UTC datetimes.
      A plain ``date`` is interpreted as ``00:00`` (from) or ``23:59:59``
      (to) in the current timezone.
    * ``doctor`` — restrict to a single doctor.
    * ``statuses`` — restrict to specific statuses (default: any).
    """
    qs = active_appointments()

    if doctor is not None:
        qs = qs.filter(doctor=doctor)

    if statuses is not None:
        cleaned = [s for s in statuses if s]
        if cleaned:
            qs = qs.filter(status__in=cleaned)

    tz = timezone.get_current_timezone()

    if date_from is not None:
        start_dt = _to_datetime(date_from, end_of_day=False, tz=tz)
        qs = qs.filter(scheduled_end__gt=start_dt)

    if date_to is not None:
        end_dt = _to_datetime(date_to, end_of_day=True, tz=tz)
        qs = qs.filter(scheduled_start__lt=end_dt)

    return qs.order_by("scheduled_start")


def booked_ranges_for_doctor_on_day(
    doctor: DoctorProfile, day: date
) -> list[tuple[datetime, datetime]]:
    """Return blocking appointment ranges for the doctor on ``day``.

    Used by :func:`apps.doctors.services.compute_available_slots` (via
    the view) to subtract already-taken slots. ``blocking`` here means
    the appointment is scheduled/confirmed/in_progress; cancelled and
    no-show slots are considered free.
    """
    tz = timezone.get_current_timezone()
    start_of_day = _to_datetime(day, end_of_day=False, tz=tz)
    end_of_day = _to_datetime(day, end_of_day=True, tz=tz)
    rows = (
        appointments_for_doctor(doctor)
        .filter(
            status__in=BLOCKING_STATUSES,
            scheduled_start__lt=end_of_day,
            scheduled_end__gt=start_of_day,
        )
        .values_list("scheduled_start", "scheduled_end")
    )
    return list(rows)


def has_overlap(
    *,
    doctor: DoctorProfile,
    scheduled_start: datetime,
    scheduled_end: datetime,
    exclude_id: str | None = None,
    statuses: Iterable[str] | None = None,
) -> bool:
    """True if any blocking appointment overlaps the given range."""
    statuses = list(statuses) if statuses is not None else list(BLOCKING_STATUSES)
    qs = Appointment.objects.filter(
        doctor=doctor,
        status__in=statuses,
    ).filter(
        Q(scheduled_start__lt=scheduled_end)
        & Q(scheduled_end__gt=scheduled_start)
    )
    if exclude_id is not None:
        qs = qs.exclude(pk=exclude_id)
    return qs.exists()


# ---------------------------------------------------------------------------
# Reminder helpers (used by Celery in T23)
# ---------------------------------------------------------------------------
def appointments_due_for_reminder_1day(
    *, now: datetime | None = None
) -> QuerySet[Appointment]:
    """Appointments starting ~24h from now that need a 1-day reminder."""
    now = now or timezone.now()
    window_start = now + timedelta(hours=23)
    window_end = now + timedelta(hours=25)
    return active_appointments().filter(
        status__in=(AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED),
        reminder_1d_sent=False,
        scheduled_start__gte=window_start,
        scheduled_start__lt=window_end,
    )


def appointments_due_for_reminder_2hour(
    *, now: datetime | None = None
) -> QuerySet[Appointment]:
    """Appointments starting ~2h from now that need a 2-hour reminder."""
    now = now or timezone.now()
    window_start = now + timedelta(hours=1, minutes=45)
    window_end = now + timedelta(hours=2, minutes=15)
    return active_appointments().filter(
        status__in=(AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED),
        reminder_2h_sent=False,
        scheduled_start__gte=window_start,
        scheduled_start__lt=window_end,
    )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------
def _to_datetime(value, *, end_of_day: bool, tz) -> datetime:
    """Convert a ``date`` / ``datetime`` to a timezone-aware datetime."""
    if isinstance(value, datetime):
        if timezone.is_naive(value):
            return timezone.make_aware(value, tz)
        return value
    # date
    if end_of_day:
        naive = datetime.combine(value, datetime.max.time())
    else:
        naive = datetime.combine(value, datetime.min.time())
    return timezone.make_aware(naive, tz)


__all__ = [
    "active_appointments",
    "all_appointments",
    "appointment_by_id",
    "appointments_for_doctor",
    "appointments_for_patient",
    "appointments_in_range",
    "booked_ranges_for_doctor_on_day",
    "has_overlap",
    "appointments_due_for_reminder_1day",
    "appointments_due_for_reminder_2hour",
]
