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
        # ── Patient name ────────────────────────────────────────────
        patient = instance.patient
        patient_name = (
            f"{patient.first_name} {patient.last_name}".strip()
            if patient
            else "Noma'lum bemor"
        )

        # ── Treatment / procedure info ───────────────────────────────
        treatment = instance.treatment
        procedure_name = ""
        doctor_name = ""
        if treatment:
            if treatment.procedure_type_id and hasattr(treatment, "procedure_type") and treatment.procedure_type:
                procedure_name = treatment.procedure_type.name or ""
            doc = getattr(treatment, "doctor", None)
            if doc and hasattr(doc, "user") and doc.user:
                doctor_name = f"{doc.user.first_name} {doc.user.last_name}".strip()

        # ── Short readable ID (first 8 chars of UUID uppercased) ────
        short_id = str(instance.id).replace("-", "").upper()[:8]

        return {
            "id": str(instance.id),
            "shortId": short_id,
            "treatmentId": str(instance.treatment_id) if instance.treatment_id else None,
            "patientId": str(instance.patient_id),
            "patientName": patient_name,
            "procedureName": procedure_name,
            "doctorName": doctor_name,
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
            "refundStatus": instance.refund_status,
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
        doctor_name = ""
        if instance.doctor and hasattr(instance.doctor, "user") and instance.doctor.user:
            doctor_name = f"Dr. {instance.doctor.user.first_name} {instance.doctor.user.last_name}".strip()
        patient_name = ""
        procedure_name = ""
        if instance.treatment:
            if instance.treatment.patient:
                patient_name = f"{instance.treatment.patient.first_name} {instance.treatment.patient.last_name}".strip()
            if instance.treatment.procedure_type:
                procedure_name = instance.treatment.procedure_type.name or ""

        return {
            "id": str(instance.id),
            "doctorId": str(instance.doctor_id),
            "doctorName": doctor_name,
            "patientName": patient_name,
            "procedureName": procedure_name,
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
            "cash_expenses", "card_expenses",
            "status", "approved_by"
        ]
        read_only_fields = ["id", "administrator", "opened_at", "closed_at", "status", "approved_by", "cash_collected", "card_collected", "cash_expenses", "card_expenses"]

    def to_representation(self, instance: Any) -> dict[str, Any]:
        data = super().to_representation(instance)
        data["adminName"] = data.get("admin_name")
        data["openedAt"] = data.get("opened_at")
        data["closedAt"] = data.get("closed_at")
        data["startBalance"] = data.get("start_balance")
        data["cashCollected"] = data.get("cash_collected")
        data["cardCollected"] = data.get("card_collected")
        data["cashExpenses"] = data.get("cash_expenses")
        data["cardExpenses"] = data.get("card_expenses")
        data["approvedBy"] = data.get("approved_by")
        return data


class ExpenseCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = __import__("apps.payments.models", fromlist=["ExpenseCategory"]).ExpenseCategory
        fields = ["id", "name", "is_active"]


class ExpenseSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    recorded_by_name = serializers.CharField(source="recorded_by.get_full_name", read_only=True)

    class Meta:
        model = __import__("apps.payments.models", fromlist=["Expense"]).Expense
        fields = [
            "id", "category", "category_name", "amount", "description",
            "date", "recorded_by", "recorded_by_name", "payment_method", "cash_shift"
        ]
        read_only_fields = ["id", "date", "recorded_by", "cash_shift"]

    def to_representation(self, instance: Any) -> dict[str, Any]:
        data = super().to_representation(instance)
        data["categoryName"] = data.get("category_name")
        data["recordedByName"] = data.get("recorded_by_name")
        data["paymentMethod"] = data.get("payment_method")
        data["cashShift"] = data.get("cash_shift")
        return data


__all__ = [
    "PaymentSerializer",
    "PatientBalanceSerializer",
    "CommissionRecordSerializer",
    "CommissionSummarySerializer",
    "CashShiftSerializer",
    "ExpenseCategorySerializer",
    "ExpenseSerializer",
]
