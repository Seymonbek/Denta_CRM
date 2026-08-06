"""DRF serializers for the ``prescriptions`` app.

Response payloads are camelCase to match the frontend. Input accepts
either snake_case or camelCase.
"""
from __future__ import annotations

from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import Prescription, PrescriptionTemplate
from .services import (
    create_prescription_for_treatment,
    create_prescription_template,
    update_prescription_template,
)


def _camel_user(user: Any) -> dict[str, Any] | None:
    if user is None:
        return None
    return {
        "id": str(user.pk),
        "firstName": getattr(user, "first_name", "") or "",
        "lastName": getattr(user, "last_name", "") or "",
        "phoneNumber": getattr(user, "phone_number", "") or "",
    }


def _camel_patient(patient: Any) -> dict[str, Any] | None:
    if patient is None:
        return None
    return {
        "id": str(patient.pk),
        "firstName": getattr(patient, "first_name", "") or "",
        "lastName": getattr(patient, "last_name", "") or "",
        "phoneNumber": getattr(patient, "phone_number", "") or "",
        "telegramChatId": getattr(patient, "telegram_chat_id", None),
    }


def _camel_treatment_brief(treatment: Any) -> dict[str, Any] | None:
    if treatment is None:
        return None
    return {
        "id": str(treatment.pk),
        "diagnosis": getattr(treatment, "diagnosis", "") or "",
        "patient": _camel_patient(getattr(treatment, "patient", None)),
    }


# ---------------------------------------------------------------------------
# PrescriptionTemplateSerializer
# ---------------------------------------------------------------------------
class PrescriptionTemplateSerializer(serializers.ModelSerializer):
    """CRUD serializer for :class:`PrescriptionTemplate`."""

    name = serializers.CharField(max_length=200)
    content = serializers.CharField(max_length=20_000)
    is_active = serializers.BooleanField(required=False)

    class Meta:
        model = PrescriptionTemplate
        fields = ("id", "name", "content", "is_active")
        read_only_fields = ("id",)

    _CAMEL_TO_SNAKE = {"isActive": "is_active"}

    def to_internal_value(self, data: Any) -> dict[str, Any]:
        if isinstance(data, dict):
            normalised = {**data}
            for camel, snake in self._CAMEL_TO_SNAKE.items():
                if camel in normalised and snake not in normalised:
                    normalised[snake] = normalised[camel]
            data = normalised
        return super().to_internal_value(data)

    def to_representation(self, instance: PrescriptionTemplate) -> dict[str, Any]:
        return {
            "id": str(instance.id),
            "name": instance.name,
            "content": instance.content,
            "isActive": instance.is_active,
            "createdBy": _camel_user(instance.created_by),
            "createdAt": instance.created_at.isoformat()
            if instance.created_at
            else None,
            "updatedAt": instance.updated_at.isoformat()
            if instance.updated_at
            else None,
        }

    def create(self, validated_data: dict[str, Any]) -> PrescriptionTemplate:
        request = self.context.get("request")
        actor = getattr(request, "user", None) if request is not None else None
        try:
            return create_prescription_template(
                name=validated_data["name"],
                content=validated_data["content"],
                created_by=actor,
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                exc.message_dict
                if hasattr(exc, "message_dict")
                else list(exc.messages)
            ) from exc

    def update(
        self,
        instance: PrescriptionTemplate,
        validated_data: dict[str, Any],
    ) -> PrescriptionTemplate:
        try:
            return update_prescription_template(
                instance,
                name=validated_data.get("name"),
                content=validated_data.get("content"),
                is_active=validated_data.get("is_active"),
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                exc.message_dict
                if hasattr(exc, "message_dict")
                else list(exc.messages)
            ) from exc


# ---------------------------------------------------------------------------
# PrescriptionSerializer (read-only via viewset; issue uses the input one)
# ---------------------------------------------------------------------------
class PrescriptionSerializer(serializers.ModelSerializer):
    """Read serializer for :class:`Prescription`."""

    class Meta:
        model = Prescription
        fields = ("id", "content", "sent_to_telegram_at", "is_active")
        read_only_fields = fields

    def to_representation(self, instance: Prescription) -> dict[str, Any]:
        return {
            "id": str(instance.id),
            "treatmentId": str(instance.treatment_id),
            "treatment": _camel_treatment_brief(instance.treatment),
            "templateId": str(instance.template_id) if instance.template_id else None,
            "templateName": getattr(instance.template, "name", None)
            if instance.template
            else None,
            "content": instance.content,
            "sentToTelegramAt": instance.sent_to_telegram_at.isoformat()
            if instance.sent_to_telegram_at
            else None,
            "isSent": instance.sent_to_telegram_at is not None,
            "isActive": instance.is_active,
            "createdAt": instance.created_at.isoformat()
            if instance.created_at
            else None,
            "createdBy": _camel_user(instance.created_by),
        }


# ---------------------------------------------------------------------------
# Prescription issue-on-treatment input serializer
# ---------------------------------------------------------------------------
class IssuePrescriptionSerializer(serializers.Serializer):
    """Input for ``POST /treatments/{id}/prescription/``."""

    template = serializers.UUIDField(required=False, allow_null=True)
    content = serializers.CharField(
        max_length=20_000, required=False, allow_blank=True
    )
    send = serializers.BooleanField(required=False, default=True)

    _CAMEL_TO_SNAKE = {
        "templateId": "template",
    }

    def to_internal_value(self, data: Any) -> dict[str, Any]:
        if isinstance(data, dict):
            normalised = {**data}
            for camel, snake in self._CAMEL_TO_SNAKE.items():
                if camel in normalised and snake not in normalised:
                    normalised[snake] = normalised[camel]
            data = normalised
        return super().to_internal_value(data)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if not attrs.get("template") and not (attrs.get("content") or "").strip():
            raise serializers.ValidationError(
                {"content": ["'content' yoki 'template' kiritilishi shart."]}
            )
        return attrs

    def create(self, validated_data: dict[str, Any]) -> Prescription:
        request = self.context.get("request")
        treatment = self.context["treatment"]
        actor = getattr(request, "user", None) if request is not None else None
        try:
            return create_prescription_for_treatment(
                treatment=treatment,
                template=validated_data.get("template"),
                content=validated_data.get("content") or None,
                created_by=actor,
                send=bool(validated_data.get("send", True)),
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                exc.message_dict
                if hasattr(exc, "message_dict")
                else list(exc.messages)
            ) from exc


__all__ = [
    "PrescriptionTemplateSerializer",
    "PrescriptionSerializer",
    "IssuePrescriptionSerializer",
]
