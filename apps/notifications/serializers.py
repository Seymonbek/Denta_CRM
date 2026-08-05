"""Serializers for the ``notifications`` app.

Read-only; payload is camelCase to mirror the frontend TS interfaces.
"""
from __future__ import annotations

from typing import Any

from rest_framework import serializers

from .models import NotificationLog


class NotificationLogSerializer(serializers.ModelSerializer):
    """Serialise a notification row for the frontend inbox."""

    class Meta:
        model = NotificationLog
        fields = (
            "id",
            "user",
            "patient",
            "type",
            "channel",
            "message",
            "status",
            "context",
            "error_detail",
            "sent_at",
            "external_message_id",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def to_representation(self, instance: NotificationLog) -> dict[str, Any]:
        return {
            "id": str(instance.id),
            "userId": str(instance.user_id) if instance.user_id else None,
            "patientId": str(instance.patient_id) if instance.patient_id else None,
            "type": instance.type,
            "channel": instance.channel,
            "message": instance.message,
            "status": instance.status,
            "context": instance.context or {},
            "errorDetail": instance.error_detail or "",
            "sentAt": instance.sent_at.isoformat() if instance.sent_at else None,
            "externalMessageId": instance.external_message_id or "",
            "createdAt": instance.created_at.isoformat()
            if instance.created_at
            else None,
            "updatedAt": instance.updated_at.isoformat()
            if instance.updated_at
            else None,
        }


__all__ = ["NotificationLogSerializer"]
