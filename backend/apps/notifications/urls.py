"""URL routes for the ``notifications`` app.

Mounted at ``/api/v1/notifications/`` in :mod:`config.urls`.
"""
from __future__ import annotations

from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import NotificationViewSet, SendTelegramReminderView

app_name = "notifications"

router = DefaultRouter()
router.register(r"", NotificationViewSet, basename="notification")

urlpatterns = [
    path("send-reminder/", SendTelegramReminderView.as_view(), name="send-reminder"),
] + router.urls
