from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import AuditLogViewSet

app_name = "core"

router = DefaultRouter()
router.register(r"audit-logs", AuditLogViewSet, basename="audit-log")

urlpatterns = [
    path("", include(router.urls)),
]

