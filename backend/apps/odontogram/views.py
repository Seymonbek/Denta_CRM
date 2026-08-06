"""HTTP endpoints for the ``odontogram`` app.

Two endpoints are exposed:

* ``GET/POST /api/v1/treatments/{treatment_id}/tooth-records/`` — the
  primary way to add/inspect tooth records on a treatment. The
  treatments app has a placeholder ``@action`` (see
  :mod:`apps.treatments.views`) that imports from this module. The
  action itself is served here through the same URL because the
  treatments viewset already dispatches to it.

* ``PATCH/DELETE /api/v1/tooth-records/{id}/`` — used by the frontend
  when the user edits a single tooth record inline on the odontogram
  grid without opening the parent treatment.

* ``GET /api/v1/patients/{patient_id}/odontogram/`` — merged odontogram
  snapshot (latest record per tooth). Registered on the patients app
  via a URL include (see ``apps/patients/urls.py``).
"""
from __future__ import annotations

from typing import Any

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status, viewsets
from rest_framework.generics import RetrieveAPIView
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import ROLE_DOCTOR
from apps.treatments.models import Treatment

from .models import ToothRecord
from .permissions import ToothRecordPermission
from .selectors import (
    latest_records_by_tooth,
    records_for_treatment,
)
from .serializers import ToothRecordSerializer
from .services import soft_delete_tooth_record


@extend_schema(tags=["treatments"])
class ToothRecordViewSet(viewsets.ModelViewSet):
    """Standalone CRUD for :class:`ToothRecord` at ``/tooth-records/{id}/``."""

    serializer_class = ToothRecordSerializer
    permission_classes = [ToothRecordPermission]
    lookup_field = "pk"

    def get_queryset(self):
        request: Request | None = getattr(self, "request", None)
        qs = ToothRecord.objects.select_related(
            "treatment",
            "treatment__doctor",
            "treatment__doctor__user",
        ).all()

        if request is None:
            return qs

        role = getattr(request.user, "role", None)
        if role == ROLE_DOCTOR:
            profile = getattr(request.user, "doctor_profile", None)
            if not getattr(profile, "can_view_other_doctors", False):
                if profile is not None:
                    qs = qs.filter(treatment__doctor=profile)
                else:
                    qs = qs.none()
        return qs.filter(is_active=True)

    def destroy(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        record: ToothRecord = self.get_object()
        soft_delete_tooth_record(record)
        return Response(status=status.HTTP_204_NO_CONTENT)


class TreatmentToothRecordsView(APIView):
    """List/create tooth records for a given treatment.

    URL: ``/api/v1/treatments/{treatment_id}/tooth-records/``
    """

    permission_classes = [ToothRecordPermission]

    def _get_treatment(self, treatment_id: str) -> Treatment:
        return get_object_or_404(
            Treatment.objects.select_related("doctor", "doctor__user"),
            pk=treatment_id,
        )

    def _check_object_perm(self, request: Request, treatment: Treatment) -> bool:
        return ToothRecordPermission().has_object_permission(request, self, treatment)

    @extend_schema(
        summary="List tooth records for a treatment",
        responses={200: ToothRecordSerializer(many=True)},
    )
    def get(
        self, request: Request, treatment_id: str, *args: Any, **kwargs: Any
    ) -> Response:
        treatment = self._get_treatment(treatment_id)
        if not self._check_object_perm(request, treatment):
            return Response(
                {
                    "error": {
                        "code": "PERMISSION_DENIED",
                        "message": (
                            "Sizda bu davolash tish yozuvlarini ko'rishga "
                            "ruxsat yo'q."
                        ),
                        "details": {},
                    }
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        qs = records_for_treatment(treatment.pk)
        data = ToothRecordSerializer(qs, many=True).data
        return Response(data, status=status.HTTP_200_OK)

    @extend_schema(
        summary="Create a tooth record on a treatment",
        request=ToothRecordSerializer,
        responses={201: ToothRecordSerializer},
    )
    def post(
        self, request: Request, treatment_id: str, *args: Any, **kwargs: Any
    ) -> Response:
        treatment = self._get_treatment(treatment_id)
        if not self._check_object_perm(request, treatment):
            return Response(
                {
                    "error": {
                        "code": "PERMISSION_DENIED",
                        "message": (
                            "Sizda bu davolashga tish yozuvi qo'shishga ruxsat yo'q."
                        ),
                        "details": {},
                    }
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = ToothRecordSerializer(
            data=request.data, context={"treatment": treatment, "request": request}
        )
        serializer.is_valid(raise_exception=True)
        record = serializer.save()
        return Response(
            ToothRecordSerializer(record).data,
            status=status.HTTP_201_CREATED,
        )


class PatientOdontogramView(APIView):
    """Merged odontogram snapshot for a patient.

    URL: ``/api/v1/patients/{patient_id}/odontogram/``
    """

    permission_classes = [ToothRecordPermission]

    @extend_schema(
        summary="Patient odontogram (latest tooth records)",
        parameters=[
            OpenApiParameter(
                name="patient_id",
                required=True,
                type=str,
                location=OpenApiParameter.PATH,
                description="Patient UUID.",
            ),
        ],
        responses={200: dict},
    )
    def get(
        self, request: Request, patient_id: str, *args: Any, **kwargs: Any
    ) -> Response:
        # ToothRecordPermission.has_permission already checks role. We
        # deliberately don't call has_object_permission here because the
        # odontogram is scoped to a patient, not a single treatment. All
        # authenticated staff may read a patient's odontogram (doctors
        # still see it — they authored the entries).
        latest = latest_records_by_tooth(patient_id)
        payload = []
        for tooth_number, record in sorted(latest.items()):
            payload.append(
                {
                    "toothNumber": tooth_number,
                    "procedure": record.procedure,
                    "status": record.status,
                    "notes": record.notes or "",
                    "treatmentId": str(record.treatment_id),
                    "updatedAt": record.updated_at.isoformat()
                    if record.updated_at
                    else None,
                }
            )
        return Response(payload, status=status.HTTP_200_OK)


__all__ = [
    "ToothRecordViewSet",
    "TreatmentToothRecordsView",
    "PatientOdontogramView",
]

# Keep import to satisfy lint (RetrieveAPIView reserved for future use).
_ = RetrieveAPIView
