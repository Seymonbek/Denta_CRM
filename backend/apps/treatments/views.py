"""HTTP orchestration for the ``treatments`` app.

Endpoints (PROJECT_BRIEF § "Treatments"):

* ``GET  /api/v1/treatments/``           — paginated list
    (filters: ``?patient=&doctor=&department=&payment_status=&stage=``).
* ``POST /api/v1/treatments/``           — create (bosh_shifokor / doctor).
* ``GET  /api/v1/treatments/{id}/``      — retrieve.
* ``PATCH /api/v1/treatments/{id}/``     — partial update.
* ``PUT  /api/v1/treatments/{id}/``      — full update.
* ``DELETE /api/v1/treatments/{id}/``    — soft-delete.
* ``POST /api/v1/treatments/{id}/photos/`` — upload photo (multipart).
* ``GET  /api/v1/treatments/{id}/photos/`` — list photos.
"""
from __future__ import annotations

from typing import Any

from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response

from apps.core.permissions import ROLE_DOCTOR

from .models import Treatment
from .permissions import TreatmentPermission
from .selectors import (
    active_treatments,
    all_treatments,
    filter_treatments,
    photos_for_treatment,
)
from .serializers import (
    TreatmentPhotoSerializer,
    TreatmentPhotoUploadSerializer,
    TreatmentSerializer,
)
from .services import soft_delete_treatment


