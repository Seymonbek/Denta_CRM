"""HTTP orchestration for the ``departments`` app.

Views are intentionally thin: they wire DRF viewsets to selectors,
services, serializers, and the permission class. All actual business
logic lives in :mod:`apps.departments.services`.
"""
from __future__ import annotations

from typing import Any

from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import filters, status, viewsets
from rest_framework.request import Request
from rest_framework.response import Response

from .models import Department
from .permissions import DepartmentPermission
from .selectors import active_departments, all_departments
from .serializers import DepartmentSerializer
from .services import soft_delete_department


@extend_schema(tags=["departments"])
class DepartmentViewSet(viewsets.ModelViewSet):
    """CRUD for :class:`Department` under ``/api/v1/departments/``.

    * ``GET  /``            → paginated list (active only by default;
                              ``?include_inactive=true`` for bosh_shifokor).
    * ``POST /``            → create (bosh_shifokor only).
    * ``GET  /{id}/``       → retrieve.
    * ``PATCH /{id}/``      → partial update (bosh_shifokor only).
    * ``PUT   /{id}/``      → full update (bosh_shifokor only).
    * ``DELETE /{id}/``     → soft-delete (bosh_shifokor only).
    """

    serializer_class = DepartmentSerializer
    permission_classes = [DepartmentPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["is_active"]
    search_fields = ["name", "description"]
    ordering_fields = ["name", "created_at"]
    ordering = ["name"]
    lookup_field = "pk"

    def get_queryset(self):
        request: Request | None = getattr(self, "request", None)
        if request is None:
            return active_departments()

        include_inactive = str(
            request.query_params.get("include_inactive", "")
        ).lower() in {"1", "true", "yes"}

        role = getattr(request.user, "role", None)
        # Only bosh_shifokor may see inactive rows; others always get
        # the active-only queryset.
        if include_inactive and role == "bosh_shifokor":
            return all_departments()
        return active_departments()

    # ------------------------------------------------------------------
    # Schema tweaks
    # ------------------------------------------------------------------
    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="include_inactive",
                required=False,
                type=bool,
                location=OpenApiParameter.QUERY,
                description="Include soft-deleted departments (bosh_shifokor only).",
            ),
            OpenApiParameter(
                name="search",
                required=False,
                type=str,
                location=OpenApiParameter.QUERY,
                description="Case-insensitive search on name/description.",
            ),
        ],
    )
    def list(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        return super().list(request, *args, **kwargs)

    # ------------------------------------------------------------------
    # Soft-delete instead of hard delete
    # ------------------------------------------------------------------
    def destroy(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        department: Department = self.get_object()
        soft_delete_department(department)
        return Response(status=status.HTTP_204_NO_CONTENT)


__all__ = ["DepartmentViewSet"]
