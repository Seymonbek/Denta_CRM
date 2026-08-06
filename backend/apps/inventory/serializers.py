"""DRF serializers for the ``inventory`` app.

All payloads are camelCase to mirror the frontend TS interfaces defined
in ``frontend/src/types/index.ts``. We follow the manual
``to_representation`` pattern used elsewhere in this project so the API
stays predictable without pulling in a global camelcase package.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import (
    Material,
    MaterialStockLog,
    MaterialUnit,
    MaterialUsage,
)
from .services import (
    adjust_stock,
    create_material,
    record_usage,
    restock,
    update_material,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _decimal_str(value: Decimal | None) -> str | None:
    if value is None:
        return None
    return f"{value:.3f}"


def _camel_material(instance: Material) -> dict[str, Any]:
    return {
        "id": str(instance.id),
        "name": instance.name,
        "unit": instance.unit,
        "quantityInStock": _decimal_str(instance.quantity_in_stock),
        "minimumThreshold": _decimal_str(instance.minimum_threshold),
        "unitCost": (
            f"{instance.unit_cost:.2f}" if instance.unit_cost is not None else None
        ),
        "notes": instance.notes or "",
        "isBelowThreshold": instance.is_below_threshold,
        "isActive": instance.is_active,
        "createdAt": instance.created_at.isoformat() if instance.created_at else None,
        "updatedAt": instance.updated_at.isoformat() if instance.updated_at else None,
    }


# ---------------------------------------------------------------------------
# MaterialSerializer
# ---------------------------------------------------------------------------
class MaterialSerializer(serializers.ModelSerializer):
    """Read + write serializer for :class:`Material`."""

    name = serializers.CharField(max_length=150)
    unit = serializers.ChoiceField(choices=MaterialUnit.choices)
    quantity_in_stock = serializers.DecimalField(
        max_digits=12,
        decimal_places=3,
        min_value=Decimal("0.000"),
        required=False,
        default=Decimal("0.000"),
    )
    minimum_threshold = serializers.DecimalField(
        max_digits=12,
        decimal_places=3,
        min_value=Decimal("0.000"),
        required=False,
        default=Decimal("0.000"),
    )
    unit_cost = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.00"),
        required=False,
        allow_null=True,
    )
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    is_active = serializers.BooleanField(required=False)

    class Meta:
        model = Material
        fields = (
            "id",
            "name",
            "unit",
            "quantity_in_stock",
            "minimum_threshold",
            "unit_cost",
            "notes",
            "is_active",
        )
        read_only_fields = ("id",)

    # ------------------------------------------------------------------
    # camelCase aliases on the way in
    # ------------------------------------------------------------------
    _CAMEL_ALIASES = {
        "quantityInStock": "quantity_in_stock",
        "minimumThreshold": "minimum_threshold",
        "unitCost": "unit_cost",
        "isActive": "is_active",
    }

    def to_internal_value(self, data: Any) -> dict[str, Any]:
        if isinstance(data, dict):
            merged = dict(data)
            for camel, snake in self._CAMEL_ALIASES.items():
                if camel in merged and snake not in merged:
                    merged[snake] = merged.pop(camel)
            data = merged
        return super().to_internal_value(data)

    def to_representation(self, instance: Material) -> dict[str, Any]:
        return _camel_material(instance)

    # ------------------------------------------------------------------
    # Create / update via services
    # ------------------------------------------------------------------
    def create(self, validated_data: dict[str, Any]) -> Material:
        try:
            return create_material(
                name=validated_data["name"],
                unit=validated_data["unit"],
                quantity_in_stock=validated_data.get(
                    "quantity_in_stock", Decimal("0.000")
                ),
                minimum_threshold=validated_data.get(
                    "minimum_threshold", Decimal("0.000")
                ),
                unit_cost=validated_data.get("unit_cost"),
                notes=validated_data.get("notes", ""),
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                exc.message_dict if hasattr(exc, "message_dict") else list(exc.messages)
            ) from exc

    def update(self, instance: Material, validated_data: dict[str, Any]) -> Material:
        # quantity_in_stock deliberately ignored on update — must go
        # through /restock/ or /adjust/ for auditability.
        validated_data.pop("quantity_in_stock", None)
        try:
            return update_material(
                instance,
                name=validated_data.get("name"),
                unit=validated_data.get("unit"),
                minimum_threshold=validated_data.get("minimum_threshold"),
                unit_cost=validated_data.get("unit_cost"),
                notes=validated_data.get("notes"),
                is_active=validated_data.get("is_active"),
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                exc.message_dict if hasattr(exc, "message_dict") else list(exc.messages)
            ) from exc


# ---------------------------------------------------------------------------
# RestockSerializer
# ---------------------------------------------------------------------------
class RestockSerializer(serializers.Serializer):
    """Payload for ``PATCH /materials/{id}/restock/``."""

    amount = serializers.DecimalField(
        max_digits=12, decimal_places=3, min_value=Decimal("0.001"),
    )
    note = serializers.CharField(required=False, allow_blank=True, default="")

    def save(self, **kwargs: Any) -> MaterialStockLog:  # type: ignore[override]
        material: Material = self.context["material"]
        request = self.context.get("request")
        performed_by = getattr(request, "user", None) if request else None
        try:
            return restock(
                material,
                amount=self.validated_data["amount"],
                performed_by=performed_by,
                note=self.validated_data.get("note", ""),
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                exc.message_dict if hasattr(exc, "message_dict") else list(exc.messages)
            ) from exc


# ---------------------------------------------------------------------------
# AdjustStockSerializer
# ---------------------------------------------------------------------------
class AdjustStockSerializer(serializers.Serializer):
    """Payload for ``PATCH /materials/{id}/adjust/`` (signed delta)."""

    delta = serializers.DecimalField(max_digits=12, decimal_places=3)
    note = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_delta(self, value: Decimal) -> Decimal:
        if value == 0:
            raise serializers.ValidationError("Delta nolga teng bo'lolmaydi.")
        return value

    def save(self, **kwargs: Any) -> MaterialStockLog:  # type: ignore[override]
        material: Material = self.context["material"]
        request = self.context.get("request")
        performed_by = getattr(request, "user", None) if request else None
        try:
            return adjust_stock(
                material,
                delta=self.validated_data["delta"],
                performed_by=performed_by,
                note=self.validated_data.get("note", ""),
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                exc.message_dict if hasattr(exc, "message_dict") else list(exc.messages)
            ) from exc


# ---------------------------------------------------------------------------
# MaterialStockLogSerializer
# ---------------------------------------------------------------------------
class MaterialStockLogSerializer(serializers.ModelSerializer):
    """Read-only serializer for :class:`MaterialStockLog`."""

    class Meta:
        model = MaterialStockLog
        fields = (
            "id",
            "material",
            "change_amount",
            "reason",
            "resulting_quantity",
            "related_treatment",
            "related_usage",
            "performed_by",
            "note",
            "created_at",
        )
        read_only_fields = fields

    def to_representation(self, instance: MaterialStockLog) -> dict[str, Any]:
        return {
            "id": str(instance.id),
            "materialId": str(instance.material_id),
            "changeAmount": _decimal_str(instance.change_amount),
            "reason": instance.reason,
            "resultingQuantity": _decimal_str(instance.resulting_quantity),
            "relatedTreatmentId": (
                str(instance.related_treatment_id)
                if instance.related_treatment_id
                else None
            ),
            "relatedUsageId": (
                str(instance.related_usage_id) if instance.related_usage_id else None
            ),
            "performedBy": (
                {
                    "id": str(instance.performed_by_id),
                    "firstName": instance.performed_by.first_name,
                    "lastName": instance.performed_by.last_name,
                }
                if instance.performed_by_id
                else None
            ),
            "note": instance.note or "",
            "createdAt": instance.created_at.isoformat() if instance.created_at else None,
        }


# ---------------------------------------------------------------------------
# MaterialUsageSerializer
# ---------------------------------------------------------------------------
class MaterialUsageSerializer(serializers.ModelSerializer):
    """Read + write serializer for :class:`MaterialUsage`.

    Writes go through :func:`apps.inventory.services.record_usage` so
    that stock decrement + audit log run in one transaction.
    """

    material = serializers.PrimaryKeyRelatedField(
        queryset=Material.objects.filter(is_active=True),
    )
    quantity_used = serializers.DecimalField(
        max_digits=12, decimal_places=3, min_value=Decimal("0.001"),
    )

    class Meta:
        model = MaterialUsage
        fields = (
            "id",
            "treatment",
            "material",
            "quantity_used",
        )
        read_only_fields = ("id",)

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        # Lazy-set the treatment queryset — avoids importing the
        # treatments app during module import (breaks migrations).
        from apps.treatments.models import Treatment

        self.fields["treatment"] = serializers.PrimaryKeyRelatedField(
            queryset=Treatment.objects.filter(is_active=True),
        )

    _CAMEL_ALIASES = {
        "quantityUsed": "quantity_used",
        "materialId": "material",
        "treatmentId": "treatment",
    }

    def to_internal_value(self, data: Any) -> dict[str, Any]:
        if isinstance(data, dict):
            merged = dict(data)
            for camel, snake in self._CAMEL_ALIASES.items():
                if camel in merged and snake not in merged:
                    merged[snake] = merged.pop(camel)
            data = merged
        return super().to_internal_value(data)

    def to_representation(self, instance: MaterialUsage) -> dict[str, Any]:
        return {
            "id": str(instance.id),
            "treatmentId": str(instance.treatment_id),
            "materialId": str(instance.material_id),
            "quantityUsed": _decimal_str(instance.quantity_used),
            "recordedBy": (
                str(instance.recorded_by_id) if instance.recorded_by_id else None
            ),
            "createdAt": instance.created_at.isoformat() if instance.created_at else None,
        }

    def create(self, validated_data: dict[str, Any]) -> MaterialUsage:
        request = self.context.get("request")
        actor = getattr(request, "user", None) if request else None
        try:
            return record_usage(
                treatment=validated_data["treatment"],
                material=validated_data["material"],
                quantity_used=validated_data["quantity_used"],
                recorded_by=actor,
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                exc.message_dict if hasattr(exc, "message_dict") else list(exc.messages)
            ) from exc


__all__ = [
    "MaterialSerializer",
    "RestockSerializer",
    "AdjustStockSerializer",
    "MaterialStockLogSerializer",
    "MaterialUsageSerializer",
]
