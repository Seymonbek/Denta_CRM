"""Read-side helpers for the ``payments`` app.

Selectors only build querysets — they never mutate. Views and services
call them so filter/order rules live in one place.
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from django.db.models import QuerySet, Sum

from .models import CommissionRecord, Payment


# ---------------------------------------------------------------------------
# Payment queries
# ---------------------------------------------------------------------------
def payments_qs() -> QuerySet[Payment]:
    """Base queryset for all active payments."""
    return (
        Payment.objects.select_related("treatment", "patient", "received_by")
        .filter(is_active=True)
        .order_by("-created_at")
    )


def payments_for_patient(patient_id: Any) -> QuerySet[Payment]:
    """Payments recorded against a specific patient."""
    return payments_qs().filter(patient_id=patient_id)


def payments_for_treatment(treatment_id: Any) -> QuerySet[Payment]:
    """Payments recorded against a specific treatment."""
    return payments_qs().filter(treatment_id=treatment_id)


def total_paid_for_treatment(treatment_id: Any) -> Decimal:
    """Sum of active payments against a single treatment."""
    result = Payment.objects.filter(
        treatment_id=treatment_id, is_active=True,
    ).aggregate(total=Sum("amount"))
    return result["total"] or Decimal("0.00")


def patient_balance(patient_id: Any) -> dict[str, Any]:
    """Return ``{totalBilled, totalPaid, balance}`` for a patient.

    ``balance`` is *what the patient still owes*: totalBilled - totalPaid.
    Numbers are cast to Decimal("0.00") to keep the JSON payload stable.
    """
    # Imported here to avoid a circular import at module load — the
    # treatments app depends on nothing in payments, so this is safe.
    from apps.treatments.models import Treatment

    total_billed = Treatment.objects.filter(
        patient_id=patient_id, is_active=True,
    ).aggregate(total=Sum("price"))["total"] or Decimal("0.00")
    total_paid = Payment.objects.filter(
        patient_id=patient_id, is_active=True,
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

    balance = total_billed - total_paid
    return {
        "patientId": str(patient_id),
        "totalBilled": total_billed,
        "totalPaid": total_paid,
        "balance": balance,
    }


# ---------------------------------------------------------------------------
# Commission queries
# ---------------------------------------------------------------------------
def commissions_qs() -> QuerySet[CommissionRecord]:
    return CommissionRecord.objects.select_related(
        "doctor", "doctor__user", "treatment",
    ).order_by("-calculated_at")


def commissions_for_doctor(
    doctor_id: Any,
    *,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> QuerySet[CommissionRecord]:
    """Doctor's commissions, optionally clipped to a date range.

    ``date_from`` / ``date_to`` are compared against
    ``CommissionRecord.calculated_at``. Both bounds are inclusive.
    """
    qs = commissions_qs().filter(doctor_id=doctor_id)
    if date_from is not None:
        qs = qs.filter(calculated_at__gte=date_from)
    if date_to is not None:
        qs = qs.filter(calculated_at__lte=date_to)
    return qs


def commission_summary_for_doctor(
    doctor_id: Any,
    *,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> dict[str, Any]:
    """Sum + count of commissions in the range for a doctor."""
    qs = commissions_for_doctor(
        doctor_id, date_from=date_from, date_to=date_to,
    )
    total = qs.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
    return {
        "doctorId": str(doctor_id),
        "count": qs.count(),
        "totalAmount": total,
        "dateFrom": date_from.isoformat() if date_from else None,
        "dateTo": date_to.isoformat() if date_to else None,
    }


__all__ = [
    "payments_qs",
    "payments_for_patient",
    "payments_for_treatment",
    "total_paid_for_treatment",
    "patient_balance",
    "commissions_qs",
    "commissions_for_doctor",
    "commission_summary_for_doctor",
]
