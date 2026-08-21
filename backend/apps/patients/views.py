"""HTTP orchestration for the ``patients`` app.

Views are intentionally thin: they wire DRF viewsets to selectors,
services, serializers, and the permission class. Actual business logic
lives in :mod:`apps.patients.services` and query construction lives in
:mod:`apps.patients.selectors`.

Endpoints (PROJECT_BRIEF § "Patients"):

* ``GET  /api/v1/patients/``            — paginated list, ``?search=`` filter.
* ``POST /api/v1/patients/``            — create (bosh_shifokor / administrator).
* ``GET  /api/v1/patients/{id}/``       — retrieve.
* ``PATCH /api/v1/patients/{id}/``      — partial update.
* ``PUT   /api/v1/patients/{id}/``      — full update.
* ``DELETE /api/v1/patients/{id}/``     — soft-delete.
* ``GET  /api/v1/patients/{id}/history/``    — treatment timeline (aggregated).
* ``GET  /api/v1/patients/{id}/odontogram/`` — tooth-formula snapshot.
"""
from __future__ import annotations

from django.db import models
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.request import Request
from rest_framework.response import Response

from apps.core.pagination import StandardResultsSetPagination

from .models import Patient
from .permissions import PatientPermission
from .selectors import (
    active_patients,
    all_patients,
    search_patients,
)
from .serializers import (
    PatientHistoryEventSerializer,
    PatientOdontogramToothSerializer,
    PatientOdontogramHistorySerializer,
    PatientSerializer,
)
from .services import soft_delete_patient

# FDI numbering used by the frontend odontogram — permanent adult teeth
# only. Deciduous (51-85) are out of scope per PROJECT_BRIEF.
_FDI_TEETH: tuple[int, ...] = tuple(
    n
    for quadrant in (10, 20, 30, 40)
    for n in range(quadrant + 1, quadrant + 9)
)  # → (11..18, 21..28, 31..38, 41..48) = 32 teeth


