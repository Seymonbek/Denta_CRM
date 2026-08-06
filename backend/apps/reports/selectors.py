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
        "topDoctors": doctor_productivity(start, end, limit=5),
        "generatedAt": _iso(_tz_now()),
    }


def revenue_payload(period: Period) -> dict[str, Any]:
    start, end = period_range(period)
    return {
        "period": period,
        "range": {"start": _iso(start), "end": _iso(end)},
        "total": str(revenue_between(start, end)),
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
]
