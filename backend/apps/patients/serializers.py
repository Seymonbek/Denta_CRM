"""DRF serializers for the ``patients`` app.

Response payloads are **camelCase** to match the frontend TS
``Patient`` interface (``{id, firstName, lastName, phoneNumber,
gender?, address?, notes?}``). Same manual pattern used elsewhere in
the codebase — no global camelCase package.
"""
from __future__ import annotations

from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import Patient
from .services import create_patient, update_patient


def _camel_user(user: Any) -> dict[str, Any] | None:
    """Serialise a User FK into a minimal camelCase dict."""
    if user is None:
        return None
    return {
        "id": str(user.pk),
        "firstName": getattr(user, "first_name", "") or "",
        "lastName": getattr(user, "last_name", "") or "",
        "phoneNumber": getattr(user, "phone_number", "") or "",
    }


class PatientSerializer(serializers.ModelSerializer):
    """Read + write serializer for :class:`Patient`.

    The frontend may POST either snake_case (``phone_number``) or
    camelCase (``phoneNumber``) — :meth:`to_internal_value` normalises
    the aliases before validation runs.
    """

    first_name = serializers.CharField(max_length=100)
    last_name = serializers.CharField(max_length=100)
    phone_number = serializers.CharField(max_length=20)
    gender = serializers.ChoiceField(
        choices=Patient.Gender.choices,
        required=False,
        allow_null=True,
        allow_blank=True,
    )
    address = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        max_length=500,
    )
    notes = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        max_length=5000,
        style={"base_template": "textarea.html"},
    )
    telegram_chat_id = serializers.IntegerField(
        required=False,
        allow_null=True,
    )
    is_active = serializers.BooleanField(required=False)

    class Meta:
        model = Patient
        fields = (
            "id",
            "first_name",
            "last_name",
            "phone_number",
            "gender",
            "address",
            "notes",
            "telegram_chat_id",
            "is_active",
        )
        read_only_fields = ("id",)

    # ------------------------------------------------------------------
    # Input normalisation (camelCase → snake_case)
    # ------------------------------------------------------------------
    _CAMEL_TO_SNAKE = {
        "firstName": "first_name",
        "lastName": "last_name",
        "phoneNumber": "phone_number",
        "telegramChatId": "telegram_chat_id",
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

    # ------------------------------------------------------------------
    # Output shape (camelCase)
    # ------------------------------------------------------------------
    def to_representation(self, instance: Patient) -> dict[str, Any]:
        return {
            "id": str(instance.id),
            "firstName": instance.first_name,
            "lastName": instance.last_name,
            "phoneNumber": instance.phone_number,
            "gender": instance.gender or None,
            "address": instance.address or "",
            "notes": instance.notes or "",
            "telegramChatId": instance.telegram_chat_id,
            "isActive": instance.is_active,
            "createdAt": instance.created_at.isoformat()
            if instance.created_at
            else None,
            "updatedAt": instance.updated_at.isoformat()
            if instance.updated_at
            else None,
            "createdBy": _camel_user(instance.created_by),
            "fullName": instance.full_name,
        }

    # ------------------------------------------------------------------
    # Create / update via services
    # ------------------------------------------------------------------
    def create(self, validated_data: dict[str, Any]) -> Patient:
        request = self.context.get("request")
        actor = getattr(request, "user", None) if request is not None else None
        try:
            return create_patient(
                first_name=validated_data["first_name"],
                last_name=validated_data["last_name"],
                phone_number=validated_data["phone_number"],
                gender=validated_data.get("gender"),
                address=validated_data.get("address", "") or "",
                notes=validated_data.get("notes", "") or "",
                telegram_chat_id=validated_data.get("telegram_chat_id"),
                created_by=actor,
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                exc.message_dict if hasattr(exc, "message_dict") else list(exc.messages)
            ) from exc

    def update(
        self, instance: Patient, validated_data: dict[str, Any]
    ) -> Patient:
        try:
            return update_patient(
                instance,
                first_name=validated_data.get("first_name"),
                last_name=validated_data.get("last_name"),
                phone_number=validated_data.get("phone_number"),
                gender=validated_data["gender"]
                if "gender" in validated_data
                else ...,
                address=validated_data.get("address"),
                notes=validated_data.get("notes"),
                telegram_chat_id=validated_data["telegram_chat_id"]
                if "telegram_chat_id" in validated_data
                else ...,
                is_active=validated_data.get("is_active"),
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                exc.message_dict if hasattr(exc, "message_dict") else list(exc.messages)
            ) from exc


# ---------------------------------------------------------------------------
# Sub-resource DTOs
# ---------------------------------------------------------------------------
class PatientHistoryEventSerializer(serializers.Serializer):
    """Represents one entry on the patient timeline.

    The ``patients/{id}/history/`` endpoint aggregates events from the
    appointments (T10), treatments (T12), and payments (T17) apps. Until
    those apps come online the list is naturally empty; this schema
    keeps the frontend contract stable across phases.
    """

    id = serializers.CharField()
    type = serializers.ChoiceField(
        choices=[
            ("appointment", "appointment"),
            ("treatment", "treatment"),
            ("payment", "payment"),
            ("prescription", "prescription"),
            ("note", "note"),
        ]
    )
    occurredAt = serializers.DateTimeField()  # noqa: N815 - camelCase for FE
    title = serializers.CharField()
    summary = serializers.CharField(allow_blank=True, required=False)
    meta = serializers.DictField(child=serializers.JSONField(), required=False)


class PatientOdontogramToothSerializer(serializers.Serializer):
    """One tooth in the patient odontogram snapshot.

    Populated in full by T13 (odontogram app). We return the full FDI
    map (11-18, 21-28, 31-38, 41-48) with default ``healthy`` status so
    the frontend Odontogram component always renders a complete arch.
    """

    toothNumber = serializers.IntegerField(min_value=11, max_value=48)  # noqa: N815
    status = serializers.CharField()
    procedure = serializers.CharField(allow_null=True, required=False)
    notes = serializers.CharField(allow_blank=True, required=False)


__all__ = [
    "PatientSerializer",
    "PatientHistoryEventSerializer",
    "PatientOdontogramToothSerializer",
]
