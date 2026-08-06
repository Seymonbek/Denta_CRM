"""DRF serializers for the ``treatments`` app.

Response payloads are **camelCase** to match the frontend Treatment
interface. Accepts snake_case *or* camelCase input.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import (
    PaymentStatus,
    PhotoType,
    Treatment,
    TreatmentPhoto,
    TreatmentStage,
)
from .services import (
    create_treatment,
    update_treatment,
    upload_treatment_photo,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _camel_user(user: Any) -> dict[str, Any] | None:
    if user is None:
        return None
    return {
        "id": str(user.pk),
        "firstName": getattr(user, "first_name", "") or "",
        "lastName": getattr(user, "last_name", "") or "",
        "phoneNumber": getattr(user, "phone_number", "") or "",
    }


def _camel_doctor(doctor: Any) -> dict[str, Any] | None:
    if doctor is None:
        return None
    return {
        "id": str(doctor.pk),
        "user": _camel_user(getattr(doctor, "user", None)),
        "specialization": getattr(doctor, "specialization", "") or "",
    }


def _camel_patient(patient: Any) -> dict[str, Any] | None:
    if patient is None:
        return None
    return {
        "id": str(patient.pk),
        "firstName": getattr(patient, "first_name", "") or "",
        "lastName": getattr(patient, "last_name", "") or "",
        "phoneNumber": getattr(patient, "phone_number", "") or "",
        "fullName": getattr(patient, "full_name", "") or "",
    }


def _camel_department(department: Any) -> dict[str, Any] | None:
    if department is None:
        return None
    return {
        "id": str(department.pk),
        "name": getattr(department, "name", "") or "",
    }


def _camel_procedure(procedure: Any) -> dict[str, Any] | None:
    if procedure is None:
        return None
    return {
        "id": str(procedure.pk),
        "name": getattr(procedure, "name", "") or "",
        "defaultPrice": str(getattr(procedure, "default_price", "0.00")),
    }


# ---------------------------------------------------------------------------
# TreatmentPhotoSerializer
# ---------------------------------------------------------------------------
class TreatmentPhotoSerializer(serializers.ModelSerializer):
    """Serializer for the ``/treatments/{id}/photos/`` action."""

    photo_type = serializers.ChoiceField(choices=PhotoType.choices)
    image = serializers.ImageField(required=True)
    caption = serializers.CharField(
        max_length=255, allow_blank=True, required=False, default=""
    )

    class Meta:
        model = TreatmentPhoto
        fields = ("id", "photo_type", "image", "caption")
        read_only_fields = ("id",)

    _CAMEL_TO_SNAKE = {"photoType": "photo_type"}

    def to_internal_value(self, data: Any) -> dict[str, Any]:
        if hasattr(data, "getlist"):  # multipart
            new: dict[str, Any] = {}
            for key in list(data.keys()):
                snake = self._CAMEL_TO_SNAKE.get(key, key)
                new[snake] = data.get(key)
            data = new
        elif isinstance(data, dict):
            normalised = {**data}
            for camel, snake in self._CAMEL_TO_SNAKE.items():
                if camel in normalised and snake not in normalised:
                    normalised[snake] = normalised[camel]
            data = normalised
        return super().to_internal_value(data)

    def to_representation(self, instance: TreatmentPhoto) -> dict[str, Any]:
        image_url = None
        if instance.image:
            try:
                image_url = instance.image.url
            except Exception:  # noqa: BLE001 - storage backend may raise
                image_url = str(instance.image)
        return {
            "id": str(instance.id),
            "treatmentId": str(instance.treatment_id),
            "photoType": instance.photo_type,
            "imageUrl": image_url,
            "thumbnailPath": instance.thumbnail_path or None,
            "caption": instance.caption or "",
            "uploadedAt": instance.uploaded_at.isoformat()
            if instance.uploaded_at
            else None,
            "uploadedBy": _camel_user(instance.uploaded_by),
            "isActive": instance.is_active,
        }


# ---------------------------------------------------------------------------
# TreatmentSerializer
# ---------------------------------------------------------------------------
class TreatmentSerializer(serializers.ModelSerializer):
    """Read + write serializer for :class:`Treatment`."""

    doctor = serializers.UUIDField(required=False)
    patient = serializers.UUIDField(required=False)
    department = serializers.UUIDField(required=False)
    procedure_type = serializers.UUIDField(required=False, allow_null=True)
    appointment = serializers.UUIDField(required=False, allow_null=True)

    diagnosis = serializers.CharField(
        max_length=500, allow_blank=True, required=False, default=""
    )
    description = serializers.CharField(
        max_length=10_000, allow_blank=True, required=False, default=""
    )
    price = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, min_value=Decimal("0")
    )
    payment_status = serializers.ChoiceField(
        choices=PaymentStatus.choices, required=False
    )
    stage = serializers.ChoiceField(
        choices=TreatmentStage.choices, required=False
    )
    is_active = serializers.BooleanField(required=False)

    class Meta:
        model = Treatment
        fields = (
            "id",
            "doctor",
            "patient",
            "department",
            "procedure_type",
            "appointment",
            "diagnosis",
            "description",
            "price",
            "payment_status",
            "stage",
            "is_active",
        )
        read_only_fields = ("id",)

    _CAMEL_TO_SNAKE = {
        "procedureType": "procedure_type",
        "paymentStatus": "payment_status",
        "isActive": "is_active",
        "doctorId": "doctor",
        "patientId": "patient",
        "departmentId": "department",
        "appointmentId": "appointment",
        "procedureTypeId": "procedure_type",
    }

    def to_internal_value(self, data: Any) -> dict[str, Any]:
        if isinstance(data, dict):
            normalised = {**data}
            for camel, snake in self._CAMEL_TO_SNAKE.items():
                if camel in normalised and snake not in normalised:
                    normalised[snake] = normalised[camel]
            data = normalised
        return super().to_internal_value(data)

    def to_representation(self, instance: Treatment) -> dict[str, Any]:
        photos = list(instance.photos.filter(is_active=True).order_by("-uploaded_at"))
        tooth_records: list[dict[str, Any]] = []
        # ToothRecord is added in T13 (odontogram app). Fetch defensively so
        # this serializer works even before that app exists.
        try:
            records_manager = instance.tooth_records  # type: ignore[attr-defined]
        except Exception:  # noqa: BLE001
            records_manager = None
        if records_manager is not None:
            try:
                for rec in records_manager.all():
                    tooth_records.append(
                        {
                            "id": str(rec.pk),
                            "toothNumber": rec.tooth_number,
                            "procedure": rec.procedure,
                            "status": rec.status,
                            "notes": rec.notes or "",
                        }
                    )
            except Exception:  # noqa: BLE001 - table may not exist yet
                tooth_records = []

        return {
            "id": str(instance.id),
            "appointmentId": str(instance.appointment_id)
            if instance.appointment_id
            else None,
            "appointment": _camel_appointment(instance.appointment),
            "doctorId": str(instance.doctor_id),
            "doctor": _camel_doctor(instance.doctor),
            "patientId": str(instance.patient_id),
            "patient": _camel_patient(instance.patient),
            "departmentId": str(instance.department_id),
            "department": _camel_department(instance.department),
            "procedureTypeId": str(instance.procedure_type_id)
            if instance.procedure_type_id
            else None,
            "procedureType": _camel_procedure(instance.procedure_type),
            "diagnosis": instance.diagnosis or "",
            "description": instance.description or "",
            "price": str(instance.price),
            "paymentStatus": instance.payment_status,
            "stage": instance.stage,
            "isActive": instance.is_active,
            "createdAt": instance.created_at.isoformat()
            if instance.created_at
            else None,
            "updatedAt": instance.updated_at.isoformat()
            if instance.updated_at
            else None,
            "createdBy": _camel_user(instance.created_by),
            "photos": [
                TreatmentPhotoSerializer(p, context=self.context).data
                for p in photos
            ],
            "toothRecords": tooth_records,
        }

    # ---- create / update via services --------------------------------------
    def create(self, validated_data: dict[str, Any]) -> Treatment:
        request = self.context.get("request")
        actor = getattr(request, "user", None) if request is not None else None
        try:
            return create_treatment(
                doctor=validated_data["doctor"],
                patient=validated_data["patient"],
                department=validated_data["department"],
                procedure_type=validated_data.get("procedure_type"),
                appointment=validated_data.get("appointment"),
                diagnosis=validated_data.get("diagnosis", "") or "",
                description=validated_data.get("description", "") or "",
                price=validated_data.get("price"),
                payment_status=validated_data.get(
                    "payment_status", PaymentStatus.UNPAID
                ),
                stage=validated_data.get("stage", TreatmentStage.IN_PROGRESS),
                created_by=actor,
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                exc.message_dict
                if hasattr(exc, "message_dict")
                else list(exc.messages)
            ) from exc
        except KeyError as exc:  # missing required field
            missing = exc.args[0] if exc.args else "field"
            raise serializers.ValidationError(
                {missing: [f"'{missing}' majburiy."]}
            ) from exc

    def update(
        self, instance: Treatment, validated_data: dict[str, Any]
    ) -> Treatment:
        try:
            return update_treatment(
                instance,
                diagnosis=validated_data.get("diagnosis"),
                description=validated_data.get("description"),
                price=validated_data["price"]
                if "price" in validated_data
                else ...,
                payment_status=validated_data.get("payment_status"),
                stage=validated_data.get("stage"),
                procedure_type=validated_data["procedure_type"]
                if "procedure_type" in validated_data
                else ...,
                is_active=validated_data.get("is_active"),
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                exc.message_dict
                if hasattr(exc, "message_dict")
                else list(exc.messages)
            ) from exc


def _camel_appointment(appointment: Any) -> dict[str, Any] | None:
    if appointment is None:
        return None
    return {
        "id": str(appointment.pk),
        "scheduledStart": appointment.scheduled_start.isoformat()
        if appointment.scheduled_start
        else None,
        "scheduledEnd": appointment.scheduled_end.isoformat()
        if appointment.scheduled_end
        else None,
        "status": appointment.status,
    }


class TreatmentPhotoUploadSerializer(serializers.Serializer):
    """Input serializer for the ``photos`` action."""

    photo_type = serializers.ChoiceField(choices=PhotoType.choices)
    image = serializers.ImageField(required=True)
    caption = serializers.CharField(
        max_length=255, allow_blank=True, required=False, default=""
    )

    _CAMEL_TO_SNAKE = {"photoType": "photo_type"}

    def to_internal_value(self, data: Any) -> dict[str, Any]:
        if hasattr(data, "getlist"):
            new: dict[str, Any] = {}
            for key in list(data.keys()):
                snake = self._CAMEL_TO_SNAKE.get(key, key)
                new[snake] = data.get(key)
            data = new
        elif isinstance(data, dict):
            normalised = {**data}
            for camel, snake in self._CAMEL_TO_SNAKE.items():
                if camel in normalised and snake not in normalised:
                    normalised[snake] = normalised[camel]
            data = normalised
        return super().to_internal_value(data)

    def create(self, validated_data: dict[str, Any]) -> TreatmentPhoto:
        request = self.context.get("request")
        treatment = self.context["treatment"]
        actor = getattr(request, "user", None) if request is not None else None
        try:
            return upload_treatment_photo(
                treatment,
                photo_type=validated_data["photo_type"],
                image=validated_data["image"],
                caption=validated_data.get("caption", "") or "",
                uploaded_by=actor,
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                exc.message_dict
                if hasattr(exc, "message_dict")
                else list(exc.messages)
            ) from exc


__all__ = [
    "TreatmentSerializer",
    "TreatmentPhotoSerializer",
    "TreatmentPhotoUploadSerializer",
]
