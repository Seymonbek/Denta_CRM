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
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["method", "treatment", "patient", "cash_shift", "refund_status"]
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
        if getattr(request.user, "role", None) != "bosh_shifokor":
            return Response(
                {"detail": "Faqat bosh shifokor smenani tasdiqlashi mumkin."},
                status=status.HTTP_403_FORBIDDEN
            )
        shift = self.get_object()
        from django.utils import timezone
        from apps.payments.notifications import notify_bosh_shifokor
        
        shift.status = "closed"
        shift.closed_at = timezone.now()
        shift.approved_by = request.user
        
        # Calculate real-time totals to match the frontend view exactly
        from django.db.models import Sum
        cash = shift.payments.filter(method="cash").aggregate(total=Sum("amount"))["total"] or 0
        card = shift.payments.filter(method="card").aggregate(total=Sum("amount"))["total"] or 0
        
        cash_exp = shift.expenses.filter(payment_method="cash").aggregate(total=Sum("amount"))["total"] or 0
        card_exp = shift.expenses.filter(payment_method="card").aggregate(total=Sum("amount"))["total"] or 0
        
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
            f"💳 Karta tushum: <code>{shift.card_collected:,.0f} so'm</code>\n"
            f"📉 Naqd xarajat: <code>{shift.cash_expenses:,.0f} so'm</code>\n"
            f"📉 Karta xarajat: <code>{shift.card_expenses:,.0f} so'm</code>\n\n"
            f"💶 <b>Kutilyotgan Yakuniy Naqd Pul:</b> <code>{expected_cash:,.0f} so'm</code>"
        )
        notify_bosh_shifokor(text)
        
        return Response(self.get_serializer(shift).data)


class ExpenseCategoryViewSet(viewsets.ModelViewSet):
    serializer_class = __import__("apps.payments.serializers", fromlist=["ExpenseCategorySerializer"]).ExpenseCategorySerializer
    queryset = __import__("apps.payments.models", fromlist=["ExpenseCategory"]).ExpenseCategory.objects.all()
    filter_backends = [filters.SearchFilter]
    search_fields = ["name"]
    pagination_class = None
    # Only bosh_shifokor can manage
    def get_permissions(self):
        from apps.core.permissions import IsBoshShifokor
        return [IsBoshShifokor()]


class ExpenseViewSet(viewsets.ModelViewSet):
    serializer_class = __import__("apps.payments.serializers", fromlist=["ExpenseSerializer"]).ExpenseSerializer
    queryset = __import__("apps.payments.models", fromlist=["Expense"]).Expense.objects.select_related("category", "recorded_by").all()
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["category", "payment_method", "cash_shift"]
    
    def get_permissions(self):
        from apps.core.permissions import IsBoshShifokor
        return [IsBoshShifokor()]

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
    def post(self, request: Request, pk: str) -> Response:
        if getattr(request.user, "role", None) not in ["bosh_shifokor", "administrator"]:
            return Response({"detail": "Not allowed"}, status=status.HTTP_403_FORBIDDEN)
            
        doctor = get_object_or_404(DoctorProfile.objects.all(), pk=pk)
        
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
]
