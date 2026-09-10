"""HTTP orchestration for the ``payments`` app.

Endpoints (PROJECT_BRIEF § "Payments"):

* ``GET/POST /api/v1/payments/``               — list + create.
* ``GET /api/v1/payments/{id}/``               — retrieve.
* ``DELETE /api/v1/payments/{id}/``            — soft-void (bosh_shifokor).
* ``GET /api/v1/patients/{id}/balance/``       — totals + balance.
* ``GET /api/v1/doctors/{id}/commissions/``    — commissions in range.
* ``GET /api/v1/doctors/{id}/commissions/summary/`` — sum + count.

Filters:
    * Payments: ``?method=`` (repeatable), ``?treatment=``, ``?patient=``.
    * Commissions: ``?from=YYYY-MM-DD`` and ``?to=YYYY-MM-DD``.
"""
from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal
from typing import Any

from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import filters, serializers, status, viewsets, permissions
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.generics import get_object_or_404
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.idempotency import IdempotencyMixin
from apps.core.permissions import (
    ROLE_DOCTOR,
)
from apps.doctors.models import DoctorProfile
from apps.patients.models import Patient

from .models import Payment, CashShift, PaymentMethod
from .permissions import (
    CommissionsPermission,
    PatientBalancePermission,
    PaymentPermission,
)
from .selectors import (
    commission_summary_for_doctor,
    commissions_for_doctor,
    patient_balance,
    payments_qs,
    doctor_balances,
    debtors_data,
    payment_stats,
)
from .serializers import (
    CommissionRecordSerializer,
    CommissionSummarySerializer,
    PatientBalanceSerializer,
    PaymentSerializer,
)
from .services import void_payment, record_salary_payment


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _parse_date(raw: str | None, *, field: str) -> datetime | None:
    """Parse ``YYYY-MM-DD`` (or ISO 8601) into a timezone-aware datetime.

    Bare dates land at 00:00 local time; a bare date passed as ``to``
    means "end of that day" so callers get an inclusive range. We
    detect that via the ``field`` argument.
    """
    if raw is None or raw == "":
        return None
    try:
        # Try full ISO first.
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        try:
            d = date.fromisoformat(raw)
        except ValueError as exc:
            raise ValidationError(
                {field: [f"Sana YYYY-MM-DD formatida bo'lishi kerak: {raw!r}."]}
            ) from exc
        parsed = datetime.combine(
            d,
            time.max if field == "to" else time.min,
        )
    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed


