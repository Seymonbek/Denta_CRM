"""Serializers for the ``ratings`` app.

All output uses ``camelCase`` field names via
:meth:`rest_framework.serializers.Serializer.to_representation` because
the frontend consumes them directly. Input serializers are minimal —
the leaderboard is read-only, and badges are awarded server-side.
"""
from __future__ import annotations

from typing import Any

from rest_framework import serializers

from .models import Badge, DoctorBadge, ScoreLog


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _to_camel(name: str) -> str:
    """Convert ``snake_case`` to ``camelCase``."""
    parts = name.split("_")
    return parts[0] + "".join(w.capitalize() for w in parts[1:])


class _CamelMixin:
    """Convert serializer output keys from snake_case to camelCase."""

    def to_representation(self, instance: Any) -> dict[str, Any]:
        data = super().to_representation(instance)  # type: ignore[misc]
        return {_to_camel(k): v for k, v in data.items()}


# ---------------------------------------------------------------------------
# ScoreLog
# ---------------------------------------------------------------------------
class ScoreLogSerializer(_CamelMixin, serializers.ModelSerializer):
    """Serialize a single :class:`ScoreLog`."""

    doctor_id = serializers.UUIDField(source="doctor_id", read_only=True)
    related_patient_id = serializers.UUIDField(read_only=True, allow_null=True)
    related_treatment_id = serializers.UUIDField(read_only=True, allow_null=True)

    class Meta:
        model = ScoreLog
        fields = [
            "id",
            "doctor_id",
            "points",
            "reason",
            "related_patient_id",
            "related_treatment_id",
            "note",
            "created_at",
        ]
        read_only_fields = fields


# ---------------------------------------------------------------------------
# Leaderboard
# ---------------------------------------------------------------------------
class LeaderboardEntrySerializer(_CamelMixin, serializers.Serializer):
    """Row shape for ``GET /api/v1/ratings/leaderboard/``."""

    doctor_id = serializers.CharField()
    first_name = serializers.CharField()
    last_name = serializers.CharField()
    specialization = serializers.CharField(allow_blank=True, required=False)
    total_points = serializers.IntegerField()
    entries = serializers.IntegerField()
    rank = serializers.IntegerField()


# ---------------------------------------------------------------------------
# Badges
# ---------------------------------------------------------------------------
class BadgeSerializer(_CamelMixin, serializers.ModelSerializer):
    class Meta:
        model = Badge
        fields = [
            "id",
            "slug",
            "name",
            "description",
            "icon",
        ]
        read_only_fields = ["id"]


class DoctorBadgeSerializer(_CamelMixin, serializers.ModelSerializer):
    badge = BadgeSerializer(read_only=True)
    doctor_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = DoctorBadge
        fields = [
            "id",
            "doctor_id",
            "badge",
            "period",
            "awarded_at",
            "total_points",
        ]
        read_only_fields = fields


__all__ = [
    "ScoreLogSerializer",
    "LeaderboardEntrySerializer",
    "BadgeSerializer",
    "DoctorBadgeSerializer",
]