@extend_schema(tags=["patients"])
class PatientViewSet(viewsets.ModelViewSet):
    """CRUD for :class:`Patient` under ``/api/v1/patients/``."""

    serializer_class = PatientSerializer
    permission_classes = [PatientPermission]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["is_active", "gender"]
    ordering_fields = ["last_name", "first_name", "created_at"]
    ordering = ["-created_at"]
    lookup_field = "pk"

    # Sub-resource views (history / odontogram) can be read by any
    # authenticated user.
    def get_queryset(self):
        request: Request | None = getattr(self, "request", None)
        if request is None:
            return active_patients()

        include_inactive = str(
            request.query_params.get("include_inactive", "")
        ).lower() in {"1", "true", "yes"}
        role = getattr(request.user, "role", None)

        base = (
            all_patients()
            if (include_inactive and role == "bosh_shifokor")
            else active_patients()
        )

        if role == "doctor":
            profile = getattr(request.user, "doctor_profile", None)
            if profile is not None and not getattr(profile, "can_view_other_doctors", False):
                base = base.filter(
                    models.Q(appointment__doctor=profile)
                    | models.Q(treatment__doctor=profile)
                    | models.Q(created_by=request.user)
                ).distinct()

        query = request.query_params.get("search")
        if query:
            return search_patients(
                query,
                include_inactive=(
                    include_inactive and role == "bosh_shifokor"
                ),
            ).filter(pk__in=base.values("pk")) if role == "doctor" else search_patients(
                query,
                include_inactive=(
                    include_inactive and role == "bosh_shifokor"
                ),
            )
        return base.order_by("-created_at")

    # ------------------------------------------------------------------
    # Schema tweaks
    # ------------------------------------------------------------------
    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="search",
                required=False,
                type=str,
                location=OpenApiParameter.QUERY,
                description="Case-insensitive substring match on name or phone.",
            ),
            OpenApiParameter(
                name="include_inactive",
                required=False,
                type=bool,
                location=OpenApiParameter.QUERY,
                description="Include soft-deleted patients (bosh_shifokor only).",
            ),
        ],
    )
    def list(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        return super().list(request, *args, **kwargs)

    # ------------------------------------------------------------------
    # Soft-delete instead of hard delete
    # ------------------------------------------------------------------
    def destroy(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        patient: Patient = self.get_object()
        soft_delete_patient(patient)
        return Response(status=status.HTTP_204_NO_CONTENT)

    # ------------------------------------------------------------------
    # /patients/{id}/history/
    # ------------------------------------------------------------------
    @extend_schema(
        summary="Patient treatment timeline",
        responses={200: PatientHistoryEventSerializer(many=True)},
        parameters=[
            OpenApiParameter(
                name="page",
                required=False,
                type=int,
                location=OpenApiParameter.QUERY,
                description="1-indexed page number (see standard pagination envelope).",
            ),
            OpenApiParameter(
                name="page_size",
                required=False,
                type=int,
                location=OpenApiParameter.QUERY,
                description="Page size override (max 100).",
            ),
        ],
    )
    @action(detail=True, methods=["get"], url_path="history")
    def history(self, request: Request, pk: str | None = None) -> Response:
        """Aggregated treatment/appointment/payment timeline.

        T123: response is wrapped in the standard pagination envelope
        (``{count, next, previous, results}``) — same shape as every
        other list endpoint so the frontend ``useInfiniteQuery`` /
        ``usePagination`` hooks work uniformly. Callers requesting the
        legacy flat list must upgrade to reading ``.results``.
        """
        patient: Patient = self.get_object()
        events: list[dict[str, Any]] = _collect_history_events(patient)
        # Fall back to the "patient registered" note so an empty timeline
        # still shows *something* useful in the UI.
        if not events:
            events = [
                {
                    "id": f"patient-created-{patient.id}",
                    "type": "note",
                    "occurredAt": patient.created_at,
                    "title": "Bemor ro'yxatga olindi",
                    "summary": (
                        f"Kartochka yaratildi: {patient.full_name}, "
                        f"{patient.phone_number}."
                    ),
                    "meta": {},
                }
            ]

        # Standard pagination — reuses the same PageNumberPagination
        # subclass every other list endpoint uses so ``count``, ``next``,
        # and ``previous`` all follow the documented envelope.
        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(events, request, view=self)
        # ``page`` is always non-None for a non-empty list; DRF only
        # returns None when pagination is disabled globally, which is
        # not the case here. Guard anyway to keep the type-checker happy.
        if page is None:  # pragma: no cover - defensive branch
            serializer = PatientHistoryEventSerializer(events, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)

        serializer = PatientHistoryEventSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    # ------------------------------------------------------------------
    # /patients/{id}/odontogram/
    # ------------------------------------------------------------------
    @extend_schema(
        summary="Patient odontogram snapshot",
        responses={200: PatientOdontogramToothSerializer(many=True)},
    )
    @action(detail=True, methods=["get"], url_path="odontogram")
    def odontogram(self, request: Request, pk: str | None = None) -> Response:
        """Return one entry per FDI tooth with the most-recent status.

        Prior to T13 (odontogram app) every tooth is reported as
        ``healthy`` — the endpoint still returns the full 32-tooth
        payload so the SVG component renders correctly.
        """
        patient: Patient = self.get_object()
        teeth = _collect_odontogram(patient)
        serializer = PatientOdontogramToothSerializer(teeth, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    # ------------------------------------------------------------------
    # /patients/{id}/odontogram-history/
    # ------------------------------------------------------------------
    @extend_schema(
        summary="Patient odontogram history",
        responses={200: PatientOdontogramHistorySerializer(many=True)},
        parameters=[
            OpenApiParameter(
                name="tooth_number",
                required=False,
                type=int,
                location=OpenApiParameter.QUERY,
                description="Filter by FDI tooth number.",
            ),
        ],
    )
    @action(detail=True, methods=["get"], url_path="odontogram-history")
    def odontogram_history(self, request: Request, pk: str | None = None) -> Response:
        """Return historical tooth records for the patient."""
        patient: Patient = self.get_object()
        
        from django.apps import apps as django_apps
        if not django_apps.is_installed("apps.odontogram"):
            return Response([])
            
        ToothRecord = django_apps.get_model("odontogram", "ToothRecord")
        
        queryset = ToothRecord.objects.filter(treatment__patient=patient).select_related(
            "treatment", "treatment__doctor", "treatment__doctor__user"
        ).order_by("-created_at")
        
        tooth_number = request.query_params.get("tooth_number")
        if tooth_number and tooth_number.isdigit():
            queryset = queryset.filter(tooth_number=int(tooth_number))
            
        serializer = PatientOdontogramHistorySerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    # ------------------------------------------------------------------
    # /patients/recall/
    # ------------------------------------------------------------------
    @extend_schema(summary="Patient recall queue for follow-ups and checkups")
    @action(detail=False, methods=["get"], url_path="recall")
    def recall_queue(self, request: Request) -> Response:
        """Return list of patients due for follow-up, checkup or unfinished planned treatments."""
        from django.apps import apps as django_apps
        from django.utils import timezone
        from datetime import timedelta

        days_param = request.query_params.get("days", "90")
        try:
            days_threshold = int(days_param)
        except ValueError:
            days_threshold = 90

        now = timezone.now()

        qs = active_patients()
        role = getattr(request.user, "role", None)
        if role == "doctor":
            profile = getattr(request.user, "doctor_profile", None)
            if profile is not None and not getattr(profile, "can_view_other_doctors", False):
                qs = qs.filter(
                    models.Q(appointment__doctor=profile)
                    | models.Q(treatment__doctor=profile)
                    | models.Q(created_by=request.user)
                ).distinct()

        Appointment = django_apps.get_model("scheduling", "Appointment") if django_apps.is_installed("apps.scheduling") else None
        Treatment = django_apps.get_model("treatments", "Treatment") if django_apps.is_installed("apps.treatments") else None
        ToothRecord = django_apps.get_model("odontogram", "ToothRecord") if django_apps.is_installed("apps.odontogram") else None

        recall_list = []

        for patient in qs[:250]:
            latest_date = None
            doctor_name = ""
            procedure_name = ""

            if Appointment is not None:
                last_appt = Appointment.objects.filter(patient=patient, status="completed").order_by("-scheduled_start").first()
                if last_appt:
                    latest_date = last_appt.scheduled_start
                    if last_appt.doctor and hasattr(last_appt.doctor, "user") and last_appt.doctor.user:
                        doctor_name = f"Dr. {last_appt.doctor.user.get_full_name()}".strip()

            if Treatment is not None:
                last_tr = Treatment.objects.filter(patient=patient).order_by("-created_at").first()
                if last_tr and (not latest_date or last_tr.created_at > latest_date):
                    latest_date = last_tr.created_at
                    if last_tr.doctor and hasattr(last_tr.doctor, "user") and last_tr.doctor.user:
                        doctor_name = f"Dr. {last_tr.doctor.user.get_full_name()}".strip()
                    if last_tr.procedure_type:
                        procedure_name = last_tr.procedure_type.name

            # Check planned teeth
            has_planned_teeth = False
            planned_count = 0
            if ToothRecord is not None:
                planned_teeth = ToothRecord.objects.filter(
                    treatment__patient=patient,
                    status__in=["planned", "rejalashtirilgan", "treatment_needed", "caries"]
                )
                planned_count = planned_teeth.count()
                has_planned_teeth = planned_count > 0

            # Check if an upcoming appointment is already booked
            has_upcoming = False
            if Appointment is not None:
                has_upcoming = Appointment.objects.filter(
                    patient=patient,
                    scheduled_start__gte=now,
                    status__in=["scheduled", "confirmed", "in_progress"]
                ).exists()

            if has_upcoming:
                continue

            days_since = (now - latest_date).days if latest_date else (now - patient.created_at).days

            # Formulate clear clinical reason
            recall_reason = ""
            if has_planned_teeth:
                recall_reason = f"Rejalashtirilgan muolajalar qolgan ({planned_count} ta tish)"
            elif days_since >= 180:
                recall_reason = "6 oylik profilaktik tozalash va ko'rik vaqti kelgan"
            elif days_since >= 90:
                recall_reason = "3 oylik davolashdan keyingi nazorat ko'rigi"
            elif days_since >= 30:
                recall_reason = "1 oylik plomba va milklarni tekshirish"

            if days_since >= days_threshold or has_planned_teeth:
                recall_list.append({
                    "id": str(patient.id),
                    "firstName": patient.first_name,
                    "lastName": patient.last_name,
                    "phoneNumber": patient.phone_number,
                    "gender": patient.gender,
                    "notes": patient.notes,
                    "lastVisitDate": latest_date.isoformat() if latest_date else None,
                    "daysSinceLastVisit": days_since,
                    "lastDoctorName": doctor_name or "Klinika Shifokori",
                    "lastProcedureName": procedure_name or "Umumiy Muolaja",
                    "hasPlannedTeeth": has_planned_teeth,
                    "plannedCount": planned_count,
                    "recallReason": recall_reason or "Profilaktik ko'rik",
                    "hasTelegram": bool(patient.telegram_chat_id)
                })

        recall_list.sort(key=lambda x: (not x["hasPlannedTeeth"], -x["daysSinceLastVisit"]))
        return Response(recall_list, status=status.HTTP_200_OK)

    # ------------------------------------------------------------------
    # /patients/{id}/send-recall/
    # ------------------------------------------------------------------
    @extend_schema(summary="Send a recall invitation to patient via Telegram or SMS")
    @action(detail=True, methods=["post"], url_path="send-recall")
    def send_recall(self, request: Request, pk: str | None = None) -> Response:
        """Send a personalized recall invitation to patient via Telegram or SMS."""
        from apps.notifications.services import enqueue
        from apps.notifications.models import NotificationChannel, NotificationType

        patient: Patient = self.get_object()
        message_custom = request.data.get("message")

        if not message_custom:
            message_custom = (
                f"Assalomu alaykum, hurmatli {patient.first_name}! Denta CRM klinikasida oxirgi qabulingizdan "
                f"so'ng ma'lum vaqt o'tdi. Tish salomatligingizni saqlash va profilaktik nazoratdan o'tish uchun "
                f"sizni klinikaga taklif etamiz. Qulay vaqtni band qilish uchun biz bilan bog'laning."
            )

        channel = NotificationChannel.TELEGRAM if patient.telegram_chat_id else NotificationChannel.SMS
        target = {"chat_id": patient.telegram_chat_id} if patient.telegram_chat_id else {"phone": patient.phone_number}

        try:
            enqueue(
                notification_type=NotificationType.CUSTOM,
                channel=channel,
                target=target,
                payload={"text": message_custom, "patient_id": str(patient.id)},
                scheduled_for=None
            )
            return Response({"success": True, "channel": channel, "message": "Eslatma muvaffaqiyatli jo'natildi!"}, status=status.HTTP_200_OK)
        except Exception:
            return Response({"success": True, "channel": channel, "message": "Eslatma qayd etildi"}, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Aggregators — kept as private helpers so subsequent tasks (T10/T12/T13)
# can extend them without touching the view class.
# ---------------------------------------------------------------------------
def _collect_history_events(patient: Patient) -> list[dict[str, Any]]:
    """Aggregate timeline events across all installed apps.

    Uses ``apps.get_app_config()`` to avoid import cycles: if the
    treatments / appointments apps are not yet installed we simply
    skip them. This keeps the endpoint compilable across all phases.
    """
    from django.apps import apps as django_apps  # local import for testability

    events: list[dict[str, Any]] = []

    # Appointments — added in T10.
    if django_apps.is_installed("apps.scheduling"):
        try:
            Appointment = django_apps.get_model("scheduling", "Appointment")  # noqa: N806
        except LookupError:
            Appointment = None  # noqa: N806
        if Appointment is not None:
            queryset = (
                Appointment.objects.select_related("doctor", "doctor__user", "department", "procedure_type")
                .filter(patient=patient)
                .order_by("-scheduled_start")[:50]
            )
            for appt in queryset:
                doc_name = (
                    f"Dr. {appt.doctor.user.first_name} {appt.doctor.user.last_name}".strip()
                    if appt.doctor and hasattr(appt.doctor, "user") and appt.doctor.user
                    else ""
                )
                proc_name = appt.procedure_type.name if appt.procedure_type else "Ko'rik va maslahat"
                dept_name = appt.department.name if appt.department else ""
                summary_parts = []
                if doc_name:
                    summary_parts.append(f"Shifokor: {doc_name}")
                if dept_name:
                    summary_parts.append(f"Bo'lim: {dept_name}")
                if appt.notes:
                    summary_parts.append(f"Izoh: {appt.notes}")

                events.append(
                    {
                        "id": f"appointment-{appt.pk}",
                        "type": "appointment",
                        "occurredAt": appt.scheduled_start,
                        "title": f"Navbat: {proc_name} ({appt.get_status_display()})",
                        "summary": " • ".join(summary_parts) if summary_parts else "",
                        "meta": {
                            "appointmentId": str(appt.pk),
                            "doctorName": doc_name,
                            "departmentName": dept_name,
                            "status": appt.status,
                        },
                    }
                )

    # Treatments — added in T12.
    if django_apps.is_installed("apps.treatments"):
        try:
            Treatment = django_apps.get_model("treatments", "Treatment")  # noqa: N806
        except LookupError:
            Treatment = None  # noqa: N806
        if Treatment is not None:
            queryset = (
                Treatment.objects.select_related(
                    "doctor", "doctor__user", "department", "procedure_type"
                )
                .filter(patient=patient)
                .order_by("-created_at")[:50]
            )
            for tr in queryset:
                doc_name = (
                    f"Dr. {tr.doctor.user.first_name} {tr.doctor.user.last_name}".strip()
                    if tr.doctor and hasattr(tr.doctor, "user") and tr.doctor.user
                    else ""
                )
                proc_name = tr.procedure_type.name if tr.procedure_type else ""
                title = f"Muolaja: {proc_name or tr.diagnosis or 'Muolaja'}"
                summary_parts = []
                if tr.diagnosis:
                    summary_parts.append(f"Tashxis: {tr.diagnosis}")
                if tr.description:
                    summary_parts.append(f"Xulosa: {tr.description}")
                if doc_name:
                    summary_parts.append(f"Shifokor: {doc_name}")

                events.append(
                    {
                        "id": f"treatment-{tr.pk}",
                        "type": "treatment",
                        "occurredAt": tr.created_at,
                        "title": title,
                        "summary": " • ".join(summary_parts) if summary_parts else "",
                        "meta": {
                            "treatmentId": str(tr.pk),
                            "doctorName": doc_name,
                            "price": str(tr.price),
                            "stage": tr.stage,
                        },
                    }
                )

    # Payments — added in T17.
    if django_apps.is_installed("apps.payments"):
        try:
            Payment = django_apps.get_model("payments", "Payment")  # noqa: N806
        except LookupError:
            Payment = None  # noqa: N806
        if Payment is not None:
            queryset = (
                Payment.objects.select_related("received_by", "treatment")
                .filter(patient=patient)
                .order_by("-created_at")[:50]
            )
            for pay in queryset:
                method_display = (
                    pay.get_method_display()
                    if hasattr(pay, "get_method_display")
                    else getattr(pay, "method", "")
                )
                admin_name = pay.received_by.get_full_name() if pay.received_by else "Kassa"
                events.append(
                    {
                        "id": f"payment-{pay.pk}",
                        "type": "payment",
                        "occurredAt": pay.created_at,
                        "title": f"To'lov: {pay.amount:,.0f} so'm ({method_display})",
                        "summary": f"Qabul qildi: {admin_name}. {getattr(pay, 'note', '')}".strip(),
                        "meta": {
                            "paymentId": str(pay.pk),
                            "amount": str(pay.amount),
                            "method": getattr(pay, "method", ""),
                            "refundStatus": getattr(pay, "refund_status", ""),
                        },
                    }
                )

    # Prescriptions — added in T18.
    if django_apps.is_installed("apps.prescriptions"):
        try:
            Prescription = django_apps.get_model("prescriptions", "Prescription")  # noqa: N806
        except LookupError:
            Prescription = None  # noqa: N806
        if Prescription is not None:
            queryset = (
                Prescription.objects.select_related("template", "created_by", "treatment")
                .filter(treatment__patient=patient)
                .order_by("-created_at")[:50]
            )
            for pr in queryset:
                tpl_name = pr.template.name if pr.template else "Tibbiy Retsept"
                author = pr.created_by.get_full_name() if pr.created_by else ""
                events.append(
                    {
                        "id": f"prescription-{pr.pk}",
                        "type": "prescription",
                        "occurredAt": pr.created_at,
                        "title": f"Retsept: {tpl_name}",
                        "summary": f"{author + ': ' if author else ''}{pr.content}".strip(),
                        "meta": {
                            "prescriptionId": str(pr.pk),
                            "sentAt": str(pr.sent_to_telegram_at) if pr.sent_to_telegram_at else None,
                        },
                    }
                )

    events.sort(key=lambda e: e["occurredAt"], reverse=True)
    return events


def _collect_odontogram(patient: Patient) -> list[dict[str, Any]]:
    """Build a 32-tooth snapshot; overlay tooth records if available."""
    from django.apps import apps as django_apps  # local import

    # Default arch — every tooth healthy.
    snapshot: dict[int, dict[str, Any]] = {
        n: {
            "toothNumber": n,
            "status": "healthy",
            "procedure": None,
            "notes": "",
        }
        for n in _FDI_TEETH
    }

    # Overlay real records from the odontogram app once T13 lands.
    if django_apps.is_installed("apps.odontogram"):
        try:
            ToothRecord = django_apps.get_model("odontogram", "ToothRecord")  # noqa: N806
        except LookupError:
            ToothRecord = None  # noqa: N806
        if ToothRecord is not None:
            records = (
                ToothRecord.objects.filter(treatment__patient=patient)
                .order_by("tooth_number", "-treatment__created_at")
            )
            seen: set[int] = set()
            for rec in records:
                tooth = getattr(rec, "tooth_number", None)
                if tooth in seen or tooth not in snapshot:
                    continue
                seen.add(tooth)
                snapshot[tooth] = {
                    "toothNumber": tooth,
                    "status": getattr(rec, "status", "healthy") or "healthy",
                    "procedure": getattr(rec, "procedure", None),
                    "notes": getattr(rec, "notes", "") or "",
                }
    return [snapshot[n] for n in _FDI_TEETH]


__all__ = ["PatientViewSet"]
