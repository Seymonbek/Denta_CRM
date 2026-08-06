"""Read-side helpers for the ``notifications`` app.

Selectors never mutate. They return querysets so callers can chain
further filters / ordering as needed.
"""
from __future__ import annotations

from typing import Any

from django.db.models import Q, QuerySet

from .models import NotificationLog, NotificationStatus


def all_notifications() -> QuerySet[NotificationLog]:
    """Return every notification, newest first."""
    return (
        NotificationLog.objects.select_related("user", "patient")
        .order_by("-created_at")
    )


def notifications_for_user(user_id: Any) -> QuerySet[NotificationLog]:
    """Only the rows that target the given staff user."""
    return all_notifications().filter(user_id=user_id)


def notifications_for_patient(patient_id: Any) -> QuerySet[NotificationLog]:
    """Only the rows that target the given patient."""
    return all_notifications().filter(patient_id=patient_id)


def pending_notifications() -> QuerySet[NotificationLog]:
    """Rows that are still waiting for delivery. Consumed by workers."""
    return (
        NotificationLog.objects.filter(status=NotificationStatus.PENDING)
        .select_related("user", "patient")
        .order_by("created_at")
    )


def visible_to(user: Any) -> QuerySet[NotificationLog]:
    """Return the rows the given ``user`` is allowed to read.

    * ``bosh_shifokor`` sees every notification.
    * ``doctor`` sees only their own inbox + patient rows they treat.
    * ``administrator`` sees notifications targeting themselves + any
      patient (they field patient calls).
    * Anonymous or unknown role → empty queryset.
    """
    if user is None or not getattr(user, "is_authenticated", False):
        return NotificationLog.objects.none()

    from apps.core.permissions import (
        ROLE_ADMINISTRATOR,
        ROLE_BOSH_SHIFOKOR,
        ROLE_DOCTOR,
    )

    role = getattr(user, "role", None)
    base = all_notifications()

    if role == ROLE_BOSH_SHIFOKOR:
        return base
    if role == ROLE_DOCTOR:
        return base.filter(Q(user_id=user.id) | Q(patient__isnull=False))
    if role == ROLE_ADMINISTRATOR:
        return base.filter(Q(user_id=user.id) | Q(patient__isnull=False))
    return NotificationLog.objects.none()


__all__ = [
    "all_notifications",
    "notifications_for_user",
    "notifications_for_patient",
    "pending_notifications",
    "visible_to",
]
