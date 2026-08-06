"""HTTP orchestration for the ``prescriptions`` app.

Endpoints:

* ``/api/v1/prescription-templates/``      — CRUD on PrescriptionTemplate.
* ``/api/v1/prescriptions/``               — read-only listing / detail
    (filters: ``?treatment=&patient=&doctor=&is_sent=``).
* ``/api/v1/treatments/{id}/prescription/`` — action wired via the
    treatments viewset (see ``apps/treatments/views.py``). This module
    exposes the ``IssuePrescriptionActionView`` used by that route
    alias.
"""
from __future__ import annotations

from typing import Any

from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import filters, status, viewsets
from rest_framework.generics import get_object_or_404
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import ROLE_DOCTOR
from apps.treatments.models import Treatment
from apps.treatments.permissions import TreatmentPermission

from .models import Prescription, PrescriptionTemplate
from .permissions import PrescriptionPermission, PrescriptionTemplatePermission
from .selectors import (
    active_templates,
    filter_prescriptions,
)
from .serializers import (
    IssuePrescriptionSerializer,
    PrescriptionSerializer,
    PrescriptionTemplateSerializer,
)
from .services import soft_delete_prescription, soft_delete_template


# ---------------------------------------------------------------------------
# PrescriptionTemplateViewSet
# ---------------------------------------------------------------------------
@extend_schema(tags=["prescriptions"])
class PrescriptionTemplateViewSet(viewsets.ModelViewSet):
    """CRUD for :class:`PrescriptionTemplate`."""

    serializer_class = PrescriptionTemplateSerializer
    permission_classes = [PrescriptionTemplatePermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "content"]
    ordering_fields = ["name", "created_at"]
    ordering = ["name"]
    lookup_field = "pk"

    def get_queryset(self):
        request: Request | None = getattr(self, "request", None)
        if request is None:
            return active_templates()
        params = request.query_params
        include_inactive = str(params.get("include_inactive", "")).lower() in {
            "1",
            "true",
            "yes",
        }
        role = getattr(request.user, "role", None)
        if include_inactive and role == "bosh_shifokor":
            from .selectors import all_templates

            return all_templates()
        return active_templates()

    def destroy(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        template: PrescriptionTemplate = self.get_object()
        soft_delete_template(template)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# PrescriptionViewSet (read-only + soft delete)
# ---------------------------------------------------------------------------
@extend_schema(tags=["prescriptions"])
class PrescriptionViewSet(viewsets.ModelViewSet):
    """List / retrieve / soft-delete for :class:`Prescription`.

    Retseptlar are created via the dedicated action on
    ``/treatments/{id}/prescription/`` (see
    :class:`IssuePrescriptionActionView`) — this viewset intentionally
    does **not** expose a naked ``POST /prescriptions/`` because every
    retsept must be tied to a treatment.
    """

    serializer_class = PrescriptionSerializer
    permission_classes = [PrescriptionPermission]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    ordering_fields = ["created_at", "sent_to_telegram_at"]
    ordering = ["-created_at"]
    http_method_names = ["get", "delete", "head", "options"]

    def get_queryset(self):
        request: Request | None = getattr(self, "request", None)
        if request is None:
            return filter_prescriptions()
        params = request.query_params
        is_sent_raw = params.get("is_sent")
        is_sent: bool | None
        if is_sent_raw is None or is_sent_raw == "":
            is_sent = None
        else:
            is_sent = str(is_sent_raw).lower() in {"1", "true", "yes"}

        role = getattr(request.user, "role", None)
        include_inactive = str(
            params.get("include_inactive", "")
        ).lower() in {"1", "true", "yes"}

        qs = filter_prescriptions(
            treatment_id=params.get("treatment"),
            patient_id=params.get("patient"),
            doctor_id=params.get("doctor"),
            is_sent=is_sent,
            include_inactive=(include_inactive and role == "bosh_shifokor"),
        )

        if role == ROLE_DOCTOR:
            profile = getattr(request.user, "doctor_profile", None)
            if not getattr(profile, "can_view_other_doctors", False):
                if profile is not None:
                    qs = qs.filter(treatment__doctor=profile)
                else:
                    qs = qs.none()

        return qs

    @extend_schema(
        parameters=[
            OpenApiParameter(name="treatment", required=False, type=str),
            OpenApiParameter(name="patient", required=False, type=str),
            OpenApiParameter(name="doctor", required=False, type=str),
            OpenApiParameter(
                name="is_sent",
                required=False,
                type=bool,
                description="true → only sent; false → only pending; omitted → all",
            ),
        ]
    )
    def list(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        return super().list(request, *args, **kwargs)

    def destroy(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        prescription: Prescription = self.get_object()
        soft_delete_prescription(prescription)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# POST /treatments/{id}/prescription/ — issue a retsept
# ---------------------------------------------------------------------------
class IssuePrescriptionActionView(APIView):
    """Issue a retsept for a specific treatment.

    Sits under ``/api/v1/treatments/{id}/prescription/`` so the URL
    path matches PROJECT_BRIEF § "Prescriptions".
    """

    permission_classes = [TreatmentPermission]

    @extend_schema(
        tags=["prescriptions"],
        request=IssuePrescriptionSerializer,
        responses={201: PrescriptionSerializer},
        summary="Retsept yaratish va (ixtiyoriy) Telegram orqali yuborish.",
    )
    def post(self, request: Request, treatment_id: str) -> Response:
        treatment = get_object_or_404(
            Treatment.objects.select_related(
                "patient", "doctor", "doctor__user"
            ),
            pk=treatment_id,
        )
        self.check_object_permissions(request, treatment)

        serializer = IssuePrescriptionSerializer(
            data=request.data,
            context={"request": request, "treatment": treatment},
        )
        serializer.is_valid(raise_exception=True)
        prescription = serializer.save()
        out = PrescriptionSerializer(prescription, context={"request": request}).data
        return Response(out, status=status.HTTP_201_CREATED)


__all__ = [
    "PrescriptionTemplateViewSet",
    "PrescriptionViewSet",
    "IssuePrescriptionActionView",
]
