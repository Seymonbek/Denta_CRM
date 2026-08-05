"""URL routes for the ``notifications`` app.

Mounted at ``/api/v1/notifications/`` in :mod:`config.urls`.
"""
from __future__ import annotations

from rest_framework.routers import DefaultRouter

from .views import NotificationViewSet

app_name = "notifications"

router = DefaultRouter()
router.register(r"", NotificationViewSet, basename="notification")

urlpatterns = router.urls
