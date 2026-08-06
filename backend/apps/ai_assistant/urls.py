"""URL configuration for the ``ai_assistant`` app."""
from __future__ import annotations

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import AIChatView, AIInventorySummaryView, AIPermissionConfigViewSet

app_name = "ai_assistant"

router = DefaultRouter()
router.register("permissions", AIPermissionConfigViewSet, basename="ai-permissions")

urlpatterns = [
    path("chat/", AIChatView.as_view(), name="chat"),
    path(
        "inventory-summary/",
        AIInventorySummaryView.as_view(),
        name="inventory-summary",
    ),
    path("", include(router.urls)),
]
