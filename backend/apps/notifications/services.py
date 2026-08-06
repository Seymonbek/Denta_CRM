"""Write-side services for the ``notifications`` app.

Every mutation goes through a service so the write-side rules — signal
dispatch, state-machine transitions, timestamp bookkeeping — live in
one place.

Public API
----------
:func:`enqueue`      — create a ``pending`` row and dispatch the
                       ``notification_enqueued`` signal.
:func:`mark_sent`    — flip ``pending`` → ``sent`` (idempotent).
:func:`mark_failed`  — flip ``pending`` → ``failed`` with error detail.
:func:`bulk_enqueue` — helper for iterables of ``target`` dicts.
"""
from __future__ import annotations

import logging
from collections.abc import Iterable
from typing import Any

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from .models import (
    NotificationChannel,
    NotificationLog,
    NotificationStatus,
    NotificationType,
)
from .signals import notification_enqueued

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
_VALID_TYPES = frozenset(dict(NotificationType.choices).keys())
_VALID_CHANNELS = frozenset(dict(NotificationChannel.choices).keys())


def _validate_type(notification_type: str) -> str:
    if notification_type is None or notification_type == "":
        raise ValidationError({"type": ["Type is required."]})
    if notification_type not in _VALID_TYPES:
        # Allow the well-known enum; unknown values are still stored but
        # logged so the frontend can surface an "unknown type" fallback.
        logger.warning(
            "notifications: unknown notification type %r — storing anyway.",
            notification_type,
        )
    return notification_type


def _validate_channel(channel: str) -> str:
    if channel not in _VALID_CHANNELS:
        raise ValidationError({"channel": [f"Kanal '{channel}' qo'llab-quvvatlanmaydi."]})
    return channel


def _clean_message(message: str) -> str:
    if message is None or not str(message).strip():
        raise ValidationError({"message": ["Xabar bo'sh bo'lolmaydi."]})
    return str(message).strip()


# ---------------------------------------------------------------------------
# enqueue
# ---------------------------------------------------------------------------
@transaction.atomic
def enqueue(
    *,
    notification_type: str,
    message: str,
    user: Any = None,
    patient: Any = None,
    channel: str = NotificationChannel.TELEGRAM,
    context: dict[str, Any] | None = None,
) -> NotificationLog:
    """Create a ``pending`` :class:`NotificationLog` row.

    Exactly one of ``user`` or ``patient`` (or both) must be supplied —
    a notification with no target is meaningless and the DB rejects it.

    Returns the freshly-created row; also dispatches the
    ``notification_enqueued`` signal so downstream delivery workers
    (telegram_bot, in-app WS, ...) can pick it up.
    """
    if user is None and patient is None:
        raise ValidationError(
            {"non_field_errors": ["Kamida bitta manzil (user yoki patient) berilishi shart."]}
        )

    log = NotificationLog.objects.create(
        user=user,
        patient=patient,
        type=_validate_type(notification_type),
        channel=_validate_channel(channel),
        message=_clean_message(message),
        status=NotificationStatus.PENDING,
        context=dict(context or {}),
    )

    # Best-effort — never block the caller because a receiver crashed.
    try:
        notification_enqueued.send(
            sender=NotificationLog,
            instance=log,
            context=log.context,
        )
    except Exception:  # noqa: BLE001 — protective boundary
        logger.exception(
            "notifications: signal dispatch failed for log %s", log.pk
        )

    return log


# ---------------------------------------------------------------------------
# mark_sent / mark_failed
# ---------------------------------------------------------------------------
@transaction.atomic
def mark_sent(
    log: NotificationLog | Any,
    *,
    external_message_id: str = "",
) -> NotificationLog:
    """Transition a ``pending`` row to ``sent``. Idempotent."""
    row = _resolve_log(log)
    if row.status == NotificationStatus.SENT:
        return row
    if row.status == NotificationStatus.FAILED:
        raise ValidationError(
            {"status": ["Failed bildirishnomani 'sent' holatiga o'tkazib bo'lmaydi."]}
        )
    row.status = NotificationStatus.SENT
    row.sent_at = timezone.now()
    if external_message_id:
        row.external_message_id = str(external_message_id)[:128]
    row.save(
        update_fields=[
            "status",
            "sent_at",
            "external_message_id",
            "updated_at",
        ]
    )
    return row


@transaction.atomic
def mark_failed(
    log: NotificationLog | Any,
    *,
    error_detail: str,
) -> NotificationLog:
    """Transition a ``pending`` row to ``failed``. Idempotent."""
    row = _resolve_log(log)
    if row.status == NotificationStatus.FAILED:
        return row
    if row.status == NotificationStatus.SENT:
        raise ValidationError(
            {"status": ["Sent bildirishnomani 'failed' holatiga o'tkazib bo'lmaydi."]}
        )
    row.status = NotificationStatus.FAILED
    row.error_detail = (error_detail or "").strip()[:2000]
    row.save(update_fields=["status", "error_detail", "updated_at"])
    return row


# ---------------------------------------------------------------------------
# Bulk convenience
# ---------------------------------------------------------------------------
def bulk_enqueue(
    *,
    notification_type: str,
    message: str,
    targets: Iterable[dict[str, Any]],
    channel: str = NotificationChannel.TELEGRAM,
    context: dict[str, Any] | None = None,
) -> list[NotificationLog]:
    """Enqueue the same message to several targets."""
    rows: list[NotificationLog] = []
    for target in targets:
        rows.append(
            enqueue(
                notification_type=notification_type,
                message=message,
                user=target.get("user"),
                patient=target.get("patient"),
                channel=channel,
                context={
                    **(context or {}),
                    **(target.get("context") or {}),
                },
            )
        )
    return rows


# ---------------------------------------------------------------------------
# Internal helper
# ---------------------------------------------------------------------------
def _resolve_log(log: NotificationLog | Any) -> NotificationLog:
    if isinstance(log, NotificationLog):
        return log
    return NotificationLog.objects.get(pk=log)


__all__ = [
    "enqueue",
    "mark_sent",
    "mark_failed",
    "bulk_enqueue",
]
