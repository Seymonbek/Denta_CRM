"""DRF serializers for the ``scheduling`` app.

Payloads follow the frontend TS ``Appointment`` interface (camelCase).
Writes delegate to :mod:`apps.scheduling.services` so business rules
live in one place.
"""
from __future__ import annotations

from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import Appointment, AppointmentStatus
from .services import cancel_appointment, create_appointment, update_appointment


def _raise_validation(exc: DjangoValidationError):
    payload = (
        exc.message_dict
        if hasattr(exc, "message_dict")
        else list(exc.messages)
    )
    raise serializers.ValidationError(payload) from exc


def _camel_patient(patient: Any) -> dict[str, Any] | None:
    if patient is None:
        return None
    return {
        "id": str(patient.pk),
        "firstName": patient.first_name,
        "lastName": patient.last_name,
        "phoneNumber": patient.phone_number,
        "fullName": patient.full_name,
    }


def _camel_doctor(doctor: Any) -> dict[str, Any] | None:
    if doctor is None:
        return None
    user = getattr(doctor, "user", None)
    return {
        "id": str(doctor.pk),
        "specialization": doctor.specialization or "",
        "user": {
            "id": str(getattr(user, "pk", "")),
            "firstName": getattr(user, "first_name", "") or "",
            "lastName": getattr(user, "last_name", "") or "",
            "phoneNumber": getattr(user, "phone_number", "") or "",
        }
        if user is not None
        else None,
    }


def _camel_department(dept: Any) -> dict[str, Any] | None:
    if dept is None:
        return None
    return {"id": str(dept.pk), "name": dept.name}


def _camel_procedure(procedure: Any) -> dict[str, Any] | None:
    if procedure is None:
        return None
    return {
        "id": str(procedure.pk),
        "name": procedure.name,
        "defaultDurationMinutes": procedure.default_duration_minutes,
    }


def _camel_user(user: Any) -> dict[str, Any] | None:
    if user is None:
        return None
    return {
        "id": str(user.pk),
        "firstName": getattr(user, "first_name", "") or "",
        "lastName": getattr(user, "last_name", "") or "",
        "phoneNumber": getattr(user, "phone_number", "") or "",
    }


class AppointmentSerializer(serializers.ModelSerializer):
    """Serialize :class:`Appointment` in / out of the JSON API."""

    patient_id = serializers.UUIDField(write_only=True, required=False)
    doctor_id = serializers.UUIDField(write_only=True, required=False)
    department_id = serializers.UUIDField(write_only=True, required=False)
    procedure_type_id = serializers.UUIDField(
        write_only=True, required=False, allow_null=True
    )
    scheduled_start = serializers.DateTimeField()
    scheduled_end = serializers.DateTimeField()
    status = serializers.ChoiceField(
        choices=AppointmentStatus.choices, required=False
    )
    notes = serializers.CharField(required=False, allow_blank=True, default="")

    class Meta:
        model = Appointment
        fields = (
            "id",
            "patient_id",
            "doctor_id",
            "department_id",
            "procedure_type_id",
            "scheduled_start",
            "scheduled_end",
            "status",
            "notes",
        )
        read_only_fields = ("id",)

    # ------------------------------------------------------------------
    # camelCase → snake_case aliases
    # ------------------------------------------------------------------
    _CAMEL_ALIASES = {
        "patientId": "patient_id",
        "doctorId": "doctor_id",
        "departmentId": "department_id",
        "procedureTypeId": "procedure_type_id",
        "scheduledStart": "scheduled_start",
        "scheduledEnd": "scheduled_end",
    }

    def to_internal_value(self, data: Any) -> dict[str, Any]:
        if isinstance(data, dict):
            data = {**data}
            for camel, snake in self._CAMEL_ALIASES.items():
                if camel in data and snake not in data:
                    data[snake] = data[camel]
        return super().to_internal_value(data)

    # ------------------------------------------------------------------
    # Output shape (camelCase)
    # ------------------------------------------------------------------
    def to_representation(self, instance: Appointment) -> dict[str, Any]:
        return {
            "id": str(instance.id),
            "patientId": str(instance.patient_id),
            "doctorId": str(instance.doctor_id),
            "departmentId": str(instance.department_id),
            "procedureTypeId": (
                str(instance.procedure_type_id)
                if instance.procedure_type_id
                else None
            ),
            "patient": _camel_patient(instance.patient),
            "doctor": _camel_doctor(instance.doctor),
            "department": _camel_department(instance.department),
            "procedureType": _camel_procedure(instance.procedure_type),
            "scheduledStart": instance.scheduled_start.isoformat(),
            "scheduledEnd": instance.scheduled_end.isoformat(),
            "status": instance.status,
            "statusLabel": AppointmentStatus(instance.status).label,
            "notes": instance.notes or "",
            "reminder1dSent": instance.reminder_1d_sent,
            "reminder2hSent": instance.reminder_2h_sent,
            "createdBy": _camel_user(instance.created_by),
            "createdAt": instance.created_at.isoformat() if instance.created_at else None,
            "updatedAt": instance.updated_at.isoformat() if instance.updated_at else None,
        }

    # ------------------------------------------------------------------
    # Create
    # ------------------------------------------------------------------
    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        # For CREATE only, require the FKs.
        if self.instance is None:
            missing = [
                f
                for f in ("patient_id", "doctor_id", "department_id",
                          "scheduled_start", "scheduled_end")
                if f not in attrs
            ]
            if missing:
                raise serializers.ValidationError(
                    {f: ["Majburiy maydon."] for f in missing}
                )
        return attrs

    def create(self, validated_data: dict[str, Any]) -> Appointment:
        request = self.context.get("request")
        actor = getattr(request, "user", None) if request is not None else None
        try:
            return create_appointment(
                patient=validated_data["patient_id"],
                doctor=validated_data["doctor_id"],
                department=validated_data["department_id"],
                procedure_type=validated_data.get("procedure_type_id"),
                scheduled_start=validated_data["scheduled_start"],
                scheduled_end=validated_data["scheduled_end"],
                notes=validated_data.get("notes", ""),
                status=validated_data.get(
                    "status", AppointmentStatus.SCHEDULED
                ),
                created_by=actor,
            )
        except DjangoValidationError as exc:
            _raise_validation(exc)

    # ------------------------------------------------------------------
    # Update
    # ------------------------------------------------------------------
    def update(
        self, instance: Appointment, validated_data: dict[str, Any]
    ) -> Appointment:
        try:
            return update_appointment(
                instance,
                scheduled_start=validated_data.get("scheduled_start"),
                scheduled_end=validated_data.get("scheduled_end"),
                procedure_type=(
                    validated_data["procedure_type_id"]
                    if "procedure_type_id" in validated_data
                    else ...
                ),
                status=validated_data.get("status"),
                notes=validated_data.get("notes"),
            )
        except DjangoValidationError as exc:
            _raise_validation(exc)


class AppointmentCancelSerializer(serializers.Serializer):
    """Body for ``POST /appointments/{id}/cancel/``."""

    reason = serializers.CharField(required=False, allow_blank=True, default="")

    def save(self, **kwargs: Any) -> Appointment:  # type: ignore[override]
        appointment: Appointment = self.context["appointment"]
        try:
            return cancel_appointment(
                appointment, reason=self.validated_data.get("reason") or None
            )
        except DjangoValidationError as exc:
            _raise_validation(exc)


__all__ = ["AppointmentSerializer", "AppointmentCancelSerializer"]