@extend_schema(tags=["treatments"])
class TreatmentViewSet(viewsets.ModelViewSet):
    """CRUD for :class:`Treatment` under ``/api/v1/treatments/``."""

    serializer_class = TreatmentSerializer
    permission_classes = [TreatmentPermission]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["payment_status", "stage", "department"]
    ordering_fields = ["created_at", "price"]
    ordering = ["-created_at"]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    lookup_field = "pk"

    # ------------------------------------------------------------------
    # Queryset (respects role scoping)
    # ------------------------------------------------------------------
    def get_queryset(self):
        request: Request | None = getattr(self, "request", None)
        if request is None:
            return active_treatments()

        params = request.query_params
        include_inactive = str(
            params.get("include_inactive", "")
        ).lower() in {"1", "true", "yes"}
        role = getattr(request.user, "role", None)

        qs = filter_treatments(
            patient_id=params.get("patient"),
            doctor_id=params.get("doctor"),
            department_id=params.get("department"),
            payment_status=params.get("payment_status"),
            stage=params.get("stage"),
            include_inactive=(include_inactive and role == "bosh_shifokor"),
        )

        # Doctor scope: only own rows unless can_view_other_doctors.
        if role == ROLE_DOCTOR:
            profile = getattr(request.user, "doctor_profile", None)
            if not getattr(profile, "can_view_other_doctors", False):
                if profile is not None:
                    qs = qs.filter(doctor=profile)
                else:
                    qs = qs.none()

        return qs

    # ------------------------------------------------------------------
    # Schema tweaks
    # ------------------------------------------------------------------
    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="patient",
                required=False,
                type=str,
                location=OpenApiParameter.QUERY,
                description="Filter by patient UUID.",
            ),
            OpenApiParameter(
                name="doctor",
                required=False,
                type=str,
                location=OpenApiParameter.QUERY,
                description="Filter by doctor UUID.",
            ),
            OpenApiParameter(
                name="department",
                required=False,
                type=str,
                location=OpenApiParameter.QUERY,
                description="Filter by department UUID.",
            ),
            OpenApiParameter(
                name="payment_status",
                required=False,
                type=str,
                location=OpenApiParameter.QUERY,
                description="unpaid | partial | paid",
            ),
            OpenApiParameter(
                name="stage",
                required=False,
                type=str,
                location=OpenApiParameter.QUERY,
                description="in_progress | completed",
            ),
        ]
    )
    def list(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        return super().list(request, *args, **kwargs)

    # ------------------------------------------------------------------
    # Soft-delete
    # ------------------------------------------------------------------
    def destroy(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        treatment: Treatment = self.get_object()
        soft_delete_treatment(treatment)
        return Response(status=status.HTTP_204_NO_CONTENT)

    # ------------------------------------------------------------------
    # /treatments/{id}/photos/  (GET list, POST upload)
    # ------------------------------------------------------------------
    @extend_schema(
        summary="Photos for a treatment",
        responses={200: TreatmentPhotoSerializer(many=True)},
    )
    @action(
        detail=True,
        methods=["get", "post"],
        url_path="photos",
        parser_classes=[MultiPartParser, FormParser, JSONParser],
    )
    def photos(self, request: Request, pk: str | None = None) -> Response:
        treatment: Treatment = self.get_object()
        if request.method.lower() == "get":
            photos_qs = photos_for_treatment(treatment.pk)
            data = TreatmentPhotoSerializer(
                photos_qs, many=True, context={"request": request}
            ).data
            return Response(data, status=status.HTTP_200_OK)

        # POST — upload
        # Re-check write permission for this specific object.
        if not TreatmentPermission().has_object_permission(request, self, treatment):
            return Response(
                {
                    "error": {
                        "code": "PERMISSION_DENIED",
                        "message": (
                            "Sizda bu davolashga rasm biriktirish uchun ruxsat yo'q."
                        ),
                        "details": {},
                    }
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = TreatmentPhotoUploadSerializer(
            data=request.data,
            context={"request": request, "treatment": treatment},
        )
        serializer.is_valid(raise_exception=True)
        photo = serializer.save()
        out = TreatmentPhotoSerializer(photo, context={"request": request}).data
        return Response(out, status=status.HTTP_201_CREATED)

    # ------------------------------------------------------------------
    # /treatments/{id}/tooth-records/  (delegates to odontogram app — T13)
    # ------------------------------------------------------------------
    @extend_schema(
        summary="Tooth records for a treatment (odontogram)",
        responses={200: dict, 501: dict},
    )
    @action(detail=True, methods=["get", "post"], url_path="tooth-records")
    def tooth_records(self, request: Request, pk: str | None = None) -> Response:
        """List or create tooth records via the odontogram app."""
        treatment: Treatment = self.get_object()

        # Try to import the odontogram serializer/service. Absence is a
        # hard error now (T13 is in-tree), but we keep the safety net so
        # older test runs continue to fail loudly and clearly.
        try:
            from apps.odontogram.selectors import records_for_treatment
            from apps.odontogram.serializers import ToothRecordSerializer
            from apps.odontogram.services import create_tooth_record
        except ImportError:
            return Response(
                {
                    "error": {
                        "code": "NOT_IMPLEMENTED",
                        "message": "Odontogram moduli hali o'rnatilmagan (T13).",
                        "details": {},
                    }
                },
                status=status.HTTP_501_NOT_IMPLEMENTED,
            )

        if request.method.lower() == "get":
            qs = records_for_treatment(treatment.pk)
            return Response(
                ToothRecordSerializer(qs, many=True).data,
                status=status.HTTP_200_OK,
            )

        # POST — write path uses the treatments permission (already
        # applied by DRF) which mirrors the odontogram permission.
        payload = request.data if isinstance(request.data, dict) else {}
        try:
            rec = create_tooth_record(
                treatment=treatment,
                tooth_number=payload.get("toothNumber", payload.get("tooth_number")),
                procedure=payload.get("procedure"),
                status_value=payload.get("status"),
                notes=payload.get("notes", "") or "",
            )
        except Exception as exc:  # noqa: BLE001 - surface as validation error
            return Response(
                {
                    "error": {
                        "code": "VALIDATION_ERROR",
                        "message": str(exc),
                        "details": {},
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            ToothRecordSerializer(rec).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(
        summary="Clone patient's last active odontogram state into this treatment",
        responses={200: dict, 400: dict},
    )
    @action(detail=True, methods=["post"], url_path="clone-odontogram")
    def clone_odontogram(self, request: Request, pk: str | None = None) -> Response:
        treatment: Treatment = self.get_object()

        # Check permissions
        if not TreatmentPermission().has_object_permission(request, self, treatment):
            return Response(
                {
                    "error": {
                        "code": "PERMISSION_DENIED",
                        "message": "Sizda bu davolashni o'zgartirish uchun ruxsat yo'q.",
                        "details": {},
                    }
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            from apps.odontogram.serializers import ToothRecordSerializer
            from apps.odontogram.services import clone_last_odontogram_state

            cloned_records = clone_last_odontogram_state(treatment)
            return Response(
                ToothRecordSerializer(cloned_records, many=True).data,
                status=status.HTTP_200_OK,
            )
        except Exception as exc:  # noqa: BLE001
            return Response(
                {
                    "error": {
                        "code": "VALIDATION_ERROR",
                        "message": str(exc),
                        "details": {},
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )


__all__ = ["TreatmentViewSet"]

# Silence "unused" lint on the import kept for typing / test compatibility.
_ = all_treatments
