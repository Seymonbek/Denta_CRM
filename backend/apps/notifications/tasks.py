"""Celery tasks for the ``notifications`` app.

Responsibilities:

* :func:`send_notification` — delivery worker. Loads a
  :class:`NotificationLog` row, dispatches it through the appropriate
  channel (``telegram`` when a bot token is configured, otherwise the
  mock sender), and transitions the row through the state machine
  (``pending`` → ``sent`` / ``failed``).

The transport layer is deliberately loose: when ``TELEGRAM_BOT_TOKEN``
is empty the task logs the payload and marks the row ``sent`` so local
dev + tests never hit the network.
"""
from __future__ import annotations

import logging

from celery import shared_task
from django.conf import settings

from . import services
from .models import NotificationChannel, NotificationLog

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Transport dispatcher
# ---------------------------------------------------------------------------
def _telegram_target(log: NotificationLog) -> int | None:
    """Return the Telegram chat id for the notification target, if any."""
    if log.user_id and getattr(log.user, "telegram_chat_id", None):
        return log.user.telegram_chat_id
    if log.patient_id and getattr(log.patient, "telegram_chat_id", None):
        return log.patient.telegram_chat_id
    return None


def _send_via_telegram(log: NotificationLog) -> str:
    """Deliver via the Telegram bot. Returns an external message id.

    When ``TELEGRAM_BOT_TOKEN`` is empty (dev / tests) the helper logs
    the payload and returns ``"mock"`` so the state machine still
    advances. Real aiogram delivery lives in ``apps.telegram_bot``.
    """
    chat_id = _telegram_target(log)
    if chat_id is None:
        raise RuntimeError(
            "Notification has no telegram_chat_id target (user/patient)."
        )

    token = getattr(settings, "TELEGRAM_BOT_TOKEN", "") or ""
    if not token:
        logger.info(
            "notifications: [MOCK-TELEGRAM] chat_id=%s type=%s message=%s",
            chat_id,
            log.type,
            log.message,
        )
        return "mock"

    # Lazy import so the celery task remains cheap when the bot app is
    # not installed (unit tests that only exercise the notifications app).
    try:
        from apps.telegram_bot.bot import send_message_sync
    except Exception as exc:  # noqa: BLE001
        logger.exception("notifications: telegram_bot import failed: %s", exc)
        raise

    message_id = send_message_sync(chat_id=chat_id, text=log.message)
    return str(message_id) if message_id else ""


# ---------------------------------------------------------------------------
# Public task
# ---------------------------------------------------------------------------
@shared_task(
    name="apps.notifications.tasks.send_notification",
    bind=True,
    max_retries=0,
)
def send_notification(self, log_id: str) -> str:  # noqa: ARG001 - bind
    """Deliver a single :class:`NotificationLog` row.

    The task is idempotent — already-sent rows short-circuit, and
    failed rows transition to ``failed`` (no infinite retries once
    marked failed via ``mark_failed``).
    """
    try:
        log = NotificationLog.objects.select_related("user", "patient").get(
            pk=log_id
        )
    except NotificationLog.DoesNotExist:
        logger.warning("notifications: log %s not found — skipping.", log_id)
        return "missing"

    if log.status == "sent":
        return "already_sent"
    if log.status == "failed":
        return "already_failed"

    try:
        if log.channel == NotificationChannel.TELEGRAM:
            external_id = _send_via_telegram(log)
        else:
            logger.info(
                "notifications: channel=%s not implemented, marking sent (mock).",
                log.channel,
            )
            external_id = "mock"
        services.mark_sent(log, external_message_id=external_id)
        return "sent"
    except Exception as exc:  # noqa: BLE001
        # Persist the failure and re-raise so celery records it too.
        services.mark_failed(log, error_detail=str(exc))
        raise


__all__ = ["send_notification"]
