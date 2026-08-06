"""Read-side query helpers for the ``treatments`` app."""
from __future__ import annotations

from typing import Any

from django.db.models import Q, QuerySet

from .models import Treatment, TreatmentPhoto


def all_treatments() -> QuerySet[Treatment]:
    """Every treatment (soft-deleted included)."""
    return Treatment.objects.select_related(
        "doctor",
        "doctor__user",
        "patient",
        "department",
        "procedure_type",
        "appointment",
        "created_by",
    )


def active_treatments() -> QuerySet[Treatment]:
    return all_treatments().filter(is_active=True)


def treatment_by_id(treatment_id: Any) -> Treatment | None:
    return all_treatments().filter(pk=treatment_id).first()


def treatments_for_patient(patient_id: Any) -> QuerySet[Treatment]:
    return active_treatments().filter(patient_id=patient_id).order_by("-created_at")


def treatments_for_doctor(doctor_id: Any) -> QuerySet[Treatment]:
    return active_treatments().filter(doctor_id=doctor_id).order_by("-created_at")


def filter_treatments(
    *,
    patient_id: Any = None,
    doctor_id: Any = None,
    department_id: Any = None,
    payment_status: str | None = None,
    stage: str | None = None,
    include_inactive: bool = False,
) -> QuerySet[Treatment]:
    """Combined filter used by the list endpoint."""
    qs = all_treatments() if include_inactive else active_treatments()
    condition = Q()
    if patient_id:
        condition &= Q(patient_id=patient_id)
    if doctor_id:
        condition &= Q(doctor_id=doctor_id)
    if department_id:
        condition &= Q(department_id=department_id)
    if payment_status:
        condition &= Q(payment_status=payment_status)
    if stage:
        condition &= Q(stage=stage)
    return qs.filter(condition).order_by("-created_at")


def photos_for_treatment(treatment_id: Any) -> QuerySet[TreatmentPhoto]:
    return (
        TreatmentPhoto.objects.filter(treatment_id=treatment_id, is_active=True)
        .select_related("uploaded_by")
        .order_by("-uploaded_at")
    )


__all__ = [
    "all_treatments",
    "active_treatments",
    "treatment_by_id",
    "treatments_for_patient",
    "treatments_for_doctor",
    "filter_treatments",
    "photos_for_treatment",
]
