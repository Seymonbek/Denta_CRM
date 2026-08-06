"""Serializers for the ``odontogram`` app.

Response payloads use **camelCase** to match the frontend
``ToothRecord`` interface (PROJECT_BRIEF § "TypeScript Interfaces").
Input accepts both snake_case and camelCase for developer convenience.
"""
from __future__ import annotations

from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import ToothProcedure, ToothRecord, ToothStatus
from .services import create_tooth_record, update_tooth_record


class ToothRecordSerializer(serializers.ModelSerializer):
    """Read + write serializer for :class:`ToothRecord`."""

    tooth_number = serializers.IntegerField(min_value=11, max_value=48)
    procedure = serializers.ChoiceField(choices=ToothProcedure.choices)
    status = serializers.ChoiceField(
        choices=ToothStatus.choices, required=False, default=ToothStatus.PLANNED
    )
    notes = serializers.CharField(
        max_length=5000, allow_blank=True, required=False, default=""
    )

    class Meta:
        model = ToothRecord
        fields = (
            "id",
            "tooth_number",
            "procedure",
            "status",
            "notes",
            "is_active",
        )
        read_only_fields = ("id",)

    _CAMEL_TO_SNAKE = {
        "toothNumber": "tooth_number",
        "isActive": "is_active",
    }

    def to_internal_value(self, data: Any) -> dict[str, Any]:
        if isinstance(data, dict):
            normalised = {**data}
            for camel, snake in self._CAMEL_TO_SNAKE.items():
                if camel in normalised and snake not in normalised:
                    normalised[snake] = normalised[camel]
            data = normalised
        return super().to_internal_value(data)

    def to_representation(self, instance: ToothRecord) -> dict[str, Any]:
        return {
            "id": str(instance.id),
            "treatmentId": str(instance.treatment_id),
            "toothNumber": instance.tooth_number,
            "procedure": instance.procedure,
            "status": instance.status,
            "notes": instance.notes or "",
            "isActive": instance.is_active,
            "createdAt": instance.created_at.isoformat()
            if instance.created_at
            else None,
            "updatedAt": instance.updated_at.isoformat()
            if instance.updated_at
            else None,
        }

    # ---- create / update via services --------------------------------------
    def create(self, validated_data: dict[str, Any]) -> ToothRecord:
        treatment = self.context.get("treatment")
        if treatment is None:
            raise serializers.ValidationError(
                {"treatment": ["Kontekstda davolash topilmadi."]}
            )
        try:
            return create_tooth_record(
                treatment=treatment,
                tooth_number=validated_data["tooth_number"],
                procedure=validated_data["procedure"],
                status_value=validated_data.get("status"),
                notes=validated_data.get("notes", "") or "",
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                exc.message_dict
                if hasattr(exc, "message_dict")
                else list(exc.messages)
            ) from exc

    def update(
        self, instance: ToothRecord, validated_data: dict[str, Any]
    ) -> ToothRecord:
        try:
            return update_tooth_record(
                instance,
                procedure=validated_data["procedure"]
                if "procedure" in validated_data
                else ...,
                status_value=validated_data["status"]
                if "status" in validated_data
                else ...,
                notes=validated_data["notes"]
                if "notes" in validated_data
                else ...,
                tooth_number=validated_data["tooth_number"]
                if "tooth_number" in validated_data
                else ...,
                is_active=validated_data.get("is_active"),
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                exc.message_dict
                if hasattr(exc, "message_dict")
                else list(exc.messages)
            ) from exc


class OdontogramSerializer(serializers.Serializer):
    """Serializer for the patient-level odontogram view.

    Returns a list where each entry is a merged ToothRecord snapshot
    (latest record per tooth). Read-only.
    """

    toothNumber = serializers.IntegerField()
    procedure = serializers.CharField(allow_blank=True)
    status = serializers.CharField()
    notes = serializers.CharField(allow_blank=True)
    treatmentId = serializers.CharField(allow_blank=True, allow_null=True)
    updatedAt = serializers.CharField(allow_blank=True, allow_null=True)


__all__ = ["ToothRecordSerializer", "OdontogramSerializer"]
