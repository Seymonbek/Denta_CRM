"""Read-side helpers for the ``payments`` app.

Selectors only build querysets — they never mutate. Views and services
call them so filter/order rules live in one place.
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from django.db.models import QuerySet, Sum, Value, DecimalField
from django.db.models.functions import Coalesce

from .models import CommissionRecord, Payment, SalaryPayment


# ---------------------------------------------------------------------------
# Payment queries
# ---------------------------------------------------------------------------
def payments_qs() -> QuerySet[Payment]:
    """Base queryset for all active payments."""
    return (
        Payment.objects.select_related(
            "treatment",
            "treatment__procedure_type",
            "treatment__doctor",
            "treatment__doctor__user",
            "patient",
            "received_by",
        )
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

def doctor_balances() -> list[dict[str, Any]]:
    """Return all active doctors with their total earnings, paid salaries, and current balance."""
    from apps.doctors.models import DoctorProfile
    
    doctors = DoctorProfile.objects.select_related("user").filter(is_active=True)
    results = []
    
    for doc in doctors:
        # Compute total commission earned
        total_earned = CommissionRecord.objects.filter(
            doctor=doc, 
            # only consider completed treatments or paid treatments depending on policy?
            # the CommissionRecord is only updated when fully paid, so it's safe to just sum.
        ).aggregate(total=Coalesce(Sum("amount"), Value(0, output_field=DecimalField())))["total"]
        
        # Compute total salary paid
        total_paid = SalaryPayment.objects.filter(
            doctor=doc
        ).aggregate(total=Coalesce(Sum("amount"), Value(0, output_field=DecimalField())))["total"]
        
        balance = total_earned - total_paid
        
        results.append({
            "id": str(doc.id),
            "firstName": doc.user.first_name if doc.user else "",
            "lastName": doc.user.last_name if doc.user else "",
            "phone": doc.user.phone_number if doc.user else "",
            "totalEarned": total_earned,
            "totalPaid": total_paid,
            "balance": balance,
            "commissionBasis": doc.commission_basis,
            "defaultRate": doc.default_commission_rate,
        })
        
    # Sort by balance descending
    results.sort(key=lambda x: x["balance"], reverse=True)
    return results


def debtors_data(search: str | None = None) -> dict[str, Any]:
    """Return all patients with outstanding balance (debt), along with unpaid treatments and aggregate metrics."""
    from apps.patients.models import Patient
    from apps.treatments.models import Treatment
    from django.db.models import Q

    patients_qs = Patient.objects.filter(is_active=True)
    if search:
        search = search.strip()
        patients_qs = patients_qs.filter(
            Q(first_name__icontains=search)
            | Q(last_name__icontains=search)
            | Q(phone_number__icontains=search)
        )

    debtors = []
    total_debt_all = Decimal("0.00")

    for patient in patients_qs:
        bal_info = patient_balance(patient.pk)
        balance = bal_info["balance"]
        if balance > Decimal("0.00"):
            total_debt_all += balance

            unpaid_treatments_qs = (
                Treatment.objects.filter(
                    patient_id=patient.pk,
                    is_active=True,
                    payment_status__in=["unpaid", "partial"],
                )
                .select_related("doctor__user", "procedure_type")
                .order_by("-created_at")
            )

            treatments_list = []
            for tr in unpaid_treatments_qs:
                tr_paid = total_paid_for_treatment(tr.pk)
                tr_debt = tr.price - tr_paid
                treatments_list.append({
                    "id": str(tr.pk),
                    "diagnosis": tr.diagnosis or "",
                    "procedureName": tr.procedure_type.name if tr.procedure_type else "",
                    "doctorName": tr.doctor.user.get_full_name() if tr.doctor and tr.doctor.user else "Shifokor",
                    "price": tr.price,
                    "paidAmount": tr_paid,
                    "debtAmount": tr_debt if tr_debt > 0 else Decimal("0.00"),
                    "paymentStatus": tr.payment_status,
                    "stage": tr.stage,
                    "createdAt": tr.created_at.isoformat() if tr.created_at else None,
                })

            debtors.append({
                "patientId": str(patient.pk),
                "firstName": patient.first_name,
                "lastName": patient.last_name,
                "fullName": f"{patient.first_name} {patient.last_name}".strip(),
                "phone": patient.phone_number,
                "totalBilled": bal_info["totalBilled"],
                "totalPaid": bal_info["totalPaid"],
                "debtAmount": balance,
                "unpaidTreatmentsCount": len(treatments_list),
                "unpaidTreatments": treatments_list,
                "createdAt": patient.created_at.isoformat() if patient.created_at else None,
            })

    debtors.sort(key=lambda x: x["debtAmount"], reverse=True)

    return {
        "totalDebtorsCount": len(debtors),
        "totalDebtAmount": total_debt_all,
        "debtors": debtors,
    }


def payment_stats() -> dict[str, Any]:
    """Return high-level payment summary metrics: today's collection, all-time, by payment method."""
    from django.utils import timezone
    from datetime import datetime, time

    now = timezone.now()
    today_start = datetime.combine(now.date(), time.min)
    if timezone.is_naive(today_start):
        today_start = timezone.make_aware(today_start, timezone.get_current_timezone())

    today_qs = Payment.objects.filter(is_active=True, created_at__gte=today_start)
    all_qs = Payment.objects.filter(is_active=True)

    def _method_sum(qs, method):
        return qs.filter(method=method).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

    today_total = today_qs.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
    all_total = all_qs.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

    return {
        "todayTotal": today_total,
        "todayCash": _method_sum(today_qs, "cash"),
        "todayCard": _method_sum(today_qs, "card"),
        "todayClick": _method_sum(today_qs, "click"),
        "todayPayme": _method_sum(today_qs, "payme"),
        "todayBankTransfer": _method_sum(today_qs, "bank_transfer"),
        "todayCount": today_qs.count(),
        "allTimeTotal": all_total,
        "allTimeCount": all_qs.count(),
    }


