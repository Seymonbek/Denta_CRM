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


from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework import status


class SendTelegramReminderView(APIView):
    """POST /api/v1/notifications/send-reminder/ — triggers Telegram reminder."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        appointment_id = request.data.get("appointmentId") or request.data.get("appointment_id")
        message_custom = request.data.get("message")

        from apps.scheduling.models import Appointment
        from apps.notifications.services import create_notification
        from apps.notifications.models import NotificationType, NotificationChannel

        if appointment_id:
            try:
                appt = Appointment.objects.get(pk=appointment_id, is_active=True)
                patient_name = getattr(appt.patient, "full_name", str(appt.patient)) if appt.patient else "Bemor"
                doc_name = appt.doctor.user.get_full_name() if appt.doctor else "Shifokor"
                date_str = appt.scheduled_start.strftime("%Y-%m-%d %H:%M") if appt.scheduled_start else ""

                msg = message_custom or (
                    f"🦷 <b>DentaCRM Eslatma</b>\n\n"
                    f"Hurmatli <b>{patient_name}</b>!\n"
                    f"Sizning <b>{date_str}</b> da <b>Dr. {doc_name}</b> qabuliga navbatingiz bor.\n\n"
                    f"Klinikamiz sizni kutmoqda! ✨"
                )

                log = create_notification(
                    type=NotificationType.SCHEDULING_REMINDER_2H,
                    recipient=request.user,
                    message=msg,
                    channel=NotificationChannel.TELEGRAM,
                )
                return Response(
                    {"success": True, "message": "Telegram eslatma muvaffaqiyatli yuborildi!", "logId": str(log.pk)},
                    status=status.HTTP_200_OK,
                )
            except Appointment.DoesNotExist:
                return Response({"error": "Qabul topilmadi."}, status=status.HTTP_404_NOT_FOUND)

        return Response({"error": "appointmentId kiritilmadi."}, status=status.HTTP_400_BAD_REQUEST)


__all__ = ["NotificationViewSet", "SendTelegramReminderView"]
