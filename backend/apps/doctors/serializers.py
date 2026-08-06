"""DRF serializers for the ``doctors`` app.

Response payloads are camelCase to match the frontend TS interfaces.
Writes delegate to :mod:`apps.doctors.services` so business rules stay
in a single place.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers

from apps.departments.models import Department

from .models import (
    CommissionBasis,
    DoctorProfile,
    ProcedureType,
    TimeOff,
    Weekday,
    WorkingHours,
)
from .services import (
    DOCTOR_ELIGIBLE_ROLES,
    create_doctor_profile,
    create_procedure_type,
    create_time_off,
    create_working_hours,
    update_doctor_profile,
    update_procedure_type,
)

User = get_user_model()


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
        "role": getattr(user, "role", None),
    }


def _dec_to_str(value: Decimal | None) -> str | None:
    if value is None:
        return None
    return f"{Decimal(value):.2f}"


def _raise_validation(exc: DjangoValidationError):
    payload = (
        exc.message_dict
        if hasattr(exc, "message_dict")
        else list(exc.messages)
    )
    raise serializers.ValidationError(payload) from exc


# ===========================================================================
# WorkingHours
# ===========================================================================
class WorkingHoursSerializer(serializers.ModelSerializer):
    weekday = serializers.IntegerField(min_value=0, max_value=6)
    start_time = serializers.TimeField()
    end_time = serializers.TimeField()

    class Meta:
        model = WorkingHours
        fields = ("id", "weekday", "start_time", "end_time")
        read_only_fields = ("id",)

    def to_representation(self, instance: WorkingHours) -> dict[str, Any]:
        return {
            "id": str(instance.id),
            "doctorId": str(instance.doctor_id),
            "weekday": instance.weekday,
            "weekdayLabel": Weekday(instance.weekday).label,
            "startTime": instance.start_time.strftime("%H:%M"),
            "endTime": instance.end_time.strftime("%H:%M"),
        }

    def create(self, validated_data: dict[str, Any]) -> WorkingHours:
        doctor: DoctorProfile | None = self.context.get("doctor")
        if doctor is None:
            raise serializers.ValidationError({"doctor": ["Shifokor kontekstda topilmadi."]})
        try:
            return create_working_hours(
                doctor=doctor,
                weekday=validated_data["weekday"],
                start_time=validated_data["start_time"],
                end_time=validated_data["end_time"],
            )
        except DjangoValidationError as exc:
            _raise_validation(exc)


# ===========================================================================
# TimeOff
# ===========================================================================
class TimeOffSerializer(serializers.ModelSerializer):
    date_start = serializers.DateField()
    date_end = serializers.DateField()
    reason = serializers.CharField(allow_blank=True, required=False, default="")

    class Meta:
        model = TimeOff
        fields = ("id", "date_start", "date_end", "reason")
        read_only_fields = ("id",)

    def to_representation(self, instance: TimeOff) -> dict[str, Any]:
        return {
            "id": str(instance.id),
            "doctorId": str(instance.doctor_id),
            "dateStart": instance.date_start.isoformat(),
            "dateEnd": instance.date_end.isoformat(),
            "reason": instance.reason or "",
        }

    def to_internal_value(self, data: Any) -> dict[str, Any]:
        if isinstance(data, dict):
            data = {**data}
            for camel, snake in (("dateStart", "date_start"), ("dateEnd", "date_end")):
                if camel in data and snake not in data:
                    data[snake] = data[camel]
        return super().to_internal_value(data)

    def create(self, validated_data: dict[str, Any]) -> TimeOff:
        doctor: DoctorProfile | None = self.context.get("doctor")
        if doctor is None:
            raise serializers.ValidationError({"doctor": ["Shifokor kontekstda topilmadi."]})
        try:
            return create_time_off(
                doctor=doctor,
                date_start=validated_data["date_start"],
                date_end=validated_data["date_end"],
                reason=validated_data.get("reason", ""),
            )
        except DjangoValidationError as exc:
            _raise_validation(exc)


# ===========================================================================
# DoctorProfile
# ===========================================================================
class DoctorInputUserSerializer(serializers.Serializer):
    """Nested payload for creating a new doctor + user together."""

    phone_number = serializers.CharField(max_length=20)
    first_name = serializers.CharField(max_length=100)
    last_name = serializers.CharField(max_length=100)
    role = serializers.ChoiceField(
        choices=[
            (User.Role.DOCTOR, User.Role.DOCTOR.label),
            (User.Role.BOSH_SHIFOKOR, User.Role.BOSH_SHIFOKOR.label),
        ],
        default=User.Role.DOCTOR,
    )
    password = serializers.CharField(min_length=8, write_only=True)


class DoctorProfileSerializer(serializers.ModelSerializer):
    """Full serializer for :class:`DoctorProfile` (read + write)."""

    user_id = serializers.UUIDField(required=False, write_only=True)
    user = DoctorInputUserSerializer(required=False, write_only=True)
    department_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        allow_empty=True,
        write_only=True,
    )
    specialization = serializers.CharField(
        required=False, allow_blank=True, default=""
    )
    bio = serializers.CharField(required=False, allow_blank=True, default="")
    commission_basis = serializers.ChoiceField(
        choices=CommissionBasis.choices, required=False
    )
    default_commission_rate = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False
    )
    can_view_other_doctors = serializers.BooleanField(required=False)
    is_active = serializers.BooleanField(required=False)

    class Meta:
        model = DoctorProfile
        fields = (
            "id",
            "user_id",
            "user",
            "department_ids",
            "specialization",
            "bio",
            "commission_basis",
            "default_commission_rate",
            "can_view_other_doctors",
            "is_active",
        )
        read_only_fields = ("id",)

    # ------------------------------------------------------------------
    # Input normalisation (accept camelCase aliases)
    # ------------------------------------------------------------------
    _CAMEL_ALIASES = {
        "userId": "user_id",
        "departmentIds": "department_ids",
        "commissionBasis": "commission_basis",
        "defaultCommissionRate": "default_commission_rate",
        "canViewOtherDoctors": "can_view_other_doctors",
        "firstName": "first_name",
        "lastName": "last_name",
        "phoneNumber": "phone_number",
        "isActive": "is_active",
    }

    def to_internal_value(self, data: Any) -> dict[str, Any]:
        if isinstance(data, dict):
            data = {**data}
            for camel, snake in self._CAMEL_ALIASES.items():
                if camel in data and snake not in data:
                    data[snake] = data[camel]
            if isinstance(data.get("user"), dict):
                user_data = {**data["user"]}
                for camel, snake in self._CAMEL_ALIASES.items():
                    if camel in user_data and snake not in user_data:
                        user_data[snake] = user_data[camel]
                data["user"] = user_data
        return super().to_internal_value(data)

    # ------------------------------------------------------------------
    # Output shape (camelCase)
    # ------------------------------------------------------------------
    def to_representation(self, instance: DoctorProfile) -> dict[str, Any]:
        departments = [
            {"id": str(dept.id), "name": dept.name}
            for dept in instance.departments.all()
        ]
        working_hours = [
            WorkingHoursSerializer(wh).data
            for wh in instance.working_hours.all()
        ]
        return {
            "id": str(instance.id),
            "user": _camel_user(instance.user),
            "departments": departments,
            "specialization": instance.specialization or "",
            "bio": instance.bio or "",
            "commissionBasis": instance.commission_basis,
            "defaultCommissionRate": _dec_to_str(instance.default_commission_rate),
            "canViewOtherDoctors": bool(instance.can_view_other_doctors),
            "isActive": instance.is_active,
            "workingHours": working_hours,
            "createdAt": instance.created_at.isoformat() if instance.created_at else None,
            "updatedAt": instance.updated_at.isoformat() if instance.updated_at else None,
        }

    # ------------------------------------------------------------------
    # Create — either link an existing user or create a fresh one
    # ------------------------------------------------------------------
    @transaction.atomic
    def create(self, validated_data: dict[str, Any]) -> DoctorProfile:
        user_payload = validated_data.pop("user", None)
        user_id = validated_data.pop("user_id", None)
        department_ids = validated_data.pop("department_ids", None)

        try:
            user = self._resolve_or_create_user(user_id=user_id, payload=user_payload)
        except DjangoValidationError as exc:
            _raise_validation(exc)

        try:
            return create_doctor_profile(
                user=user,
                department_ids=department_ids,
                specialization=validated_data.get("specialization", ""),
                bio=validated_data.get("bio", ""),
                commission_basis=validated_data.get(
                    "commission_basis", CommissionBasis.FROM_TOTAL
                ),
                default_commission_rate=validated_data.get(
                    "default_commission_rate", Decimal("30.00")
                ),
                can_view_other_doctors=validated_data.get(
                    "can_view_other_doctors", False
                ),
            )
        except DjangoValidationError as exc:
            _raise_validation(exc)

    @staticmethod
    def _resolve_or_create_user(
        *, user_id: Any, payload: dict[str, Any] | None
    ) -> User:
        if user_id is not None:
            try:
                user = User.objects.get(pk=user_id)
            except User.DoesNotExist as exc:
                raise DjangoValidationError(
                    {"user_id": ["Foydalanuvchi topilmadi."]}
                ) from exc
            if user.role not in DOCTOR_ELIGIBLE_ROLES:
                raise DjangoValidationError(
                    {
                        "user_id": [
                            "Foydalanuvchi bosh_shifokor yoki doctor rolida bo'lishi kerak."
                        ]
                    }
                )
            return user

        if not payload:
            raise DjangoValidationError(
                {"user": ["Foydalanuvchi ma'lumotlarini yoki mavjud user_id yuboring."]}
            )

        phone = payload["phone_number"]
        first_name = payload["first_name"]
        last_name = payload["last_name"]
        password = payload["password"]
        role = payload.get("role", User.Role.DOCTOR)

        if User.objects.filter(phone_number=phone).exists():
            raise DjangoValidationError(
                {"user": {"phone_number": ["Bu telefon raqami allaqachon band."]}}
            )

        user = User.objects.create_user(
            phone_number=phone,
            password=password,
            first_name=first_name,
            last_name=last_name,
            role=role,
        )
        return user

    # ------------------------------------------------------------------
    # Update
    # ------------------------------------------------------------------
    @transaction.atomic
    def update(
        self, instance: DoctorProfile, validated_data: dict[str, Any]
    ) -> DoctorProfile:
        validated_data.pop("user", None)
        validated_data.pop("user_id", None)
        department_ids = validated_data.pop("department_ids", None)

        try:
            return update_doctor_profile(
                instance,
                specialization=validated_data.get("specialization"),
                bio=validated_data.get("bio"),
                commission_basis=validated_data.get("commission_basis"),
                default_commission_rate=validated_data.get("default_commission_rate"),
                can_view_other_doctors=validated_data.get("can_view_other_doctors"),
                department_ids=department_ids,
                is_active=validated_data.get("is_active"),
            )
        except DjangoValidationError as exc:
            _raise_validation(exc)


# ===========================================================================
# ProcedureType
# ===========================================================================
class ProcedureTypeSerializer(serializers.ModelSerializer):
    department_id = serializers.UUIDField(write_only=True)
    name = serializers.CharField(max_length=150)
    default_duration_minutes = serializers.IntegerField(required=False, min_value=1)
    default_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False
    )
    commission_rate_override = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, allow_null=True
    )
    is_active = serializers.BooleanField(required=False)

    class Meta:
        model = ProcedureType
        fields = (
            "id",
            "name",
            "department_id",
            "default_duration_minutes",
            "default_price",
            "commission_rate_override",
            "is_active",
        )
        read_only_fields = ("id",)

    _CAMEL_ALIASES = {
        "departmentId": "department_id",
        "defaultDurationMinutes": "default_duration_minutes",
        "defaultPrice": "default_price",
        "commissionRateOverride": "commission_rate_override",
        "isActive": "is_active",
    }

    def to_internal_value(self, data: Any) -> dict[str, Any]:
        if isinstance(data, dict):
            data = {**data}
            for camel, snake in self._CAMEL_ALIASES.items():
                if camel in data and snake not in data:
                    data[snake] = data[camel]
        return super().to_internal_value(data)

    def to_representation(self, instance: ProcedureType) -> dict[str, Any]:
        return {
            "id": str(instance.id),
            "name": instance.name,
            "department": {
                "id": str(instance.department_id),
                "name": instance.department.name if instance.department_id else None,
            },
            "defaultDurationMinutes": instance.default_duration_minutes,
            "defaultPrice": _dec_to_str(instance.default_price),
            "commissionRateOverride": _dec_to_str(instance.commission_rate_override),
            "isActive": instance.is_active,
            "createdAt": instance.created_at.isoformat() if instance.created_at else None,
            "updatedAt": instance.updated_at.isoformat() if instance.updated_at else None,
        }

    @transaction.atomic
    def create(self, validated_data: dict[str, Any]) -> ProcedureType:
        department = self._get_department(validated_data.pop("department_id"))
        try:
            return create_procedure_type(
                name=validated_data["name"],
                department=department,
                default_duration_minutes=validated_data.get(
                    "default_duration_minutes", 30
                ),
                default_price=validated_data.get("default_price", Decimal("0.00")),
                commission_rate_override=validated_data.get(
                    "commission_rate_override"
                ),
            )
        except DjangoValidationError as exc:
            _raise_validation(exc)

    @transaction.atomic
    def update(
        self, instance: ProcedureType, validated_data: dict[str, Any]
    ) -> ProcedureType:
        department = None
        if "department_id" in validated_data:
            department = self._get_department(validated_data.pop("department_id"))
        try:
            override_sentinel = validated_data.get(
                "commission_rate_override", "__unset__"
            )
            return update_procedure_type(
                instance,
                name=validated_data.get("name"),
                department=department,
                default_duration_minutes=validated_data.get(
                    "default_duration_minutes"
                ),
                default_price=validated_data.get("default_price"),
                commission_rate_override=override_sentinel,
                is_active=validated_data.get("is_active"),
            )
        except DjangoValidationError as exc:
            _raise_validation(exc)

    @staticmethod
    def _get_department(department_id: Any) -> Department:
        try:
            return Department.objects.get(pk=department_id)
        except Department.DoesNotExist as exc:
            raise serializers.ValidationError(
                {"department_id": ["Bo'lim topilmadi."]}
            ) from exc


# ===========================================================================
# Available slots response
# ===========================================================================
class SlotSerializer(serializers.Serializer):
    """One available appointment slot."""

    start = serializers.DateTimeField()
    end = serializers.DateTimeField()


class AvailableSlotsResponseSerializer(serializers.Serializer):
    doctorId = serializers.UUIDField()  # noqa: N815 - camelCase API contract
    date = serializers.DateField()
    slots = SlotSerializer(many=True)


__all__ = [
    "WorkingHoursSerializer",
    "TimeOffSerializer",
    "DoctorProfileSerializer",
    "ProcedureTypeSerializer",
    "SlotSerializer",
    "AvailableSlotsResponseSerializer",
]