def expense_stats() -> dict[str, Any]:
    """Return summary metrics for clinic expenses: total, this month, cash vs card, and top category."""
    from django.utils import timezone
    from datetime import datetime, time
    from django.db.models import Count
    from apps.payments.models import Expense

    now = timezone.now()
    month_start = datetime(now.year, now.month, 1, 0, 0, 0)
    if timezone.is_naive(month_start):
        month_start = timezone.make_aware(month_start, timezone.get_current_timezone())

    today_start = datetime.combine(now.date(), time.min)
    if timezone.is_naive(today_start):
        today_start = timezone.make_aware(today_start, timezone.get_current_timezone())

    all_expenses = Expense.objects.all()
    month_expenses = all_expenses.filter(date__gte=month_start)
    today_expenses = all_expenses.filter(date__gte=today_start)

    total_amount = all_expenses.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
    month_total = month_expenses.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
    today_total = today_expenses.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

    cash_total = all_expenses.filter(payment_method="cash").aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
    card_total = all_expenses.filter(payment_method__in=["card", "click", "payme", "bank_transfer"]).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

    # Top category
    top_cat = (
        all_expenses.values("category__name")
        .annotate(total=Sum("amount"), count=Count("id"))
        .order_by("-total")
        .first()
    )

    top_category_name = top_cat["category__name"] if top_cat else "Mavjud emas"
    top_category_total = top_cat["total"] if top_cat else Decimal("0.00")

    return {
        "totalAmount": total_amount,
        "totalCount": all_expenses.count(),
        "monthTotal": month_total,
        "monthCount": month_expenses.count(),
        "todayTotal": today_total,
        "todayCount": today_expenses.count(),
        "cashTotal": cash_total,
        "cardTotal": card_total,
        "topCategoryName": top_category_name,
        "topCategoryTotal": top_category_total,
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
    "doctor_balances",
    "debtors_data",
    "payment_stats",
    "expense_stats",
]


