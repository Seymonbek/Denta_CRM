"""AppConfig for the ``notifications`` app."""
from __future__ import annotations

import logging

from django.apps import AppConfig
from django.dispatch import receiver

logger = logging.getLogger(__name__)


class NotificationsConfig(AppConfig):
    """Bildirishnomalar — NotificationLog + enqueue service."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.notifications"
    label = "notifications"
    verbose_name = "Bildirishnomalar"

    def ready(self) -> None:  # pragma: no cover - import side-effect
        # Load signal module so the ``notification_enqueued`` signal is
        # registered with Django's dispatcher.
        from . import signals  # noqa: F401

        # Wire the signal to the delivery Celery task.
        from .signals import notification_enqueued

        @receiver(
            notification_enqueued,
            dispatch_uid="notifications.enqueue_to_send_task",
        )
        def _dispatch_send(sender, instance, **kwargs):  # noqa: ARG001
            """Enqueue the send_notification task for each new row."""
            try:
                from .tasks import send_notification

                send_notification.delay(str(instance.pk))
            except Exception:  # noqa: BLE001 — do not block writers
                logger.exception(
                    "notifications: failed to enqueue send_notification for %s",
                    instance.pk,
                )
