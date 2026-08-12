"""Read-side aggregate selectors for the ``reports`` app.

Selectors never mutate — they build querysets or ``dict`` payloads
consumed by :mod:`apps.reports.services` (cache facade) and
:mod:`apps.reports.views` (HTTP).

Every function returns pure Python primitives (str / int / Decimal /
list / dict / date) so the result is JSON-serialisable and cacheable
without a custom encoder.

Time windows
------------
The public API exposes ``period=day|week|month`` — resolved by
:func:`period_range` into a half-open ``[start, end)`` interval on the
project's timezone (``TIME_ZONE = "Asia/Tashkent"``). All timestamps
inside the payloads are ISO-8601 strings.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Any, Literal

from django.db.models import Count, DecimalField, F, Sum, Value
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
Period = Literal["day", "week", "month"]
VALID_PERIODS: tuple[Period, ...] = ("day", "week", "month")

_ZERO = Decimal("0.00")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _tz_now() -> datetime:
    return timezone.localtime(timezone.now())


def _iso(value: datetime | date | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    return value.isoformat()


def period_range(period: Period, *, at: datetime | None = None) -> tuple[datetime, datetime]:
    """Return the ``[start, end)`` bounds of a named period.

    * ``day``   — from ``at.date()`` 00:00 to next day 00:00.
    * ``week``  — from ISO Monday 00:00 to next Monday 00:00.
    * ``month`` — from the 1st 00:00 to the 1st of the next month 00:00.

    All bounds are timezone-aware in ``settings.TIME_ZONE``.
    """
    if period not in VALID_PERIODS:
        raise ValueError(f"period must be one of {VALID_PERIODS}, got {period!r}")

    tz = timezone.get_current_timezone()
    now = timezone.localtime(at or timezone.now())
    today = now.date()

    if period == "day":
        start_date = today
        end_date = today + timedelta(days=1)
    elif period == "week":
        # ISO week: Monday = 0
        start_date = today - timedelta(days=today.weekday())
        end_date = start_date + timedelta(days=7)
    else:  # month
        start_date = today.replace(day=1)
        # Move to first of the next month
        if start_date.month == 12:
            end_date = start_date.replace(year=start_date.year + 1, month=1)
        else:
            end_date = start_date.replace(month=start_date.month + 1)

    start = timezone.make_aware(datetime.combine(start_date, time.min), tz)
    end = timezone.make_aware(datetime.combine(end_date, time.min), tz)
    return start, end


# ---------------------------------------------------------------------------
# Revenue
# ---------------------------------------------------------------------------
def revenue_between(start: datetime, end: datetime) -> Decimal:
    """Sum of active payments received in the half-open interval."""
    from apps.payments.models import Payment

    result = Payment.objects.filter(
        is_active=True, created_at__gte=start, created_at__lt=end,
    ).aggregate(total=Coalesce(Sum("amount"), Value(_ZERO, output_field=DecimalField(max_digits=14, decimal_places=2))))
    return result["total"] or _ZERO


def revenue_by_day(start: datetime, end: datetime) -> list[dict[str, Any]]:
    """Series of ``{date, amount}`` payments grouped by day."""
    from apps.payments.models import Payment

    rows = (
        Payment.objects.filter(
            is_active=True, created_at__gte=start, created_at__lt=end,
        )
        .annotate(bucket=TruncDate("created_at"))
        .values("bucket")
        .annotate(total=Coalesce(Sum("amount"), Value(_ZERO, output_field=DecimalField(max_digits=14, decimal_places=2))))
        .order_by("bucket")
    )
    return [
        {
            "date": row["bucket"].isoformat() if row["bucket"] else None,
            "amount": str(row["total"]),
        }
        for row in rows
    ]


def revenue_by_method(start: datetime, end: datetime) -> list[dict[str, Any]]:
    """Aggregate payments by ``method`` for the range."""
    from apps.payments.models import Payment

    rows = (
        Payment.objects.filter(
            is_active=True, created_at__gte=start, created_at__lt=end,
        )
        .values("method")
        .annotate(total=Coalesce(Sum("amount"), Value(_ZERO, output_field=DecimalField(max_digits=14, decimal_places=2))))
        .annotate(count=Count("id"))
        .order_by("-total")
    )
    return [
        {
            "method": row["method"],
            "amount": str(row["total"]),
            "count": row["count"],
        }
        for row in rows
    ]


# ---------------------------------------------------------------------------
# Appointments / patients
# ---------------------------------------------------------------------------
def appointment_counts(start: datetime, end: datetime) -> dict[str, int]:
    """Count appointments in the range by status."""
    from apps.scheduling.models import Appointment

    qs = Appointment.objects.filter(
        scheduled_start__gte=start, scheduled_start__lt=end,
    )
    total = qs.count()
    per_status = {row["status"]: row["count"] for row in qs.values("status").annotate(count=Count("id"))}
    return {
        "total": total,
        "scheduled": per_status.get("scheduled", 0),
        "confirmed": per_status.get("confirmed", 0),
        "in_progress": per_status.get("in_progress", 0),
        "completed": per_status.get("completed", 0),
        "cancelled": per_status.get("cancelled", 0),
        "no_show": per_status.get("no_show", 0),
    }


def new_patients_count(start: datetime, end: datetime) -> int:
    """Patients created in the range."""
    from apps.patients.models import Patient

    return Patient.objects.filter(created_at__gte=start, created_at__lt=end).count()


# ---------------------------------------------------------------------------
# Procedures
# ---------------------------------------------------------------------------
def top_procedures(
    start: datetime, end: datetime, *, limit: int = 10,
) -> list[dict[str, Any]]:
    """Most-performed procedures (by treatment count) in the range."""
    from apps.treatments.models import Treatment

    rows = (
        Treatment.objects.filter(
            is_active=True,
            created_at__gte=start,
            created_at__lt=end,
            procedure_type__isnull=False,
        )
        .values("procedure_type_id", "procedure_type__name")
        .annotate(count=Count("id"))
        .annotate(revenue=Coalesce(Sum("price"), Value(_ZERO, output_field=DecimalField(max_digits=14, decimal_places=2))))
        .order_by("-count")[:limit]
    )
    return [
        {
            "procedureTypeId": str(row["procedure_type_id"]),
            "name": row["procedure_type__name"],
            "count": row["count"],
            "revenue": str(row["revenue"]),
        }
        for row in rows
    ]


# ---------------------------------------------------------------------------
# Departments
# ---------------------------------------------------------------------------
def department_breakdown(start: datetime, end: datetime) -> list[dict[str, Any]]:
    """Per-department treatment count + revenue for the range."""
    from apps.treatments.models import Treatment

    rows = (
        Treatment.objects.filter(
            is_active=True,
            created_at__gte=start,
            created_at__lt=end,
        )
        .values("department_id", "department__name")
        .annotate(treatments=Count("id"))
        .annotate(revenue=Coalesce(Sum("price"), Value(_ZERO, output_field=DecimalField(max_digits=14, decimal_places=2))))
        .order_by("-revenue")
    )
    return [
        {
            "departmentId": str(row["department_id"]),
            "name": row["department__name"],
            "treatments": row["treatments"],
            "revenue": str(row["revenue"]),
        }
        for row in rows
    ]


# ---------------------------------------------------------------------------
# Doctor productivity
# ---------------------------------------------------------------------------
def doctor_productivity(start: datetime, end: datetime, *, limit: int = 20) -> list[dict[str, Any]]:
    """Per-doctor treatment count + billed revenue for the range."""
    from apps.treatments.models import Treatment

    rows = (
        Treatment.objects.filter(
            is_active=True,
            created_at__gte=start,
            created_at__lt=end,
        )
        .values(
            "doctor_id",
            "doctor__user__first_name",
            "doctor__user__last_name",
        )
        .annotate(treatments=Count("id"))
        .annotate(revenue=Coalesce(Sum("price"), Value(_ZERO, output_field=DecimalField(max_digits=14, decimal_places=2))))
        .order_by("-revenue")[:limit]
    )
    return [
        {
            "doctorId": str(row["doctor_id"]),
            "firstName": row["doctor__user__first_name"] or "",
            "lastName": row["doctor__user__last_name"] or "",
            "treatments": row["treatments"],
            "revenue": str(row["revenue"]),
        }
        for row in rows
    ]


# ---------------------------------------------------------------------------
# Inventory (KPI card)
# ---------------------------------------------------------------------------
def low_stock_count() -> int:
    """Active materials at or below their minimum threshold."""
    from apps.inventory.models import Material

    return Material.objects.filter(
        is_active=True, quantity_in_stock__lte=F("minimum_threshold"),
    ).count()


# ---------------------------------------------------------------------------
# Composite dashboard payload
# ---------------------------------------------------------------------------
def dashboard_payload(period: Period) -> dict[str, Any]:
    """Full KPI + chart payload for ``/reports/dashboard/?period=…``."""
    start, end = period_range(period)
    revenue = revenue_between(start, end)
    counts = appointment_counts(start, end)
    return {
        "period": period,
        "range": {"start": _iso(start), "end": _iso(end)},
        "kpi": {
            "revenue": str(revenue),
            "appointmentsTotal": counts["total"],
            "appointmentsCompleted": counts["completed"],
            "newPatients": new_patients_count(start, end),
            "lowStockCount": low_stock_count(),
        },
        "revenueByDay": revenue_by_day(start, end),
        "appointmentsByStatus": counts,
        "topProcedures": top_procedures(start, end, limit=5),
        "departmentBreakdown": department_breakdown(start, end),
        "topDoctors": doctor_productivity(start, end, limit=5),
        "generatedAt": _iso(_tz_now()),
    }


def revenue_payload(period: Period) -> dict[str, Any]:
    start, end = period_range(period)
    from apps.payments.models import Payment
    
    deposits = Payment.objects.filter(
        is_active=True,
        treatment__isnull=True,
        created_at__gte=start,
        created_at__lt=end,
    ).aggregate(total=Coalesce(Sum("amount"), Value(_ZERO, output_field=DecimalField(max_digits=14, decimal_places=2))))
    deposit_total = deposits["total"] or _ZERO

    return {
        "period": period,
        "range": {"start": _iso(start), "end": _iso(end)},
        "total": str(revenue_between(start, end)),
        "depositTotal": str(deposit_total),
        "byDay": revenue_by_day(start, end),
        "byMethod": revenue_by_method(start, end),
        "generatedAt": _iso(_tz_now()),
    }


def procedures_payload(period: Period, *, limit: int = 10) -> dict[str, Any]:
    start, end = period_range(period)
    return {
        "period": period,
        "range": {"start": _iso(start), "end": _iso(end)},
        "results": top_procedures(start, end, limit=limit),
        "generatedAt": _iso(_tz_now()),
    }


def departments_payload(period: Period) -> dict[str, Any]:
    start, end = period_range(period)
    return {
        "period": period,
        "range": {"start": _iso(start), "end": _iso(end)},
        "results": department_breakdown(start, end),
        "generatedAt": _iso(_tz_now()),
    }


def doctor_my_analytics_payload(doctor_profile: Any, period: Period) -> dict[str, Any]:
    """Calculate rich personal analytics for a specific doctor."""
    from apps.scheduling.models import Appointment, AppointmentStatus
    from apps.treatments.models import Treatment
    from apps.payments.models import Payment

    start, end = period_range(period)

    # Doctor treatments in period
    treatments_qs = Treatment.objects.filter(
        doctor=doctor_profile,
        created_at__gte=start,
        created_at__lt=end,
    )
    total_treatments = treatments_qs.count()

    total_revenue = (
        treatments_qs.aggregate(total=Sum("price"))["total"] or _ZERO
    )

    # Doctor payments collected
    doctor_patient_ids = treatments_qs.values_list("patient_id", flat=True).distinct()
    payments_qs = Payment.objects.filter(
        patient_id__in=doctor_patient_ids,
        is_active=True,
        created_at__gte=start,
        created_at__lt=end,
    )
    paid_revenue = (
        payments_qs.aggregate(total=Sum("amount"))["total"] or _ZERO
    )
    pending_revenue = max(_ZERO, total_revenue - paid_revenue)

    # Doctor commission
    commission_rate = getattr(doctor_profile, "commission_rate", Decimal("30.00"))
    earned_commission = (total_revenue * Decimal(str(commission_rate))) / Decimal("100.00")

    # Distinct patients treated by this doctor
    distinct_patients_count = treatments_qs.values("patient").distinct().count()

    # Procedure breakdown
    procedure_counts = (
        treatments_qs.values(name=F("procedure_type__name"))
        .annotate(
            count=Count("id"),
            total_amount=Coalesce(
                Sum("price"), _ZERO, output_field=DecimalField()
            ),
        )
        .order_by("-count")[:10]
    )
    procedure_breakdown = [
        {
            "name": row["name"] or "Muolaja",
            "count": row["count"],
            "totalAmount": str(row["total_amount"]),
        }
        for row in procedure_counts
    ]

    # Appointments summary
    appts_qs = Appointment.objects.filter(
        doctor=doctor_profile,
        scheduled_start__gte=start,
        scheduled_start__lt=end,
    )
    total_appts = appts_qs.count()
    completed_appts = appts_qs.filter(status=AppointmentStatus.COMPLETED).count()
    scheduled_appts = appts_qs.filter(status=AppointmentStatus.SCHEDULED).count()
    canceled_appts = appts_qs.filter(status=AppointmentStatus.CANCELLED).count()
    cancellation_rate = round((canceled_appts / total_appts * 100), 1) if total_appts > 0 else 0.0

    # Material usage & cost tracking for this doctor
    from apps.inventory.models import MaterialUsage

    mat_usages = MaterialUsage.objects.filter(
        treatment__doctor=doctor_profile,
        created_at__gte=start,
        created_at__lt=end,
    )
    materials_used = []
    total_material_cost = _ZERO
    for usage in mat_usages:
        material_price = getattr(usage.material, "unit_cost", None) or getattr(usage.material, "unit_price", None) or Decimal("0.00")
        cost = Decimal(str(material_price)) * Decimal(str(usage.quantity_used))
        total_material_cost += cost
        materials_used.append({
            "materialName": usage.material.name,
            "quantity": str(usage.quantity_used),
            "unit": usage.material.unit,
            "totalCost": str(cost),
        })

    net_doctor_profit = max(_ZERO, total_revenue - total_material_cost)

    return {
        "period": period,
        "range": {"start": _iso(start), "end": _iso(end)},
        "doctorName": getattr(getattr(doctor_profile, "user", None), "get_full_name", lambda: "Shifokor")(),
        "totalRevenue": str(total_revenue),
        "paidRevenue": str(paid_revenue),
        "pendingRevenue": str(pending_revenue),
        "commissionRate": str(commission_rate),
        "earnedCommission": str(earned_commission),
        "totalPatientsTreated": distinct_patients_count,
        "totalTreatmentsCount": total_treatments,
        "procedureBreakdown": procedure_breakdown,
        "appointments": {
            "total": total_appts,
            "completed": completed_appts,
            "scheduled": scheduled_appts,
            "canceled": canceled_appts,
            "cancellationRatePercent": cancellation_rate,
        },
        "totalMaterialCost": str(total_material_cost),
        "netDoctorProfit": str(net_doctor_profit),
        "materialsUsed": materials_used,
        "generatedAt": _iso(_tz_now()),
    }


def reception_analytics_payload(period: Period) -> dict[str, Any]:
    """Calculate reception / cash register analytics."""
    from apps.scheduling.models import Appointment, AppointmentStatus
    from apps.payments.models import Payment
    from apps.treatments.models import Treatment, PaymentStatus

    start, end = period_range(period)

    # Payments collected in period
    payments_qs = Payment.objects.filter(
        is_active=True,
        created_at__gte=start,
        created_at__lt=end,
    )
    total_cash_collected = payments_qs.aggregate(total=Sum("amount"))["total"] or _ZERO
    payments_count = payments_qs.count()

    deposit_qs = payments_qs.filter(treatment__isnull=True)
    deposit_total = deposit_qs.aggregate(total=Sum("amount"))["total"] or _ZERO

    by_method_qs = (
        payments_qs.values("method")
        .annotate(
            total=Coalesce(Sum("amount"), _ZERO, output_field=DecimalField()),
            count=Count("id"),
        )
        .order_by("-total")
    )
    by_method = [
        {
            "method": row["method"],
            "total": str(row["total"]),
            "count": row["count"],
        }
        for row in by_method_qs
    ]

    # Appointments checkin statistics
    appts_qs = Appointment.objects.filter(
        scheduled_start__gte=start,
        scheduled_start__lt=end,
    )
    total_appts = appts_qs.count()
    completed_appts = appts_qs.filter(status=AppointmentStatus.COMPLETED).count()
    scheduled_appts = appts_qs.filter(status=AppointmentStatus.SCHEDULED).count()
    canceled_appts = appts_qs.filter(status=AppointmentStatus.CANCELLED).count()

    # Unpaid treatments debt tracking
    unpaid_treatments = Treatment.objects.filter(
        payment_status__in=[PaymentStatus.UNPAID, PaymentStatus.PARTIAL],
        is_active=True,
    )
    unpaid_count = unpaid_treatments.count()
    unpaid_total = unpaid_treatments.aggregate(total=Sum("price"))["total"] or _ZERO

    return {
        "period": period,
        "range": {"start": _iso(start), "end": _iso(end)},
        "totalPaymentsCollected": str(total_cash_collected),
        "depositTotal": str(deposit_total),
        "paymentsCount": payments_count,
        "byMethod": by_method,
        "appointments": {
            "total": total_appts,
            "completed": completed_appts,
            "scheduled": scheduled_appts,
            "canceled": canceled_appts,
        },
        "unpaidTreatmentsCount": unpaid_count,
        "unpaidTreatmentsTotal": str(unpaid_total),
        "generatedAt": _iso(_tz_now()),
    }


__all__ = [
    "Period",
    "VALID_PERIODS",
    "period_range",
    "revenue_between",
    "revenue_by_day",
    "revenue_by_method",
    "appointment_counts",
    "new_patients_count",
    "top_procedures",
    "department_breakdown",
    "doctor_productivity",
    "low_stock_count",
    "dashboard_payload",
    "revenue_payload",
    "procedures_payload",
    "departments_payload",
    "doctor_my_analytics_payload",
    "reception_analytics_payload",
]
