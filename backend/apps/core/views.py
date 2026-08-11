from rest_framework import viewsets, mixins, permissions
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters
from drf_spectacular.utils import extend_schema

from .models import AuditLog
from .serializers import AuditLogSerializer

class IsBoshShifokor(permissions.BasePermission):
    def has_permission(self, request, view):
        return getattr(request.user, "role", None) == "bosh_shifokor"

@extend_schema(tags=["audit"])
class AuditLogViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Read-only viewset for Global Audit Logs (bosh shifokor only)."""
    queryset = AuditLog.objects.select_related("user").all()
    serializer_class = AuditLogSerializer
    permission_classes = [permissions.IsAuthenticated, IsBoshShifokor]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter, filters.SearchFilter]
    filterset_fields = ["action", "model_name"]
    search_fields = ["user__first_name", "user__last_name", "model_name", "object_id"]
    ordering_fields = ["timestamp"]
    ordering = ["-timestamp"]

