"""DRF serializers for the departments app.

Payloads are camelCase to match the frontend TS interfaces. We follow
the same "manual to_representation" pattern established in the accounts
serializers (no global camel-case package).
"""
from __future__ import annotations

from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import Department
from .services import create_department, update_department


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


class DepartmentSerializer(serializers.ModelSerializer):
    """Read + write serializer for :class:`Department`.

    Write side delegates to :func:`services.create_department` /
    :func:`services.update_department` so business rules live in one
    place. Response shape is camelCase.
    """

    # We accept both ``name`` (snake/camel identical) and ``description``
    # explicitly so that DRF applies max-length validation before we
    # dispatch to services.
    name = serializers.CharField(max_length=100)
    description = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        style={"base_template": "textarea.html"},
    )
    is_active = serializers.BooleanField(required=False)

    class Meta:
        model = Department
        fields = ("id", "name", "description", "is_active")
        read_only_fields = ("id",)

    # -----------------------------------------------------------------
    # Input normalisation
    # -----------------------------------------------------------------
    def to_internal_value(self, data: Any) -> dict[str, Any]:
        # Accept ``isActive`` (camelCase) as an alias for ``is_active``.
        if isinstance(data, dict) and "isActive" in data and "is_active" not in data:
            data = {**data, "is_active": data["isActive"]}
        return super().to_internal_value(data)

    # -----------------------------------------------------------------
    # Output shape (camelCase)
    # -----------------------------------------------------------------
    def to_representation(self, instance: Department) -> dict[str, Any]:
        return {
            "id": str(instance.id),
            "name": instance.name,
            "description": instance.description or "",
            "isActive": instance.is_active,
            "createdAt": instance.created_at.isoformat() if instance.created_at else None,
            "updatedAt": instance.updated_at.isoformat() if instance.updated_at else None,
            "createdBy": _camel_user(instance.created_by),
        }

    # -----------------------------------------------------------------
    # Create / update via services
    # -----------------------------------------------------------------
    def create(self, validated_data: dict[str, Any]) -> Department:
        request = self.context.get("request")
        actor = getattr(request, "user", None) if request is not None else None
        try:
            return create_department(
                name=validated_data["name"],
                description=validated_data.get("description", ""),
                created_by=actor,
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                exc.message_dict if hasattr(exc, "message_dict") else list(exc.messages)
            ) from exc

    def update(self, instance: Department, validated_data: dict[str, Any]) -> Department:
        try:
            return update_department(
                instance,
                name=validated_data.get("name"),
                description=validated_data.get("description"),
                is_active=validated_data.get("is_active"),
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                exc.message_dict if hasattr(exc, "message_dict") else list(exc.messages)
            ) from exc


__all__ = ["DepartmentSerializer"]
