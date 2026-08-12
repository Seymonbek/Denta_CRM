from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import AuditLogViewSet, ClinicSettingsView

app_name = "core"

router = DefaultRouter()
router.register(r"audit-logs", AuditLogViewSet, basename="audit-log")

urlpatterns = [
    path("settings/", ClinicSettingsView.as_view(), name="clinic-settings"),
    path("", include(router.urls)),
]

