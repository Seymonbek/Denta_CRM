"""DRF serializers for the ``payments`` app.

Payloads are camelCase (mirrors ``frontend/src/types/index.ts``).
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.treatments.models import Treatment

from .models import CommissionRecord, Payment, PaymentMethod
from .services import record_payment


def _decimal_str(value: Decimal | None, *, places: int = 2) -> str | None:
    if value is None:
        return None
    return f"{Decimal(value):.{places}f}"


# ---------------------------------------------------------------------------
# PaymentSerializer
# ---------------------------------------------------------------------------
class PaymentSerializer(serializers.ModelSerializer):
    """Read + write serializer for :class:`Payment`.

    ``patient`` is derived from the treatment — clients only send the
    ``treatment`` id.
    """

    treatment = serializers.PrimaryKeyRelatedField(
        queryset=__import__("apps.treatments.models", fromlist=["Treatment"]).Treatment.objects.filter(is_active=True),
        allow_null=True,
        required=False,
    )
    patientId = serializers.PrimaryKeyRelatedField(
        queryset=__import__("apps.patients.models", fromlist=["Patient"]).Patient.objects.filter(is_active=True),
        source="patient",
        allow_null=True,
        required=False,
    )
    amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.01"),
    )
    method = serializers.ChoiceField(choices=PaymentMethod.choices)
    note = serializers.CharField(required=False, allow_blank=True, default="")

    class Meta:
        model = Payment
        fields = ("id", "treatment", "patientId", "amount", "method", "note")
        read_only_fields = ("id",)

    _CAMEL_ALIASES = {
        "treatmentId": "treatment",
    }

    def validate(self, attrs):
        if not attrs.get("treatment") and not attrs.get("patient"):
            raise serializers.ValidationError("Kamida 'treatmentId' yoki 'patientId' kiritilishi shart.")
        return attrs

    def to_internal_value(self, data: Any) -> dict[str, Any]:
        if isinstance(data, dict):
            merged = dict(data)
            for camel, snake in self._CAMEL_ALIASES.items():
                if camel in merged and snake not in merged:
                    merged[snake] = merged.pop(camel)
            data = merged
        return super().to_internal_value(data)

    def to_representation(self, instance: Payment) -> dict[str, Any]:
        return {
            "id": str(instance.id),
            "treatmentId": str(instance.treatment_id) if instance.treatment_id else None,
            "patientId": str(instance.patient_id),
            "amount": _decimal_str(instance.amount),
            "method": instance.method,
            "note": instance.note or "",
            "receivedBy": (
                {
                    "id": str(instance.received_by_id),
                    "firstName": instance.received_by.first_name,
                    "lastName": instance.received_by.last_name,
                }
                if instance.received_by_id
                else None
            ),
            "isActive": instance.is_active,
            "createdAt": instance.created_at.isoformat() if instance.created_at else None,
        }

    def create(self, validated_data: dict[str, Any]) -> Payment:
        request = self.context.get("request")
        actor = getattr(request, "user", None) if request else None
        try:
            return record_payment(
                treatment=validated_data.get("treatment"),
                patient=validated_data.get("patient"),
                amount=validated_data["amount"],
                method=validated_data.get("method", PaymentMethod.CASH),
                received_by=actor,
                note=validated_data.get("note", ""),
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                exc.message_dict if hasattr(exc, "message_dict") else list(exc.messages)
            ) from exc


# ---------------------------------------------------------------------------
# PatientBalanceSerializer (plain dict → camelCase)
# ---------------------------------------------------------------------------
class PatientBalanceSerializer(serializers.Serializer):
    """Serialises the dict returned by
    :func:`apps.payments.selectors.patient_balance`.
    """

    patientId = serializers.CharField()
    totalBilled = serializers.DecimalField(max_digits=12, decimal_places=2)
    totalPaid = serializers.DecimalField(max_digits=12, decimal_places=2)
    balance = serializers.DecimalField(max_digits=12, decimal_places=2)


# ---------------------------------------------------------------------------
# CommissionRecordSerializer
# ---------------------------------------------------------------------------
class CommissionRecordSerializer(serializers.ModelSerializer):
    """Read-only serializer for :class:`CommissionRecord`."""

    class Meta:
        model = CommissionRecord
        fields = (
            "id", "doctor", "treatment",
            "amount", "rate", "basis",
            "base_amount", "material_cost",
            "calculated_at",
        )
        read_only_fields = fields

    def to_representation(self, instance: CommissionRecord) -> dict[str, Any]:
        return {
            "id": str(instance.id),
            "doctorId": str(instance.doctor_id),
            "treatmentId": str(instance.treatment_id),
            "amount": _decimal_str(instance.amount),
            "rate": _decimal_str(instance.rate),
            "basis": instance.basis,
            "baseAmount": _decimal_str(instance.base_amount),
            "materialCost": _decimal_str(instance.material_cost),
            "calculatedAt": (
                instance.calculated_at.isoformat() if instance.calculated_at else None
            ),
        }


class CommissionSummarySerializer(serializers.Serializer):
    """Serialises the dict returned by
    :func:`apps.payments.selectors.commission_summary_for_doctor`.
    """

    doctorId = serializers.CharField()
    count = serializers.IntegerField()
    totalAmount = serializers.DecimalField(max_digits=14, decimal_places=2)
    dateFrom = serializers.CharField(allow_null=True)
    dateTo = serializers.CharField(allow_null=True)


class CashShiftSerializer(serializers.ModelSerializer):
    admin_name = serializers.CharField(source="administrator.get_full_name", read_only=True)

    class Meta:
        model = __import__("apps.payments.models", fromlist=["CashShift"]).CashShift
        fields = [
            "id", "administrator", "admin_name", "opened_at", "closed_at", 
            "start_balance", "cash_collected", "card_collected", 
            "status", "approved_by"
        ]
        read_only_fields = ["id", "administrator", "opened_at", "closed_at", "status", "approved_by", "cash_collected", "card_collected"]


__all__ = [
    "PaymentSerializer",
    "PatientBalanceSerializer",
    "CommissionRecordSerializer",
    "CommissionSummarySerializer",
    "CashShiftSerializer",
]
