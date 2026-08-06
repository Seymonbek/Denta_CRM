"""HTTP orchestration for the ``notifications`` app.

Endpoints (mounted at ``/api/v1/notifications/``):

* ``GET /``       — list the caller's inbox; supports
                    ``?status=&type=&channel=&unread_only=true``.
* ``GET /{id}/``  — retrieve a single notification.

Writes are intentionally not exposed — the write-path is
:mod:`apps.notifications.services` called from within the app.
"""
from __future__ import annotations

from typing import Any

from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import filters, mixins, viewsets
from rest_framework.request import Request
from rest_framework.response import Response

from .models import NotificationStatus
from .permissions import NotificationPermission
from .selectors import visible_to
from .serializers import NotificationLogSerializer


@extend_schema(tags=["notifications"])
class NotificationViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """Read-only inbox for the current user."""

    serializer_class = NotificationLogSerializer
    permission_classes = [NotificationPermission]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["status", "type", "channel"]
    ordering_fields = ["created_at", "sent_at"]
    ordering = ["-created_at"]
    lookup_field = "pk"

    def get_queryset(self):
        request: Request | None = getattr(self, "request", None)
        user = getattr(request, "user", None) if request else None
        qs = visible_to(user)

        if request is None:
            return qs

        unread_only = str(request.query_params.get("unread_only", "")).lower() in {
            "1",
            "true",
            "yes",
        }
        if unread_only:
            qs = qs.filter(status=NotificationStatus.PENDING)
        return qs

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="status",
                required=False,
                type=str,
                location=OpenApiParameter.QUERY,
                description="pending | sent | failed",
            ),
            OpenApiParameter(
                name="type",
                required=False,
                type=str,
                location=OpenApiParameter.QUERY,
                description="Canonical event type (e.g. inventory.low_stock).",
            ),
            OpenApiParameter(
                name="unread_only",
                required=False,
                type=bool,
                location=OpenApiParameter.QUERY,
                description="Return only ``pending`` rows.",
            ),
        ],
    )
    def list(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        return super().list(request, *args, **kwargs)


__all__ = ["NotificationViewSet"]
