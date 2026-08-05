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
from typing import Any

from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import filters, status, viewsets
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

from .models import Payment
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
)
from .serializers import (
    CommissionRecordSerializer,
    CommissionSummarySerializer,
    PatientBalanceSerializer,
    PaymentSerializer,
)
from .services import void_payment


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
    filterset_fields = ["method", "treatment", "patient"]
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
        void_payment(payment)
        return Response(status=status.HTTP_204_NO_CONTENT)


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


__all__ = [
    "PaymentViewSet",
    "PatientBalanceView",
    "DoctorCommissionsView",
    "DoctorCommissionsSummaryView",
]
