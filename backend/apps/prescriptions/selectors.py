"""Read-side query helpers for the ``prescriptions`` app."""
from __future__ import annotations

from typing import Any

from django.db.models import Q, QuerySet

from .models import Prescription, PrescriptionTemplate


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------
def all_templates() -> QuerySet[PrescriptionTemplate]:
    return PrescriptionTemplate.objects.select_related("created_by")


def active_templates() -> QuerySet[PrescriptionTemplate]:
    return all_templates().filter(is_active=True)


def template_by_id(template_id: Any) -> PrescriptionTemplate | None:
    return all_templates().filter(pk=template_id).first()


def templates_for_user(user_id: Any) -> QuerySet[PrescriptionTemplate]:
    """Templates visible to a specific user (own + shared).

    In DentaCRM every template is shared across the clinic — we return
    all active templates ordered so the user's own show first.
    """
    qs = active_templates()
    if user_id is None:
        return qs.order_by("name")
    return qs.order_by(
        # Own templates first (created_by == user_id → 0), then others.
        models_case_own(user_id),
        "name",
    )


def models_case_own(user_id: Any):  # helper factored out for testability
    from django.db.models import Case, IntegerField, Value, When

    return Case(
        When(created_by_id=user_id, then=Value(0)),
        default=Value(1),
        output_field=IntegerField(),
    )


# ---------------------------------------------------------------------------
# Prescriptions
# ---------------------------------------------------------------------------
def all_prescriptions() -> QuerySet[Prescription]:
    return Prescription.objects.select_related(
        "treatment",
        "treatment__patient",
        "treatment__doctor",
        "treatment__doctor__user",
        "template",
        "created_by",
    )


def active_prescriptions() -> QuerySet[Prescription]:
    return all_prescriptions().filter(is_active=True)


def prescription_by_id(prescription_id: Any) -> Prescription | None:
    return all_prescriptions().filter(pk=prescription_id).first()


def prescriptions_for_treatment(treatment_id: Any) -> QuerySet[Prescription]:
    return (
        active_prescriptions()
        .filter(treatment_id=treatment_id)
        .order_by("-created_at")
    )


def prescriptions_for_patient(patient_id: Any) -> QuerySet[Prescription]:
    return (
        active_prescriptions()
        .filter(treatment__patient_id=patient_id)
        .order_by("-created_at")
    )


def filter_prescriptions(
    *,
    treatment_id: Any = None,
    patient_id: Any = None,
    doctor_id: Any = None,
    is_sent: bool | None = None,
    include_inactive: bool = False,
) -> QuerySet[Prescription]:
    qs = all_prescriptions() if include_inactive else active_prescriptions()
    condition = Q()
    if treatment_id:
        condition &= Q(treatment_id=treatment_id)
    if patient_id:
        condition &= Q(treatment__patient_id=patient_id)
    if doctor_id:
        condition &= Q(treatment__doctor_id=doctor_id)
    if is_sent is True:
        condition &= Q(sent_to_telegram_at__isnull=False)
    elif is_sent is False:
        condition &= Q(sent_to_telegram_at__isnull=True)
    return qs.filter(condition).order_by("-created_at")


__all__ = [
    "all_templates",
    "active_templates",
    "template_by_id",
    "templates_for_user",
    "all_prescriptions",
    "active_prescriptions",
    "prescription_by_id",
    "prescriptions_for_treatment",
    "prescriptions_for_patient",
    "filter_prescriptions",
]
