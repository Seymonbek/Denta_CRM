"""Read-side query helpers for the ``odontogram`` app."""
from __future__ import annotations

from typing import Any

from django.db.models import QuerySet

from .models import ToothRecord


def records_for_treatment(treatment_id: Any) -> QuerySet[ToothRecord]:
    """Return active tooth records for a treatment, ordered by tooth #."""
    return (
        ToothRecord.objects.filter(treatment_id=treatment_id, is_active=True)
        .select_related("treatment")
        .order_by("tooth_number")
    )


def records_for_patient(patient_id: Any) -> QuerySet[ToothRecord]:
    """Return every tooth record ever created for a patient.

    Used by the ``GET /patients/{id}/odontogram/`` endpoint on the
    patients app so the frontend can show the *current* odontogram
    (latest record per tooth) merged from all treatments.
    """
    return (
        ToothRecord.objects.filter(
            treatment__patient_id=patient_id,
            is_active=True,
        )
        .select_related("treatment")
        .order_by("tooth_number", "-created_at")
    )


def latest_records_by_tooth(patient_id: Any) -> dict[int, ToothRecord]:
    """Return the newest record for each tooth for a patient.

    Iteration order (queryset) already puts newest first per tooth
    (see :func:`records_for_patient`). The first record we see for
    a given tooth wins.
    """
    result: dict[int, ToothRecord] = {}
    for record in records_for_patient(patient_id):
        result.setdefault(record.tooth_number, record)
    return result


def record_by_id(record_id: Any) -> ToothRecord | None:
    return ToothRecord.objects.filter(pk=record_id).first()


__all__ = [
    "records_for_treatment",
    "records_for_patient",
    "latest_records_by_tooth",
    "record_by_id",
]
