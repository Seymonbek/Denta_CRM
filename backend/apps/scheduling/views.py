"""HTTP orchestration for the ``scheduling`` app.

Endpoints (PROJECT_BRIEF § "Scheduling"):

* ``GET  /api/v1/appointments/``            — paginated list, filters:
  ``?doctor=&patient=&status=&date_from=&date_to=``.
* ``POST /api/v1/appointments/``            — create.
* ``GET  /api/v1/appointments/{id}/``       — retrieve.
* ``PATCH /api/v1/appointments/{id}/``      — update (reschedule / status).
* ``DELETE /api/v1/appointments/{id}/``     — soft-delete
  (equivalent to ``status=cancelled`` + hidden from active listings).
* ``POST /api/v1/appointments/{id}/cancel/`` — explicit cancel action.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any

from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.request import Request
from rest_framework.response import Response

from apps.core.permissions import (
    ROLE_ADMINISTRATOR,
    ROLE_BOSH_SHIFOKOR,
    ROLE_DOCTOR,
)

from .models import Appointment, AppointmentStatus
from .permissions import AppointmentPermission
from .selectors import active_appointments, appointments_in_range
from .serializers import AppointmentCancelSerializer, AppointmentSerializer


def _parse_date(raw: str, *, field: str) -> date:
    try:
        return datetime.strptime(raw, "%Y-%m-%d").date()
    except ValueError as exc:
        raise DRFValidationError(
            {field: ["YYYY-MM-DD formatida yuboring."]}
        ) from exc


@extend_schema(tags=["scheduling"])
class AppointmentViewSet(viewsets.ModelViewSet):
    """CRUD for :class:`Appointment` + cancel action."""

    serializer_class = AppointmentSerializer
    permission_classes = [AppointmentPermission]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter, filters.SearchFilter]
    search_fields = [
        "patient__first_name",
        "patient__last_name",
        "patient__phone_number",
        "doctor__user__first_name",
        "doctor__user__last_name",
    ]
    ordering_fields = ["scheduled_start", "created_at"]
    ordering = ["-created_at"]
    lookup_field = "pk"

    def get_queryset(self):
        request: Request | None = getattr(self, "request", None)
        qs = active_appointments()
        if request is None:
            return qs

        role = getattr(request.user, "role", None)
        # Doctors see only their own appointments unless the flag is set.
        if role == ROLE_DOCTOR:
            profile = getattr(request.user, "doctor_profile", None)
            if profile is not None and not profile.can_view_other_doctors:
                qs = qs.filter(doctor=profile)

        params = request.query_params

        doctor = params.get("doctor")
        if doctor:
            qs = qs.filter(doctor_id=doctor)

        patient = params.get("patient")
        if patient:
            qs = qs.filter(patient_id=patient)

        department = params.get("department")
        if department:
            qs = qs.filter(department_id=department)

        status_param = params.getlist("status") if hasattr(
            params, "getlist"
        ) else None
        # Also accept comma-separated: ?status=scheduled,confirmed
        if status_param and len(status_param) == 1 and "," in status_param[0]:
            status_param = [s.strip() for s in status_param[0].split(",") if s.strip()]
        if status_param:
            qs = qs.filter(status__in=status_param)

        date_param = params.get("date")
        date_from = params.get("date_from")
        date_to = params.get("date_to")
        if date_param and not date_from and not date_to:
            date_from = date_param
            date_to = date_param

        if date_from or date_to:
            from_d = _parse_date(date_from, field="date_from") if date_from else None
            to_d = _parse_date(date_to, field="date_to") if date_to else None
            qs = appointments_in_range(
                date_from=from_d, date_to=to_d
            ).filter(pk__in=qs.values("pk"))

        return qs

    # ------------------------------------------------------------------
    # Schema tweaks
    # ------------------------------------------------------------------
    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="doctor", required=False, type=str,
                location=OpenApiParameter.QUERY,
                description="Filter by doctor UUID.",
            ),
            OpenApiParameter(
                name="patient", required=False, type=str,
                location=OpenApiParameter.QUERY,
                description="Filter by patient UUID.",
            ),
            OpenApiParameter(
                name="status", required=False, type=str,
                location=OpenApiParameter.QUERY,
                description=(
                    "Filter by status (comma-separated multi-select "
                    "supported, e.g. scheduled,confirmed)."
                ),
            ),
            OpenApiParameter(
                name="date_from", required=False, type=str,
                location=OpenApiParameter.QUERY,
                description="Inclusive lower bound (YYYY-MM-DD).",
            ),
            OpenApiParameter(
                name="date_to", required=False, type=str,
                location=OpenApiParameter.QUERY,
                description="Inclusive upper bound (YYYY-MM-DD).",
            ),
        ],
    )
    def list(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        return super().list(request, *args, **kwargs)

    # ------------------------------------------------------------------
    # Soft-delete instead of hard delete — mark cancelled.
    # ------------------------------------------------------------------
    def destroy(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        appointment: Appointment = self.get_object()
        serializer = AppointmentCancelSerializer(
            data={}, context={"appointment": appointment}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        # Also hide from active listings so lists stay clean.
        if appointment.is_active:
            appointment.is_active = False
            appointment.save(update_fields=["is_active", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    # ------------------------------------------------------------------
    # /appointments/{id}/cancel/
    # ------------------------------------------------------------------
    @extend_schema(
        summary="Cancel an appointment (transition to 'cancelled').",
        request=AppointmentCancelSerializer,
        responses={200: AppointmentSerializer},
    )
    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request: Request, pk: str | None = None) -> Response:
        appointment: Appointment = self.get_object()
        # Only bosh_shifokor / administrator (or the doctor themselves)
        # may cancel.
        role = getattr(request.user, "role", None)
        if role not in (ROLE_BOSH_SHIFOKOR, ROLE_ADMINISTRATOR, ROLE_DOCTOR):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Ruxsat yo'q.")
        if role == ROLE_DOCTOR:
            owner_user_id = getattr(appointment.doctor, "user_id", None)
            if owner_user_id != getattr(request.user, "id", None):
                from rest_framework.exceptions import PermissionDenied

                raise PermissionDenied("Faqat o'z navbatingizni bekor qila olasiz.")

        serializer = AppointmentCancelSerializer(
            data=request.data, context={"appointment": appointment}
        )
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        return Response(
            AppointmentSerializer(instance).data,
            status=status.HTTP_200_OK,
        )

    # ------------------------------------------------------------------
    # /appointments/cleanup-overdue/
    # ------------------------------------------------------------------
    @extend_schema(
        summary="Clean up overdue past-day appointments (in_progress -> completed, scheduled -> no_show).",
        responses={200: dict},
    )
    @action(detail=False, methods=["post"], url_path="cleanup-overdue")
    def cleanup_overdue(self, request: Request) -> Response:
        role = getattr(request.user, "role", None)
        if role not in (ROLE_BOSH_SHIFOKOR, ROLE_ADMINISTRATOR):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied(
                "Faqat bosh shifokor yoki administrator eskirgan navbatlarni tartibga solishi mumkin."
            )

        from .services import settle_overdue_appointments

        result = settle_overdue_appointments(hours_buffer=4)
        total = result["total_settled"]
        return Response(
            {
                "status": "success",
                "completedCount": result["completed_count"],
                "noShowCount": result["no_show_count"],
                "totalSettled": total,
                "message": f"{total} ta muddati o'tgan navbat muvaffaqiyatli tartibga keltirildi.",
            },
            status=status.HTTP_200_OK,
        )

    # ------------------------------------------------------------------
    # /appointments/calendar/
    # ------------------------------------------------------------------
    @extend_schema(
        summary="List appointments for calendar range without pagination.",
        parameters=[
            OpenApiParameter(name="date_from", required=False, type=str, location=OpenApiParameter.QUERY),
            OpenApiParameter(name="date_to", required=False, type=str, location=OpenApiParameter.QUERY),
            OpenApiParameter(name="date", required=False, type=str, location=OpenApiParameter.QUERY),
            OpenApiParameter(name="doctor", required=False, type=str, location=OpenApiParameter.QUERY),
            OpenApiParameter(name="department", required=False, type=str, location=OpenApiParameter.QUERY),
            OpenApiParameter(name="status", required=False, type=str, location=OpenApiParameter.QUERY),
        ],
        responses={200: AppointmentSerializer(many=True)},
    )
    @action(detail=False, methods=["get"], url_path="calendar")
    def calendar(self, request: Request) -> Response:
        qs = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    # ------------------------------------------------------------------
    # /appointments/check-conflict/
    # ------------------------------------------------------------------
    @extend_schema(
        summary="Check if a slot has overlap conflict for doctor or patient.",
        parameters=[
            OpenApiParameter(name="doctor", required=True, type=str, location=OpenApiParameter.QUERY),
            OpenApiParameter(name="start", required=True, type=str, location=OpenApiParameter.QUERY),
            OpenApiParameter(name="end", required=True, type=str, location=OpenApiParameter.QUERY),
            OpenApiParameter(name="patient", required=False, type=str, location=OpenApiParameter.QUERY),
            OpenApiParameter(name="exclude_id", required=False, type=str, location=OpenApiParameter.QUERY),
        ],
        responses={200: dict},
    )
    @action(detail=False, methods=["get"], url_path="check-conflict")
    def check_conflict(self, request: Request) -> Response:
        from apps.doctors.models import DoctorProfile, TimeOff
        from .selectors import has_overlap
        from .services import _clean_datetime

        params = request.query_params
        doctor_id = params.get("doctor")
        start_str = params.get("start")
        end_str = params.get("end")
        patient_id = params.get("patient")
        exclude_id = params.get("exclude_id")

        if not doctor_id or not start_str or not end_str:
            return Response(
                {"hasConflict": False, "reason": "Parametrlar to'liq emas."},
                status=status.HTTP_200_OK,
            )

        if isinstance(start_str, str) and " " in start_str and "+" not in start_str:
            start_str = start_str.replace(" ", "+")
        if isinstance(end_str, str) and " " in end_str and "+" not in end_str:
            end_str = end_str.replace(" ", "+")

        try:
            doctor = DoctorProfile.objects.select_related("user").get(pk=doctor_id)
            start_dt = _clean_datetime(start_str, field="start")
            end_dt = _clean_datetime(end_str, field="end")
        except Exception as err:
            return Response(
                {"hasConflict": True, "conflictType": "invalid_params", "message": str(err)},
                status=status.HTTP_200_OK,
            )

        # 1. Check TimeOff
        is_off = TimeOff.objects.filter(
            user=doctor.user,
            date_start__lte=end_dt.date(),
            date_end__gte=start_dt.date(),
        ).exists()
        if is_off:
            return Response(
                {
                    "hasConflict": True,
                    "conflictType": "time_off",
                    "message": "Shifokor ushbu kunda ta'tilda / dam olishda.",
                },
                status=status.HTTP_200_OK,
            )

        # 2. Check Doctor Overlap
        doc_overlap = has_overlap(
            doctor=doctor,
            scheduled_start=start_dt,
            scheduled_end=end_dt,
            exclude_id=exclude_id,
        )
        if doc_overlap:
            return Response(
                {
                    "hasConflict": True,
                    "conflictType": "doctor_overlap",
                    "message": "Shifokorda ushbu vaqt oralig'ida boshqa navbat mavjud.",
                },
                status=status.HTTP_200_OK,
            )

        # 3. Check Patient Double Booking
        if patient_id:
            from .models import BLOCKING_STATUSES
            p_qs = Appointment.objects.filter(
                patient_id=patient_id,
                status__in=BLOCKING_STATUSES,
                scheduled_start__lt=end_dt,
                scheduled_end__gt=start_dt,
            )
            if exclude_id:
                p_qs = p_qs.exclude(pk=exclude_id)
            if p_qs.exists():
                return Response(
                    {
                        "hasConflict": True,
                        "conflictType": "patient_overlap",
                        "message": "Bemorda shu vaqt oralig'ida boshqa navbat mavjud.",
                    },
                    status=status.HTTP_200_OK,
                )

        return Response(
            {"hasConflict": False, "message": "Vaqt bo'sh va band qilish mumkin."},
            status=status.HTTP_200_OK,
        )


__all__ = ["AppointmentViewSet", "AppointmentStatus"]

