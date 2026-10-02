"""DRF serializers for the ``treatments`` app.

Response payloads are **camelCase** to match the frontend Treatment
interface. Accepts snake_case *or* camelCase input.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.doctors.models import ProcedureType

from .models import (
    ICD10Diagnosis,
    PaymentStatus,
    PhotoType,
    PlanItemStatus,
    PlanStatus,
    Treatment,
    TreatmentPhoto,
    TreatmentPlan,
    TreatmentPlanItem,
    TreatmentStage,
)
from .services import (
    create_treatment,
    create_treatment_plan,
    create_treatment_plan_item,
    update_treatment,
    update_treatment_plan,
    update_treatment_plan_item,
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


def _map_procedure_to_tooth_procedure(proc_name: str | None) -> str:
    if not proc_name:
        return "other"
    low = proc_name.lower()
    if "plomb" in low or "fill" in low:
        return "filling"
    if "kanal" in low or "root" in low or "endodont" in low:
        return "root_canal"
    if "olish" in low or "extract" in low or "tortish" in low:
        return "extraction"
    if "koronk" in low or "crown" in low:
        return "crown"
    if "implant" in low:
        return "implant"
    if "tozal" in low or "clean" in low or "gigien" in low:
        return "cleaning"
    if "oqart" in low or "whiten" in low:
        return "whitening"
    return "other"


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
    
    original_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )
    discount_percent = serializers.DecimalField(
        max_digits=5, decimal_places=2, read_only=True
    )
    approval_status = serializers.ChoiceField(
        choices=Treatment.ApprovalStatus.choices, read_only=True
    )
    discount_reason = serializers.CharField(
        max_length=500, allow_blank=True, required=False
    )
    icd_code = serializers.CharField(
        max_length=20, allow_blank=True, required=False, default=""
    )
    icd_diagnosis = serializers.PrimaryKeyRelatedField(
        queryset=ICD10Diagnosis.objects.all(), required=False, allow_null=True
    )
    plan_item = serializers.PrimaryKeyRelatedField(
        queryset=TreatmentPlanItem.objects.all(), required=False, allow_null=True
    )
    teeth = serializers.ListField(
        child=serializers.IntegerField(), required=False, write_only=True
    )
    surfaces = serializers.ListField(
        child=serializers.CharField(), required=False, write_only=True
    )

    class Meta:
        model = Treatment
        fields = (
            "id",
            "doctor",
            "patient",
            "department",
            "procedure_type",
            "appointment",
            "icd_code",
            "icd_diagnosis",
            "plan_item",
            "diagnosis",
            "description",
            "price",
            "original_price",
            "discount_percent",
            "discount_reason",
            "approval_status",
            "payment_status",
            "stage",
            "is_active",
            "teeth",
            "surfaces",
        )
        read_only_fields = ("id", "original_price", "discount_percent", "approval_status")

    _CAMEL_TO_SNAKE = {
        "procedureType": "procedure_type",
        "paymentStatus": "payment_status",
        "originalPrice": "original_price",
        "discountPercent": "discount_percent",
        "discountReason": "discount_reason",
        "approvalStatus": "approval_status",
        "isActive": "is_active",
        "doctorId": "doctor",
        "patientId": "patient",
        "departmentId": "department",
        "appointmentId": "appointment",
        "procedureTypeId": "procedure_type",
        "icdCode": "icd_code",
        "icdDiagnosisId": "icd_diagnosis",
        "icdDiagnosis": "icd_diagnosis",
        "planItemId": "plan_item",
        "planItem": "plan_item",
        "toothNumbers": "teeth",
        "teeth": "teeth",
        "surfaces": "surfaces",
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
                            "surfaces": getattr(rec, "surfaces", []) or [],
                            "notes": rec.notes or "",
                        }
                    )
            except Exception:  # noqa: BLE001 - table may not exist yet
                tooth_records = []

        patient_name = (
            f"{instance.patient.first_name} {instance.patient.last_name}".strip()
            if instance.patient
            else ""
        )
        doctor_name = (
            f"Dr. {instance.doctor.user.first_name} {instance.doctor.user.last_name}".strip()
            if instance.doctor and hasattr(instance.doctor, "user") and instance.doctor.user
            else ""
        )
        department_name = instance.department.name if instance.department else ""
        procedure_type_name = instance.procedure_type.name if instance.procedure_type else ""

        icd_name = ""
        if instance.icd_diagnosis:
            icd_name = instance.icd_diagnosis.name_uz or instance.icd_diagnosis.name_ru

        return {
            "id": str(instance.id),
            "appointmentId": str(instance.appointment_id)
            if instance.appointment_id
            else None,
            "appointment": _camel_appointment(instance.appointment),
            "doctorId": str(instance.doctor_id),
            "doctor": _camel_doctor(instance.doctor),
            "doctorName": doctor_name,
            "patientId": str(instance.patient_id),
            "patient": _camel_patient(instance.patient),
            "patientName": patient_name,
            "departmentId": str(instance.department_id),
            "department": _camel_department(instance.department),
            "departmentName": department_name,
            "procedureTypeId": str(instance.procedure_type_id)
            if instance.procedure_type_id
            else None,
            "procedureType": _camel_procedure(instance.procedure_type),
            "procedureTypeName": procedure_type_name,
            "icdCode": instance.icd_code or "",
            "icdDiagnosisId": str(instance.icd_diagnosis_id) if instance.icd_diagnosis_id else None,
            "icdDiagnosisName": icd_name,
            "planItemId": str(instance.plan_item_id) if instance.plan_item_id else None,
            "diagnosis": instance.diagnosis or "",
            "description": instance.description or "",
            "price": str(instance.price),
            "originalPrice": str(instance.original_price) if instance.original_price is not None else str(instance.price),
            "discountPercent": str(instance.discount_percent) if instance.discount_percent is not None else "0.00",
            "discountReason": instance.discount_reason or "",
            "approvalStatus": instance.approval_status,
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
        teeth = validated_data.pop("teeth", None)
        surfaces = validated_data.pop("surfaces", None)
        try:
            treatment = create_treatment(
                doctor=validated_data["doctor"],
                patient=validated_data["patient"],
                department=validated_data["department"],
                procedure_type=validated_data.get("procedure_type"),
                appointment=validated_data.get("appointment"),
                icd_code=validated_data.get("icd_code", "") or "",
                icd_diagnosis=validated_data.get("icd_diagnosis"),
                plan_item=validated_data.get("plan_item"),
                diagnosis=validated_data.get("diagnosis", "") or "",
                description=validated_data.get("description", "") or "",
                price=validated_data.get("price"),
                surfaces=surfaces,
                payment_status=validated_data.get(
                    "payment_status", PaymentStatus.UNPAID
                ),
                stage=validated_data.get("stage", TreatmentStage.IN_PROGRESS),
                created_by=actor,
            )
            if teeth:
                try:
                    from apps.odontogram.services import create_tooth_record
                    proc_name = getattr(treatment.procedure_type, "name", None) if treatment.procedure_type else None
                    tooth_proc = _map_procedure_to_tooth_procedure(proc_name)
                    for t_num in teeth:
                        try:
                            create_tooth_record(
                                treatment=treatment,
                                tooth_number=t_num,
                                procedure=tooth_proc,
                                surfaces=surfaces or [],
                                status_value="treated" if treatment.stage == TreatmentStage.COMPLETED else "planned",
                                notes=f"Muolaja: {treatment.diagnosis or ''}".strip(),
                            )
                        except Exception:
                            pass
                except Exception:
                    pass
            return treatment
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
                icd_code=validated_data.get("icd_code"),
                icd_diagnosis=validated_data["icd_diagnosis"]
                if "icd_diagnosis" in validated_data
                else ...,
                plan_item=validated_data["plan_item"]
                if "plan_item" in validated_data
                else ...,
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


# ---------------------------------------------------------------------------
# ICD-10 Serializer
# ---------------------------------------------------------------------------
class ICD10DiagnosisSerializer(serializers.ModelSerializer):
    """Read-only serializer for standard ICD-10 dental diagnoses."""

    class Meta:
        model = ICD10Diagnosis
        fields = ("id", "code", "name_uz", "name_ru", "category", "is_common")

    def to_representation(self, instance: ICD10Diagnosis) -> dict[str, Any]:
        return {
            "id": str(instance.id),
            "code": instance.code,
            "nameUz": instance.name_uz,
            "nameRu": instance.name_ru,
            "category": instance.category,
            "isCommon": instance.is_common,
        }


# ---------------------------------------------------------------------------
# TreatmentPlanItem & TreatmentPlan Serializers
# ---------------------------------------------------------------------------
class TreatmentPlanItemSerializer(serializers.ModelSerializer):
    order = serializers.IntegerField(required=False, default=1)
    title = serializers.CharField(max_length=250)
    estimated_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, default=Decimal("0.00")
    )
    status = serializers.ChoiceField(
        choices=PlanItemStatus.choices, required=False, default=PlanItemStatus.PLANNED
    )
    tooth_number = serializers.IntegerField(required=False, allow_null=True)
    procedure_type = serializers.PrimaryKeyRelatedField(
        queryset=ProcedureType.objects.all(), required=False, allow_null=True
    )
    notes = serializers.CharField(required=False, allow_blank=True, default="")

    class Meta:
        model = TreatmentPlanItem
        fields = (
            "id",
            "plan",
            "tooth_number",
            "procedure_type",
            "order",
            "title",
            "estimated_price",
            "status",
            "completed_treatment",
            "notes",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    _CAMEL_TO_SNAKE = {
        "toothNumber": "tooth_number",
        "procedureTypeId": "procedure_type",
        "procedureType": "procedure_type",
        "estimatedPrice": "estimated_price",
        "completedTreatmentId": "completed_treatment",
        "planId": "plan",
    }

    def to_internal_value(self, data: Any) -> dict[str, Any]:
        if isinstance(data, dict):
            normalised = {**data}
            for camel, snake in self._CAMEL_TO_SNAKE.items():
                if camel in normalised and snake not in normalised:
                    normalised[snake] = normalised[camel]
            data = normalised
        return super().to_internal_value(data)

    def to_representation(self, instance: TreatmentPlanItem) -> dict[str, Any]:
        return {
            "id": str(instance.id),
            "planId": str(instance.plan_id),
            "toothNumber": instance.tooth_number,
            "procedureTypeId": str(instance.procedure_type_id) if instance.procedure_type_id else None,
            "procedureTypeName": instance.procedure_type.name if instance.procedure_type else "",
            "order": instance.order,
            "title": instance.title,
            "estimatedPrice": str(instance.estimated_price),
            "status": instance.status,
            "completedTreatmentId": str(instance.completed_treatment_id) if instance.completed_treatment_id else None,
            "notes": instance.notes or "",
            "createdAt": instance.created_at.isoformat() if instance.created_at else None,
            "updatedAt": instance.updated_at.isoformat() if instance.updated_at else None,
        }

    def create(self, validated_data: dict[str, Any]) -> TreatmentPlanItem:
        try:
            return create_treatment_plan_item(
                plan=validated_data["plan"],
                title=validated_data["title"],
                tooth_number=validated_data.get("tooth_number"),
                procedure_type=validated_data.get("procedure_type"),
                order=validated_data.get("order", 1),
                estimated_price=validated_data.get("estimated_price", Decimal("0.00")),
                status=validated_data.get("status", PlanItemStatus.PLANNED),
                notes=validated_data.get("notes", ""),
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                exc.message_dict if hasattr(exc, "message_dict") else list(exc.messages)
            ) from exc

    def update(self, instance: TreatmentPlanItem, validated_data: dict[str, Any]) -> TreatmentPlanItem:
        try:
            return update_treatment_plan_item(
                instance,
                title=validated_data.get("title"),
                tooth_number=validated_data["tooth_number"] if "tooth_number" in validated_data else "__unset__",
                procedure_type=validated_data["procedure_type"] if "procedure_type" in validated_data else "__unset__",
                order=validated_data.get("order"),
                estimated_price=validated_data.get("estimated_price"),
                status=validated_data.get("status"),
                notes=validated_data.get("notes"),
                completed_treatment=validated_data["completed_treatment"] if "completed_treatment" in validated_data else "__unset__",
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                exc.message_dict if hasattr(exc, "message_dict") else list(exc.messages)
            ) from exc


class TreatmentPlanSerializer(serializers.ModelSerializer):
    items = TreatmentPlanItemSerializer(many=True, required=False)
    title = serializers.CharField(max_length=250, required=False, default="Kompleks davolash rejasi")
    status = serializers.ChoiceField(choices=PlanStatus.choices, required=False, default=PlanStatus.PROPOSED)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    discount_percent = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, default=Decimal("0.00"))

    class Meta:
        model = TreatmentPlan
        fields = (
            "id",
            "patient",
            "doctor",
            "title",
            "status",
            "notes",
            "discount_percent",
            "items",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    _CAMEL_TO_SNAKE = {
        "patientId": "patient",
        "doctorId": "doctor",
        "discountPercent": "discount_percent",
    }

    def to_internal_value(self, data: Any) -> dict[str, Any]:
        if isinstance(data, dict):
            normalised = {**data}
            for camel, snake in self._CAMEL_TO_SNAKE.items():
                if camel in normalised and snake not in normalised:
                    normalised[snake] = normalised[camel]
            data = normalised
        return super().to_internal_value(data)

    def to_representation(self, instance: TreatmentPlan) -> dict[str, Any]:
        items_data = [
            TreatmentPlanItemSerializer(item).data
            for item in instance.items.filter(is_active=True).order_by("order", "created_at")
        ]
        patient_name = f"{instance.patient.first_name} {instance.patient.last_name}".strip() if instance.patient else ""
        doctor_name = (
            f"Dr. {instance.doctor.user.first_name} {instance.doctor.user.last_name}".strip()
            if instance.doctor and hasattr(instance.doctor, "user") and instance.doctor.user
            else ""
        )

        return {
            "id": str(instance.id),
            "patientId": str(instance.patient_id),
            "patientName": patient_name,
            "doctorId": str(instance.doctor_id),
            "doctorName": doctor_name,
            "title": instance.title,
            "status": instance.status,
            "notes": instance.notes or "",
            "discountPercent": str(instance.discount_percent),
            "totalEstimatedPrice": str(instance.total_estimated_price),
            "finalPriceWithDiscount": str(instance.final_price_with_discount),
            "items": items_data,
            "createdAt": instance.created_at.isoformat() if instance.created_at else None,
            "updatedAt": instance.updated_at.isoformat() if instance.updated_at else None,
        }

    def create(self, validated_data: dict[str, Any]) -> TreatmentPlan:
        request = self.context.get("request")
        actor = getattr(request, "user", None) if request is not None else None
        items_data = validated_data.pop("items", None)
        try:
            return create_treatment_plan(
                patient=validated_data["patient"],
                doctor=validated_data["doctor"],
                title=validated_data.get("title", "Kompleks davolash rejasi"),
                status=validated_data.get("status", PlanStatus.PROPOSED),
                notes=validated_data.get("notes", ""),
                discount_percent=validated_data.get("discount_percent", Decimal("0.00")),
                items_data=items_data,
                created_by=actor,
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                exc.message_dict if hasattr(exc, "message_dict") else list(exc.messages)
            ) from exc

    def update(self, instance: TreatmentPlan, validated_data: dict[str, Any]) -> TreatmentPlan:
        validated_data.pop("items", None)
        try:
            return update_treatment_plan(
                instance,
                title=validated_data.get("title"),
                status=validated_data.get("status"),
                notes=validated_data.get("notes"),
                discount_percent=validated_data.get("discount_percent"),
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                exc.message_dict if hasattr(exc, "message_dict") else list(exc.messages)
            ) from exc


__all__ = [
    "TreatmentSerializer",
    "TreatmentPhotoSerializer",
    "TreatmentPhotoUploadSerializer",
    "ICD10DiagnosisSerializer",
    "TreatmentPlanSerializer",
    "TreatmentPlanItemSerializer",
]