# ===========================================================================
# PaymentViewSet — /api/v1/payments/
# ===========================================================================
@extend_schema(
    tags=["payments"],
    parameters=[
        OpenApiParameter(
            name="Idempotency-Key",
            required=False,
            type=str,
            location=OpenApiParameter.HEADER,
            description=(
                "T129 — client-generated retry key. Same key + same body "
                "replays the cached response of the first successful call; "
                "same key + different body returns 409. Cached for 24 hours."
            ),
        ),
    ],
)
class PaymentViewSet(IdempotencyMixin, viewsets.ModelViewSet):
    """CRUD for :class:`Payment`.

    T129 — :class:`~apps.core.idempotency.IdempotencyMixin` makes
    ``POST /api/v1/payments/`` idempotent when the client sends an
    ``Idempotency-Key`` header. Recording a payment is the single
    highest-risk write in the app (money movement + commission recalc
    + audit log), so a network retry MUST NOT double-record.
    """

    #: Actions this viewset should treat as idempotent.
    idempotent_actions = {"create"}

    serializer_class = PaymentSerializer
    permission_classes = [PaymentPermission]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter, filters.SearchFilter]
    filterset_fields = ["method", "treatment", "patient", "cash_shift", "refund_status"]
    search_fields = ["patient__first_name", "patient__last_name", "patient__phone_number", "id"]
    ordering_fields = ["created_at", "amount"]
    ordering = ["-created_at"]
    http_method_names = ["get", "post", "delete", "head", "options"]
    lookup_field = "pk"

    def get_queryset(self):
        request = getattr(self, "request", None)
        qs = payments_qs()
        if request is None:
            return qs
        # Doctors only see their own patients' payments unless
        # ``can_view_other_doctors`` is set.
        role = getattr(request.user, "role", None)
        if role == ROLE_DOCTOR:
            profile = getattr(request.user, "doctor_profile", None)
            if profile is None:
                return qs.none()
            if getattr(profile, "can_view_other_doctors", False):
                return qs
            return qs.filter(treatment__doctor_id=profile.pk)
        return qs

    def destroy(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        payment: Payment = self.get_object()
        from .services import void_payment
        void_payment(payment)
        if payment.refund_status == "pending":
            return Response(
                {"detail": "Kassa smenasi yopilganligi sababli to'lovni bekor qilish so'rovi Bosh Shifokor tasdig'iga yuborildi."},
                status=status.HTTP_202_ACCEPTED
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(
        summary="Approve or reject a refund request (Bosh Shifokor only)",
        request=inline_serializer(
            name="ApproveRefundSerializer",
            fields={"approved": serializers.BooleanField()},
        ),
        responses={200: None, 400: None},
    )
    @action(detail=True, methods=["post"], url_path="approve-refund")
    def approve_refund(self, request: Request, pk: str | None = None) -> Response:
        from apps.core.permissions import IsBoshShifokor
        from rest_framework.exceptions import PermissionDenied
        
        if not IsBoshShifokor().has_permission(request, self):
            raise PermissionDenied("Faqat bosh shifokor bekor qilish so'rovlarini tasdiqlay oladi.")
            
        payment: Payment = self.get_object()
        if payment.refund_status != "pending":
            return Response({"error": "To'lov bekor qilish so'rovi kutilmayapti."}, status=status.HTTP_400_BAD_REQUEST)
            
        approved = request.data.get("approved")
        if approved is None:
            return Response({"error": "'approved' maydoni talab qilinadi."}, status=status.HTTP_400_BAD_REQUEST)
            
        if approved:
            payment.is_active = False
            payment.refund_status = "approved"
            payment.save(update_fields=["is_active", "refund_status", "updated_at"])
            from .services import _refresh_payment_status
            _refresh_payment_status(payment.treatment)
            return Response({"detail": "To'lov bekor qilinishi tasdiqlandi."}, status=status.HTTP_200_OK)
        else:
            payment.refund_status = "rejected"
            payment.save(update_fields=["refund_status", "updated_at"])
            return Response({"detail": "To'lov bekor qilinishi rad etildi."}, status=status.HTTP_200_OK)


# ===========================================================================
# PatientBalanceView — /api/v1/patients/{id}/balance/
# ===========================================================================
@extend_schema(
    tags=["payments"],
    responses=PatientBalanceSerializer,
    parameters=[
        OpenApiParameter(
            name="patient_id",
            required=True,
            type=str,
            location=OpenApiParameter.PATH,
        ),
    ],
)
class PatientBalanceView(APIView):
    """``GET /api/v1/patients/{id}/balance/``."""

    permission_classes = [PatientBalancePermission]

    def get(self, request: Request, patient_id: Any, *args: Any, **kwargs: Any) -> Response:
        patient = get_object_or_404(Patient, pk=patient_id, is_active=True)
        role = getattr(request.user, "role", None)
        if role == ROLE_DOCTOR:
            profile = getattr(request.user, "doctor_profile", None)
            if profile is None:
                raise NotFound("Doctor profile not found for user.")
            if not getattr(profile, "can_view_other_doctors", False):
                has_treatment = patient.treatments.filter(
                    doctor_id=profile.pk, is_active=True,
                ).exists()
                if not has_treatment:
                    raise NotFound("Bemor sizga tegishli emas.")
        data = patient_balance(patient.pk)
        return Response(PatientBalanceSerializer(data).data)


# ===========================================================================
# DoctorCommissionsView — /api/v1/doctors/{id}/commissions/
# ===========================================================================
@extend_schema(
    tags=["payments"],
    responses=CommissionRecordSerializer(many=True),
    parameters=[
        OpenApiParameter(
            name="from", required=False, type=str,
            location=OpenApiParameter.QUERY,
            description="Boshlanish sanasi (YYYY-MM-DD).",
        ),
        OpenApiParameter(
            name="to", required=False, type=str,
            location=OpenApiParameter.QUERY,
            description="Tugash sanasi (YYYY-MM-DD, inklyuziv).",
        ),
    ],
)
class DoctorCommissionsView(APIView):
    """``GET /api/v1/doctors/{id}/commissions/``."""

    permission_classes = [CommissionsPermission]

    def get(self, request: Request, doctor_id: Any, *args: Any, **kwargs: Any) -> Response:
        doctor = get_object_or_404(DoctorProfile, pk=doctor_id, is_active=True)
        role = getattr(request.user, "role", None)
        if role == ROLE_DOCTOR and doctor.user_id != request.user.id:
            profile = getattr(request.user, "doctor_profile", None)
            if not getattr(profile, "can_view_other_doctors", False):
                raise NotFound("Ushbu shifokorning komissiyalarini ko'ra olmaysiz.")
        date_from = _parse_date(request.query_params.get("from"), field="from")
        date_to = _parse_date(request.query_params.get("to"), field="to")
        qs = commissions_for_doctor(
            doctor.pk, date_from=date_from, date_to=date_to,
        )
        return Response(CommissionRecordSerializer(qs, many=True).data)


from django.http import HttpResponse
from apps.core.pdf_services import generate_payment_receipt_html


class DoctorCommissionsSummaryView(APIView):
    """``GET /api/v1/doctors/{id}/commissions/summary/`` — aggregate view."""

    permission_classes = [CommissionsPermission]

    @extend_schema(
        tags=["payments"],
        responses=CommissionSummarySerializer,
        parameters=[
            OpenApiParameter(
                name="from", required=False, type=str,
                location=OpenApiParameter.QUERY,
            ),
            OpenApiParameter(
                name="to", required=False, type=str,
                location=OpenApiParameter.QUERY,
            ),
        ],
    )
    def get(self, request: Request, doctor_id: Any, *args: Any, **kwargs: Any) -> Response:
        doctor = get_object_or_404(DoctorProfile, pk=doctor_id, is_active=True)
        role = getattr(request.user, "role", None)
        if role == ROLE_DOCTOR and doctor.user_id != request.user.id:
            profile = getattr(request.user, "doctor_profile", None)
            if not getattr(profile, "can_view_other_doctors", False):
                raise NotFound("Ushbu shifokorning komissiyalarini ko'ra olmaysiz.")
        date_from = _parse_date(request.query_params.get("from"), field="from")
        date_to = _parse_date(request.query_params.get("to"), field="to")
        payload = commission_summary_for_doctor(
            doctor.pk, date_from=date_from, date_to=date_to,
        )
        return Response(CommissionSummarySerializer(payload).data)


class PaymentReceiptPDFView(APIView):
    """GET /api/v1/payments/{id}/receipt/ — returns printable HTML/PDF receipt."""

    permission_classes = []
    authentication_classes = []

    def get(self, request: Request, pk: Any, *args: Any, **kwargs: Any) -> HttpResponse:
        payment = get_object_or_404(Payment, pk=pk, is_active=True)
        treatment = payment.treatment
        tooth_records = (
            [
                {
                    "tooth_number": tr.tooth_number,
                    "procedure": tr.get_procedure_display(),
                    "status": tr.get_status_display(),
                    "notes": tr.notes,
                }
                for tr in treatment.tooth_records.all()
            ]
            if treatment
            else []
        )
        payment_data = {
            "id": payment.pk,
            "amount": payment.amount,
            "payment_method": getattr(payment, "method", "cash"),
            "patient_name": getattr(payment.patient, "full_name", str(payment.patient)) if payment.patient else "Bemor",
            "patient_phone": payment.patient.phone_number if payment.patient else "-",
            "doctor_name": payment.treatment.doctor.user.get_full_name() if payment.treatment and payment.treatment.doctor else "Shifokor",
            "paid_at": payment.created_at.isoformat(),
            "treatment_procedure": treatment.procedure_type.name if treatment and treatment.procedure_type else None,
            "treatment_diagnosis": treatment.diagnosis if treatment else None,
            "treatment_description": treatment.description if treatment else None,
            "treatment_price": treatment.price if treatment else None,
            "tooth_records": tooth_records,
        }
        html_content = generate_payment_receipt_html(payment_data)
        return HttpResponse(html_content, content_type="text/html; charset=utf-8")


class CashShiftViewSet(viewsets.ModelViewSet):
    """CRUD and Approval for CashShift (Kassa Smenasi)."""
    queryset = __import__("apps.payments.models", fromlist=["CashShift"]).CashShift.objects.select_related("administrator", "approved_by").all()
    serializer_class = __import__("apps.payments.serializers", fromlist=["CashShiftSerializer"]).CashShiftSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["administrator__first_name", "administrator__last_name", "administrator__phone_number"]
    filterset_fields = ["status"]
    ordering_fields = ["opened_at", "closed_at", "created_at"]
    ordering = ["-opened_at"]

    def get_queryset(self):
        qs = super().get_queryset()
        if getattr(self.request.user, "role", None) != "bosh_shifokor":
            qs = qs.filter(administrator=self.request.user)
        return qs

    def perform_create(self, serializer):
        from rest_framework.exceptions import ValidationError
        from apps.payments.models import CashShift, CashShiftStatus
        from apps.payments.notifications import notify_bosh_shifokor
        if CashShift.objects.filter(administrator=self.request.user, status=CashShiftStatus.OPEN).exists():
            raise ValidationError({"detail": "Sizda allaqachon ochiq smena mavjud."})
        shift = serializer.save(administrator=self.request.user)
        
        # Smena ochilganda telegram botga xabar
        text = (
            f"🟢 <b>Yangi Kassa Smenasi Ochildi</b>\n\n"
            f"👤 Mas'ul xodim: {self.request.user.get_full_name()}\n"
            f"💰 Boshlang'ich qoldiq: <code>{shift.start_balance:,.0f} so'm</code>\n"
            f"🕒 Ochilgan vaqt: {shift.opened_at.strftime('%d.%m.%Y %H:%M')}"
        )
        notify_bosh_shifokor(text)

    @extend_schema(
        summary="Get my open cash shift",
        request=None,
        responses={200: __import__("apps.payments.serializers", fromlist=["CashShiftSerializer"]).CashShiftSerializer, 404: None}
    )
    @action(detail=False, methods=["get"], url_path="my-open")
    def my_open(self, request):
        from apps.payments.models import CashShift, CashShiftStatus
        shift = CashShift.objects.filter(administrator=request.user, status=CashShiftStatus.OPEN).first()
        if shift:
            return Response(self.get_serializer(shift).data)
        return Response(None)

    @extend_schema(
        summary="Approve (and close) a cash shift",
        request=None,
        responses={200: __import__("apps.payments.serializers", fromlist=["CashShiftSerializer"]).CashShiftSerializer}
    )
    @action(detail=True, methods=["post"], url_path="approve")
    def approve_shift(self, request, pk=None):
        shift = self.get_object()
        user_role = getattr(request.user, "role", None)
        is_owner = shift.administrator_id == request.user.id
        if user_role != "bosh_shifokor" and not is_owner:
            return Response(
                {"detail": "Faqat bosh shifokor yoki smena ochgan administrator smenani yopishi mumkin."},
                status=status.HTTP_403_FORBIDDEN
            )
        from django.utils import timezone
        from apps.payments.notifications import notify_bosh_shifokor
        
        shift.status = "closed"
        shift.closed_at = timezone.now()
        shift.approved_by = request.user
        
        # Calculate real-time totals to match the frontend view exactly
        # Calculate real-time totals to match all payment methods
        from decimal import Decimal
        from django.db.models import Sum

        cash = shift.payments.filter(method="cash").aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
        plain_card = shift.payments.filter(method="card").aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
        payme = shift.payments.filter(method="payme").aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
        click = shift.payments.filter(method="click").aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
        bank = shift.payments.filter(method="bank_transfer").aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
        
        # All non-cash collections combined into cashless/card total
        card = plain_card + payme + click + bank
        
        cash_exp = shift.expenses.filter(payment_method="cash").aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
        card_exp = shift.expenses.exclude(payment_method="cash").aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
        
        shift.cash_collected = cash
        shift.card_collected = card
        shift.cash_expenses = cash_exp
        shift.card_expenses = card_exp
        shift.save(update_fields=[
            "status", "closed_at", "approved_by", "updated_at", 
            "cash_collected", "card_collected", "cash_expenses", "card_expenses"
        ])
        
        # Smena yopilganda telegram botga xabar
        expected_cash = shift.start_balance + shift.cash_collected - shift.cash_expenses
        text = (
            f"🔴 <b>Kassa Smenasi Yopildi</b>\n\n"
            f"👤 Mas'ul xodim: {shift.administrator.get_full_name()}\n"
            f"🕒 Yopilgan vaqt: {shift.closed_at.strftime('%d.%m.%Y %H:%M')}\n\n"
            f"💰 <b>Boshlang'ich qoldiq:</b> <code>{shift.start_balance:,.0f} so'm</code>\n"
            f"💵 Naqd tushum: <code>{shift.cash_collected:,.0f} so'm</code>\n"
            f"💳 Naqdsiz jami tushum: <code>{shift.card_collected:,.0f} so'm</code>\n"
            f"   • Karta/Terminal: <code>{plain_card:,.0f} so'm</code>\n"
            f"   • Payme: <code>{payme:,.0f} so'm</code>\n"
            f"   • Click: <code>{click:,.0f} so'm</code>\n"
            f"   • Bank o'tkazmasi: <code>{bank:,.0f} so'm</code>\n\n"
            f"📉 Naqd xarajat: <code>{shift.cash_expenses:,.0f} so'm</code>\n"
            f"📉 Naqdsiz xarajat: <code>{shift.card_expenses:,.0f} so'm</code>\n\n"
            f"💶 <b>Kutilayotgan Yakuniy Naqd Pul:</b> <code>{expected_cash:,.0f} so'm</code>"
        )
        notify_bosh_shifokor(text)
        
        return Response(self.get_serializer(shift).data)

    @action(detail=False, methods=["get"], url_path="stats")
    def stats(self, request):
        """GET /api/v1/cash-shifts/stats/ - Summary KPIs for cash shifts."""
        from apps.payments.models import CashShift
        from decimal import Decimal
        from django.db.models import Sum
        from django.utils import timezone
        from datetime import datetime, time

        now = timezone.now()
        today_start = datetime.combine(now.date(), time.min)
        if timezone.is_naive(today_start):
            today_start = timezone.make_aware(today_start, timezone.get_current_timezone())

        open_shifts = CashShift.objects.filter(status="open")
        today_shifts = CashShift.objects.filter(opened_at__gte=today_start)

        # In-hand cash for currently open shifts
        current_cash_in_hand = Decimal("0.00")
        for s in open_shifts:
            current_cash_in_hand += (s.start_balance + s.cash_collected - s.cash_expenses)

        today_cash_collected = today_shifts.aggregate(t=Sum("cash_collected"))["t"] or Decimal("0.00")
        today_card_collected = today_shifts.aggregate(t=Sum("card_collected"))["t"] or Decimal("0.00")
        today_cash_expenses = today_shifts.aggregate(t=Sum("cash_expenses"))["t"] or Decimal("0.00")

        return Response({
            "openShiftsCount": open_shifts.count(),
            "totalShiftsCount": CashShift.objects.count(),
            "currentCashInHand": current_cash_in_hand,
            "todayCashCollected": today_cash_collected,
            "todayCardCollected": today_card_collected,
            "todayCashExpenses": today_cash_expenses,
        })

    @action(detail=True, methods=["get"], url_path="details")
    def details(self, request, pk=None):
        """GET /api/v1/cash-shifts/{id}/details/ - Return shift info, payments, and expenses for Z-Report."""
        shift = self.get_object()
        serializer = self.get_serializer(shift)
        
        # Payments in this shift
        payments_data = []
        for p in shift.payments.select_related("patient", "treatment__procedure_type", "treatment__doctor__user").all():
            patient_name = p.patient.get_full_name() if p.patient else ""
            doctor_name = p.treatment.doctor.user.get_full_name() if p.treatment and p.treatment.doctor else ""
            proc_name = p.treatment.procedure_type.name if p.treatment and p.treatment.procedure_type else ""
            payments_data.append({
                "id": str(p.id),
                "created_at": p.created_at.isoformat(),
                "patient_name": patient_name,
                "doctor_name": doctor_name,
                "procedure_name": proc_name,
                "method": p.method,
                "amount": str(p.amount),
            })

        # Expenses in this shift
        expenses_data = []
        for e in shift.expenses.select_related("category").all():
            expenses_data.append({
                "id": str(e.id),
                "date": e.date.isoformat(),
                "category_name": e.category.name if e.category else "Boshqa",
                "payment_method": e.payment_method,
                "amount": str(e.amount),
                "description": e.description,
            })

        return Response({
            "shift": serializer.data,
            "payments": payments_data,
            "expenses": expenses_data,
        })



import django_filters


class ExpenseFilterSet(django_filters.FilterSet):
    start_date = django_filters.DateTimeFilter(field_name="date", lookup_expr="gte")
    end_date = django_filters.DateTimeFilter(field_name="date", lookup_expr="lte")

    class Meta:
        from apps.payments.models import Expense
        model = Expense
        fields = ["category", "payment_method", "cash_shift", "start_date", "end_date"]


class ExpenseCategoryViewSet(viewsets.ModelViewSet):
    serializer_class = __import__("apps.payments.serializers", fromlist=["ExpenseCategorySerializer"]).ExpenseCategorySerializer
    queryset = __import__("apps.payments.models", fromlist=["ExpenseCategory"]).ExpenseCategory.objects.all()
    filter_backends = [filters.SearchFilter]
    search_fields = ["name"]
    pagination_class = None

    def get_permissions(self):
        from apps.core.permissions import IsBoshShifokor, IsBoshShifokorOrAdministrator
        if self.action in ["list", "retrieve"]:
            return [IsBoshShifokorOrAdministrator()]
        return [IsBoshShifokor()]


class ExpenseViewSet(viewsets.ModelViewSet):
    serializer_class = __import__("apps.payments.serializers", fromlist=["ExpenseSerializer"]).ExpenseSerializer
    queryset = __import__("apps.payments.models", fromlist=["Expense"]).Expense.objects.select_related("category", "recorded_by").all()
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = ExpenseFilterSet
    search_fields = ["description", "category__name", "recorded_by__first_name", "recorded_by__last_name"]
    ordering_fields = ["date", "created_at", "amount"]
    ordering = ["-created_at"]
    
    def get_permissions(self):
        from apps.core.permissions import IsBoshShifokor, IsBoshShifokorOrAdministrator
        if self.action in ["destroy"]:
            return [IsBoshShifokor()]
        return [IsBoshShifokorOrAdministrator()]

    @action(detail=False, methods=["get"])
    def stats(self, request: Request) -> Response:
        """GET /api/v1/expenses/stats/"""
        from apps.payments.selectors import expense_stats
        return Response(expense_stats())

    def perform_create(self, serializer):
        from apps.payments.models import CashShift
        from apps.payments.notifications import notify_bosh_shifokor
        shift = CashShift.objects.filter(administrator=self.request.user, status="open").first()
        expense = serializer.save(recorded_by=self.request.user, cash_shift=shift)
        
        # Yangi xarajat kiritilganda telegram botga xabar
        text = (
            f"📉 <b>Yangi Xarajat Kiritildi</b>\n\n"
            f"🔖 <b>Toifa:</b> {expense.category.name if expense.category else 'Boshqa'}\n"
            f"👤 <b>Kirituvchi:</b> {self.request.user.get_full_name()}\n"
            f"💰 <b>Summa:</b> <code>{expense.amount:,.0f} so'm</code>\n"
            f"💳 <b>Usul:</b> {expense.payment_method}\n"
            f"📝 <b>Izoh:</b> <i>{expense.description or 'Izohsiz'}</i>"
        )
        notify_bosh_shifokor(text)



class DoctorBalancesView(APIView):
    """
    GET /api/v1/payments/doctors/balances/
    Returns a list of doctors with their total earned, total paid, and balance.
    Only for admins/head_doctors.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request) -> Response:
        # Simplified permission: only bosh_shifokor or administrator can see all balances
        if getattr(request.user, "role", None) not in ["bosh_shifokor", "administrator"]:
            return Response({"detail": "Not allowed"}, status=status.HTTP_403_FORBIDDEN)
            
        data = doctor_balances()
        return Response(data)


class SalaryPaymentCreateSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    method = serializers.ChoiceField(choices=PaymentMethod.choices, default=PaymentMethod.CASH)
    shift_id = serializers.IntegerField(required=True)
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class SalaryPaymentCreateView(APIView, IdempotencyMixin):
    """
    POST /api/v1/payments/doctors/{id}/pay_salary/
    Pays salary to a doctor, creating an Expense in the specified CashShift.
    Only for admins/head_doctors.
    """
    permission_classes = [permissions.IsAuthenticated]
    
    @extend_schema(request=SalaryPaymentCreateSerializer)
    def post(self, request: Request, doctor_id: str | None = None, pk: str | None = None, **kwargs: Any) -> Response:
        if getattr(request.user, "role", None) not in ["bosh_shifokor", "administrator"]:
            return Response({"detail": "Not allowed"}, status=status.HTTP_403_FORBIDDEN)
            
        doc_id = doctor_id or pk
        doctor = get_object_or_404(DoctorProfile.objects.all(), pk=doc_id)
        
        serializer = SalaryPaymentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        data = serializer.validated_data
        shift = get_object_or_404(CashShift.objects.all(), pk=data["shift_id"])
        
        try:
            salary_payment = record_salary_payment(
                doctor=doctor,
                amount=data["amount"],
                method=data["method"],
                shift=shift,
                user=request.user,
                notes=data["notes"],
            )
            
            # Send notification
            text = (
                f"💰 <b>Ish haqi to'landi</b>\n\n"
                f"Shifokor: {doctor.user.get_full_name()}\n"
                f"Summa: {salary_payment.amount:,.0f} so'm\n"
                f"Usul: {salary_payment.payment_method}\n"
                f"Kiritdi: {request.user.get_full_name()}"
            )
            if salary_payment.notes:
                text += f"\nIzoh: {salary_payment.notes}"
            notify_bosh_shifokor(text)
            
            return Response({"detail": "Success", "id": salary_payment.id}, status=status.HTTP_201_CREATED)
        except ValidationError as e:
            return Response({"error": e.detail if hasattr(e, 'detail') else str(e)}, status=status.HTTP_400_BAD_REQUEST)


class DebtorsListView(APIView):
    """
    GET /api/v1/payments/debtors/
    Returns all patients with outstanding debt (balance > 0) and their unpaid treatments.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request) -> Response:
        search = request.query_params.get("search")
        data = debtors_data(search=search)
        return Response(data)


class PaymentStatsView(APIView):
    """
    GET /api/v1/payments/stats/
    Returns today's and all-time collections by payment method.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request) -> Response:
        data = payment_stats()
        return Response(data)


__all__ = [
    "PaymentViewSet",
    "PatientBalanceView",
    "DoctorCommissionsView",
    "DoctorCommissionsSummaryView",
    "PaymentReceiptPDFView",
    "CashShiftViewSet",
    "ExpenseCategoryViewSet",
    "ExpenseViewSet",
    "DoctorBalancesView",
    "SalaryPaymentCreateView",
    "DebtorsListView",
    "PaymentStatsView",
]
