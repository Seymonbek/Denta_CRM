"""HTTP orchestration for the ``doctors`` app.

Endpoints (PROJECT_BRIEF § API):

* ``GET/POST /api/v1/doctors/``                          — list / create
* ``GET/PATCH/DELETE /api/v1/doctors/{id}/``             — retrieve / update / soft-delete
* ``GET/POST /api/v1/doctors/{id}/working-hours/``       — nested collection
* ``DELETE /api/v1/doctors/{id}/working-hours/{wid}/``   — delete one
* ``GET/POST /api/v1/doctors/{id}/time-off/``            — nested collection
* ``DELETE /api/v1/doctors/{id}/time-off/{tid}/``        — delete one
* ``GET /api/v1/doctors/{id}/available-slots/?date=...`` — computed slots
* ``GET/POST /api/v1/procedure-types/``                  — list / create
* ``GET/PATCH/DELETE /api/v1/procedure-types/{id}/``     — retrieve / update / soft-delete
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any

from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.request import Request
from rest_framework.response import Response

from apps.core.permissions import ROLE_BOSH_SHIFOKOR, ROLE_DOCTOR

from .models import DoctorProfile, ProcedureType, TimeOff, WorkingHours
from .permissions import (
    DoctorProfilePermission,
    ProcedureTypePermission,
    TimeOffPermission,
    WorkingHoursPermission,
)
from .selectors import (
    active_doctors,
    active_procedure_types,
    all_doctors,
    time_off_for,
    working_hours_for,
)
from .serializers import (
    AvailableSlotsResponseSerializer,
    DoctorProfileSerializer,
    ProcedureTypeSerializer,
    TimeOffSerializer,
    WorkingHoursSerializer,
)
from .services import (
    compute_available_slots,
    delete_time_off,
    delete_working_hours,
    soft_delete_procedure_type,
    update_doctor_profile,
)


# ---------------------------------------------------------------------------
# /api/v1/doctors/
# ---------------------------------------------------------------------------
@extend_schema(tags=["doctors"])
class DoctorProfileViewSet(viewsets.ModelViewSet):
    """CRUD for :class:`DoctorProfile` plus nested schedule endpoints."""

    serializer_class = DoctorProfileSerializer
    permission_classes = [DoctorProfilePermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["is_active"]
    search_fields = [
        "user__first_name",
        "user__last_name",
        "user__phone_number",
        "specialization",
    ]
    ordering_fields = ["user__last_name", "user__first_name", "created_at"]
    ordering = ["user__last_name", "user__first_name"]
    lookup_field = "pk"

    def get_queryset(self):
        request: Request | None = getattr(self, "request", None)
        include_inactive = False
        role = None
        if request is not None:
            role = getattr(request.user, "role", None)
            include_inactive = str(
                request.query_params.get("include_inactive", "")
            ).lower() in {"1", "true", "yes"}
        base = all_doctors() if include_inactive and role == ROLE_BOSH_SHIFOKOR else active_doctors()

        if request is not None:
            department = request.query_params.get("department")
            if department:
                base = base.filter(departments__id=department).distinct()
        return base

    # ------------------------------------------------------------------
    # Soft delete
    # ------------------------------------------------------------------
    def destroy(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        profile: DoctorProfile = self.get_object()
        update_doctor_profile(profile, is_active=False)
        return Response(status=status.HTTP_204_NO_CONTENT)

    # ------------------------------------------------------------------
    # Nested — /working-hours/
    # ------------------------------------------------------------------
    @extend_schema(
        methods=["GET"],
        summary="List working hours for a doctor",
        responses={200: WorkingHoursSerializer(many=True)},
    )
    @extend_schema(
        methods=["POST"],
        summary="Add a working-hours entry",
        request=WorkingHoursSerializer,
        responses={201: WorkingHoursSerializer},
    )
    @action(
        detail=True,
        methods=["get", "post"],
        url_path="working-hours",
        permission_classes=[WorkingHoursPermission],
    )
    def working_hours(self, request: Request, pk: str | None = None) -> Response:
        doctor = self.get_object()
        if request.method.lower() == "get":
            qs = working_hours_for(doctor)
            data = WorkingHoursSerializer(qs, many=True).data
            return Response(data, status=status.HTTP_200_OK)

        # POST — enforce object-level rule (doctor edits own only).
        self._assert_can_write_schedule(request, doctor)
        serializer = WorkingHoursSerializer(
            data=request.data, context={"doctor": doctor, "request": request}
        )
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        return Response(
            WorkingHoursSerializer(instance).data, status=status.HTTP_201_CREATED
        )

    @extend_schema(
        methods=["DELETE"],
        summary="Delete a working-hours entry",
        responses={204: None},
    )
    @action(
        detail=True,
        methods=["delete"],
        url_path=r"working-hours/(?P<entry_id>[^/.]+)",
        permission_classes=[WorkingHoursPermission],
    )
    def working_hours_delete(
        self, request: Request, pk: str | None = None, entry_id: str | None = None
    ) -> Response:
        doctor = self.get_object()
        self._assert_can_write_schedule(request, doctor)
        try:
            entry = WorkingHours.objects.get(pk=entry_id, doctor=doctor)
        except WorkingHours.DoesNotExist as exc:
            raise NotFound("Ish soati topilmadi.") from exc
        delete_working_hours(entry)
        return Response(status=status.HTTP_204_NO_CONTENT)

    # ------------------------------------------------------------------
    # Nested — /time-off/
    # ------------------------------------------------------------------
    @extend_schema(
        methods=["GET"],
        summary="List time-off entries for a doctor",
        responses={200: TimeOffSerializer(many=True)},
    )
    @extend_schema(
        methods=["POST"],
        summary="Create a time-off entry",
        request=TimeOffSerializer,
        responses={201: TimeOffSerializer},
    )
    @action(
        detail=True,
        methods=["get", "post"],
        url_path="time-off",
        permission_classes=[TimeOffPermission],
    )
    def time_off(self, request: Request, pk: str | None = None) -> Response:
        doctor = self.get_object()
        if request.method.lower() == "get":
            data = TimeOffSerializer(time_off_for(doctor), many=True).data
            return Response(data, status=status.HTTP_200_OK)
        self._assert_can_write_schedule(request, doctor)
        serializer = TimeOffSerializer(
            data=request.data, context={"doctor": doctor, "request": request}
        )
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        return Response(
            TimeOffSerializer(instance).data, status=status.HTTP_201_CREATED
        )

    @extend_schema(
        methods=["DELETE"],
        summary="Delete a time-off entry",
        responses={204: None},
    )
    @action(
        detail=True,
        methods=["delete"],
        url_path=r"time-off/(?P<entry_id>[^/.]+)",
        permission_classes=[TimeOffPermission],
    )
    def time_off_delete(
        self, request: Request, pk: str | None = None, entry_id: str | None = None
    ) -> Response:
        doctor = self.get_object()
        self._assert_can_write_schedule(request, doctor)
        try:
            entry = TimeOff.objects.get(pk=entry_id, doctor=doctor)
        except TimeOff.DoesNotExist as exc:
            raise NotFound("Dam olish yozuvi topilmadi.") from exc
        delete_time_off(entry)
        return Response(status=status.HTTP_204_NO_CONTENT)

    # ------------------------------------------------------------------
    # /available-slots/?date=YYYY-MM-DD
    # ------------------------------------------------------------------
    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="date",
                required=True,
                type=str,
                location=OpenApiParameter.QUERY,
                description="ISO date (YYYY-MM-DD).",
            ),
            OpenApiParameter(
                name="slot_minutes",
                required=False,
                type=int,
                location=OpenApiParameter.QUERY,
                description="Slot length in minutes (default 30).",
            ),
        ],
        responses={200: AvailableSlotsResponseSerializer},
    )
    @action(detail=True, methods=["get"], url_path="available-slots")
    def available_slots(self, request: Request, pk: str | None = None) -> Response:
        from rest_framework.exceptions import ValidationError as DRFValidationError

        doctor = self.get_object()
        raw_date = request.query_params.get("date")
        if not raw_date:
            raise DRFValidationError({"date": ["Sana majburiy — ?date=YYYY-MM-DD."]})
        try:
            day: date = datetime.strptime(raw_date, "%Y-%m-%d").date()
        except ValueError as exc:
            raise DRFValidationError({"date": ["YYYY-MM-DD formatida yuboring."]}) from exc
        try:
            slot_minutes = int(request.query_params.get("slot_minutes") or 30)
        except (TypeError, ValueError):
            slot_minutes = 30

        booked_ranges = self._get_booked_ranges(doctor, day)
        slots = compute_available_slots(
            doctor, day=day, slot_minutes=slot_minutes, booked_ranges=booked_ranges
        )
        return Response(
            {"doctorId": str(doctor.id), "date": day.isoformat(), "slots": slots},
            status=status.HTTP_200_OK,
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _assert_can_write_schedule(request: Request, doctor: DoctorProfile) -> None:
        role = getattr(request.user, "role", None)
        if role == ROLE_BOSH_SHIFOKOR:
            return
        if role == ROLE_DOCTOR and getattr(doctor, "user_id", None) == getattr(
            request.user, "id", None
        ):
            return
        from rest_framework.exceptions import PermissionDenied

        raise PermissionDenied(
            "Boshqa shifokor jadvalini o'zgartirishga ruxsatingiz yo'q."
        )

    @staticmethod
    def _get_booked_ranges(doctor: DoctorProfile, day: date):
        """Return booked appointment ranges for the given day.

        Loaded lazily so this app has no hard import dependency on
        :mod:`apps.scheduling` (which comes online in T10). When the
        scheduling app is present we honour its data; until then we
        return an empty list.
        """
        try:
            from apps.scheduling.models import Appointment  # type: ignore
        except Exception:  # pragma: no cover - scheduling not installed yet
            return []

        from django.utils import timezone

        tz = timezone.get_current_timezone()
        start = datetime.combine(day, datetime.min.time()).replace(tzinfo=tz)
        end = datetime.combine(day, datetime.max.time()).replace(tzinfo=tz)
        blocking_statuses = (
            "scheduled",
            "confirmed",
            "in_progress",
        )
        rows = Appointment.objects.filter(
            doctor=doctor,
            scheduled_start__lt=end,
            scheduled_end__gt=start,
            status__in=blocking_statuses,
            is_active=True,
        ).values_list("scheduled_start", "scheduled_end")
        # Convert every row into a *local-naive* datetime so the slot
        # generator (which uses ``datetime.combine(day, shift.start_time)``
        # — naive by construction) can compare apples to apples. Django
        # stores datetimes as UTC when USE_TZ=True; without this step
        # every appointment appears at UTC offset in the overlap check.
        local_ranges: list[tuple[datetime, datetime]] = []
        for s, e in rows:
            if s is None or e is None:
                continue
            if timezone.is_aware(s):
                s = timezone.localtime(s, tz).replace(tzinfo=None)
            if timezone.is_aware(e):
                e = timezone.localtime(e, tz).replace(tzinfo=None)
            local_ranges.append((s, e))
        return local_ranges


# ---------------------------------------------------------------------------
# /api/v1/procedure-types/
# ---------------------------------------------------------------------------
@extend_schema(tags=["doctors"])
class ProcedureTypeViewSet(viewsets.ModelViewSet):
    """CRUD for :class:`ProcedureType`."""

    serializer_class = ProcedureTypeSerializer
    permission_classes = [ProcedureTypePermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["is_active"]
    search_fields = ["name", "department__name"]
    ordering_fields = ["name", "default_price", "created_at"]
    ordering = ["department__name", "name"]
    lookup_field = "pk"

    def get_queryset(self):
        qs = active_procedure_types()
        request = getattr(self, "request", None)
        if request is not None:
            department = request.query_params.get("department")
            if department:
                qs = qs.filter(department_id=department)
        return qs

    def destroy(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        procedure: ProcedureType = self.get_object()
        soft_delete_procedure_type(procedure)
        return Response(status=status.HTTP_204_NO_CONTENT)


__all__ = ["DoctorProfileViewSet", "ProcedureTypeViewSet"]
