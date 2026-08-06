"""HTTP orchestration for the ``inventory`` app.

Views are thin: they wire DRF viewsets to selectors, services,
serializers, and permission classes. All business logic lives in
:mod:`apps.inventory.services`.
"""
from __future__ import annotations

from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import F
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.request import Request
from rest_framework.response import Response

from apps.core.permissions import ROLE_BOSH_SHIFOKOR

from .models import Material, MaterialUsage
from .permissions import MaterialPermission, MaterialUsagePermission
from .selectors import (
    active_materials,
    all_materials,
    material_logs,
    usages_for_treatment,
)
from .serializers import (
    AdjustStockSerializer,
    MaterialSerializer,
    MaterialStockLogSerializer,
    MaterialUsageSerializer,
    RestockSerializer,
)
from .services import soft_delete_material


# ---------------------------------------------------------------------------
# MaterialViewSet
# ---------------------------------------------------------------------------
@extend_schema(tags=["inventory"])
class MaterialViewSet(viewsets.ModelViewSet):
    """CRUD for :class:`Material` under ``/api/v1/materials/``.

    * ``GET  /``               → paginated list; ``?below_threshold=true``,
                                 ``?search=``, ``?include_inactive=true``.
    * ``POST /``               → create (bosh_shifokor only).
    * ``GET  /{id}/``          → retrieve.
    * ``PATCH /{id}/``         → partial update.
    * ``DELETE /{id}/``        → soft-delete.
    * ``PATCH /{id}/restock/`` → top up quantity.
    * ``PATCH /{id}/adjust/``  → signed manual adjustment.
    * ``GET  /{id}/logs/``     → paginated audit log.
    """

    serializer_class = MaterialSerializer
    permission_classes = [MaterialPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["unit", "is_active"]
    search_fields = ["name", "notes"]
    ordering_fields = ["name", "quantity_in_stock", "created_at"]
    ordering = ["name"]
    lookup_field = "pk"

    # ------------------------------------------------------------------
    # QuerySet
    # ------------------------------------------------------------------
    def get_queryset(self):
        request: Request | None = getattr(self, "request", None)
        if request is None:
            return active_materials()

        include_inactive = str(
            request.query_params.get("include_inactive", "")
        ).lower() in {"1", "true", "yes"}
        role = getattr(request.user, "role", None)
        base = (
            all_materials()
            if include_inactive and role == ROLE_BOSH_SHIFOKOR
            else active_materials()
        )

        below = str(request.query_params.get("below_threshold", "")).lower() in {
            "1",
            "true",
            "yes",
        }
        if below:
            base = base.filter(quantity_in_stock__lte=F("minimum_threshold"))
        return base

    # ------------------------------------------------------------------
    # Schema tweaks
    # ------------------------------------------------------------------
    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="below_threshold",
                required=False,
                type=bool,
                location=OpenApiParameter.QUERY,
                description="Faqat minimum chegara ostidagi materiallar.",
            ),
            OpenApiParameter(
                name="include_inactive",
                required=False,
                type=bool,
                location=OpenApiParameter.QUERY,
                description="Arxivlangan materiallarni ham qaytarish (faqat bosh shifokor).",
            ),
            OpenApiParameter(
                name="search",
                required=False,
                type=str,
                location=OpenApiParameter.QUERY,
                description="Nom yoki izohga qarab qidirish.",
            ),
        ],
    )
    def list(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        return super().list(request, *args, **kwargs)

    def destroy(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        material: Material = self.get_object()
        soft_delete_material(material)
        return Response(status=status.HTTP_204_NO_CONTENT)

    # ------------------------------------------------------------------
    # Custom actions
    # ------------------------------------------------------------------
    @extend_schema(request=RestockSerializer, responses=MaterialSerializer)
    @action(
        detail=True,
        methods=["patch", "post"],
        url_path="restock",
        url_name="restock",
    )
    def restock(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        """Top up the material's stock. bosh_shifokor only."""
        material: Material = self.get_object()
        # Only bosh_shifokor may write; MaterialPermission already
        # blocks non-safe methods for others, but keep an explicit guard
        # for readability.
        if request.user.role != ROLE_BOSH_SHIFOKOR:
            raise DRFValidationError(
                {"detail": "Faqat bosh shifokor materialni to'ldirishga ruxsatga ega."}
            )

        serializer = RestockSerializer(
            data=request.data,
            context={"material": material, "request": request},
        )
        serializer.is_valid(raise_exception=True)
        try:
            serializer.save()
        except DjangoValidationError as exc:
            raise DRFValidationError(
                exc.message_dict if hasattr(exc, "message_dict") else list(exc.messages)
            ) from exc
        material.refresh_from_db()
        return Response(MaterialSerializer(material).data, status=status.HTTP_200_OK)

    @extend_schema(request=AdjustStockSerializer, responses=MaterialSerializer)
    @action(
        detail=True,
        methods=["patch", "post"],
        url_path="adjust",
        url_name="adjust",
    )
    def adjust(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        material: Material = self.get_object()
        if request.user.role != ROLE_BOSH_SHIFOKOR:
            raise DRFValidationError(
                {"detail": "Faqat bosh shifokor zaxira tuzatishlarini kiritishi mumkin."}
            )
        serializer = AdjustStockSerializer(
            data=request.data,
            context={"material": material, "request": request},
        )
        serializer.is_valid(raise_exception=True)
        try:
            serializer.save()
        except DjangoValidationError as exc:
            raise DRFValidationError(
                exc.message_dict if hasattr(exc, "message_dict") else list(exc.messages)
            ) from exc
        material.refresh_from_db()
        return Response(MaterialSerializer(material).data, status=status.HTTP_200_OK)

    @extend_schema(responses=MaterialStockLogSerializer(many=True))
    @action(
        detail=True,
        methods=["get"],
        url_path="logs",
        url_name="logs",
    )
    def logs(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        material: Material = self.get_object()
        qs = material_logs(material.pk)
        page = self.paginate_queryset(qs)
        serializer = MaterialStockLogSerializer(page or qs, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)


# ---------------------------------------------------------------------------
# MaterialUsageViewSet — nested resource, exposed as list+create only.
# ---------------------------------------------------------------------------
@extend_schema(tags=["inventory"])
class MaterialUsageViewSet(viewsets.ModelViewSet):
    """List + create :class:`MaterialUsage` rows.

    Doctors post to this endpoint while filling in a treatment. The
    ``?treatment=`` query filter allows the frontend to fetch the usages
    already recorded for a specific treatment.
    """

    serializer_class = MaterialUsageSerializer
    permission_classes = [MaterialUsagePermission]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["treatment", "material"]
    ordering_fields = ["created_at"]
    ordering = ["-created_at"]
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        qs = MaterialUsage.objects.select_related("material", "treatment")
        request = getattr(self, "request", None)
        treatment_id = request.query_params.get("treatment") if request else None
        if treatment_id:
            qs = usages_for_treatment(treatment_id)
        return qs.order_by("-created_at")


__all__ = ["MaterialViewSet", "MaterialUsageViewSet"]
