"""Read-side query helpers for the ``doctors`` app.

Views and services never build querysets inline — they call selectors so
filtering / ordering / prefetching stays centralised and testable.
"""
from __future__ import annotations

from typing import Iterable  # noqa: UP035 - kept for compat with Django type hints

from django.db.models import Prefetch, QuerySet

from .models import DoctorProfile, ProcedureType, TimeOff, WorkingHours


# ---------------------------------------------------------------------------
# DoctorProfile
# ---------------------------------------------------------------------------
def _default_doctor_queryset() -> QuerySet[DoctorProfile]:
    return (
        DoctorProfile.objects.select_related("user")
        .prefetch_related(
            "departments",
            Prefetch(
                "working_hours",
                queryset=WorkingHours.objects.order_by("weekday", "start_time"),
            ),
        )
    )


def active_doctors() -> QuerySet[DoctorProfile]:
    """Return active doctors ordered by name, with M2M departments prefetched."""
    return _default_doctor_queryset().filter(is_active=True)


def all_doctors() -> QuerySet[DoctorProfile]:
    """Return every doctor (active + inactive) — admin views only."""
    return _default_doctor_queryset()


def doctor_by_id(doctor_id: str) -> DoctorProfile | None:
    return _default_doctor_queryset().filter(pk=doctor_id).first()


def doctors_in_department(department_id: str) -> QuerySet[DoctorProfile]:
    return active_doctors().filter(departments__id=department_id).distinct()


# ---------------------------------------------------------------------------
# WorkingHours
# ---------------------------------------------------------------------------
def working_hours_for(doctor: DoctorProfile) -> QuerySet[WorkingHours]:
    return WorkingHours.objects.filter(doctor=doctor).order_by(
        "weekday", "start_time"
    )


def working_hours_on_weekday(
    doctor: DoctorProfile, weekday: int
) -> QuerySet[WorkingHours]:
    return working_hours_for(doctor).filter(weekday=weekday)


# ---------------------------------------------------------------------------
# TimeOff
# ---------------------------------------------------------------------------
def time_off_for(doctor: DoctorProfile) -> QuerySet[TimeOff]:
    return TimeOff.objects.filter(doctor=doctor).order_by("-date_start")


def time_off_covering(doctor: DoctorProfile, day) -> QuerySet[TimeOff]:
    return TimeOff.objects.filter(
        doctor=doctor, date_start__lte=day, date_end__gte=day
    )


# ---------------------------------------------------------------------------
# ProcedureType
# ---------------------------------------------------------------------------
def active_procedure_types() -> QuerySet[ProcedureType]:
    return (
        ProcedureType.objects.select_related("department")
        .filter(is_active=True)
        .order_by("department__name", "name")
    )


def procedure_types_in_departments(
    department_ids: Iterable[str],
) -> QuerySet[ProcedureType]:
    return active_procedure_types().filter(department_id__in=list(department_ids))


__all__ = [
    "active_doctors",
    "all_doctors",
    "doctor_by_id",
    "doctors_in_department",
    "working_hours_for",
    "working_hours_on_weekday",
    "time_off_for",
    "time_off_covering",
    "active_procedure_types",
    "procedure_types_in_departments",
]
