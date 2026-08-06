"""Write-side business logic for the ``patients`` app.

Views delegate every write to a function in this module so business
rules (validation, phone normalisation, audit fields, soft-delete) live
in one place and are trivially unit-testable without HTTP.
"""
from __future__ import annotations

from typing import Any

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction

from apps.accounts.models import normalise_phone_number

from .models import Patient

User = get_user_model()


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------
def _clean_name(value: Any, *, field: str, label: str) -> str:
    """Trim and validate a required name-like field."""
    if value is None:
        raise ValidationError({field: [f"{label} majburiy."]})
    cleaned = " ".join(str(value).split())
    if not cleaned:
        raise ValidationError({field: [f"{label} majburiy."]})
    if len(cleaned) > 100:
        raise ValidationError({field: [f"{label} 100 belgidan uzun bo'lmasin."]})
    return cleaned


def _clean_optional_text(value: Any, *, max_length: int) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if len(text) > max_length:
        raise ValidationError(
            {"detail": [f"Matn {max_length} belgidan uzun bo'lmasin."]}
        )
    return text


def _clean_gender(value: Any) -> str | None:
    if value in (None, ""):
        return None
    text = str(value).strip().lower()
    if text not in Patient.Gender.values:
        raise ValidationError(
            {"gender": [f"Noto'g'ri jins qiymati: {value!r}."]}
        )
    return text


def _clean_telegram_chat_id(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError(
            {"telegram_chat_id": ["Telegram chat ID butun son bo'lishi kerak."]}
        ) from exc


def _clean_phone(value: Any) -> str:
    try:
        return normalise_phone_number(value)
    except ValidationError as exc:
        raise ValidationError({"phone_number": list(exc.messages)}) from exc


def _assert_unique_phone(phone: str, *, exclude_id: Any = None) -> None:
    qs = Patient.objects.filter(phone_number=phone, is_active=True)
    if exclude_id is not None:
        qs = qs.exclude(pk=exclude_id)
    if qs.exists():
        raise ValidationError(
            {"phone_number": [f"'{phone}' raqamli bemor allaqachon ro'yxatda."]}
        )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
@transaction.atomic
def create_patient(
    *,
    first_name: str,
    last_name: str,
    phone_number: str,
    gender: str | None = None,
    address: str = "",
    notes: str = "",
    telegram_chat_id: Any = None,
    created_by: Any = None,
) -> Patient:
    """Register a new active patient.

    Raises:
        :class:`django.core.exceptions.ValidationError` for empty
        required fields, malformed phone, or duplicate active phone.
    """
    first = _clean_name(first_name, field="first_name", label="Ism")
    last = _clean_name(last_name, field="last_name", label="Familiya")
    phone = _clean_phone(phone_number)
    _assert_unique_phone(phone)

    try:
        patient = Patient.objects.create(
            first_name=first,
            last_name=last,
            phone_number=phone,
            gender=_clean_gender(gender),
            address=_clean_optional_text(address, max_length=500),
            notes=_clean_optional_text(notes, max_length=5000),
            telegram_chat_id=_clean_telegram_chat_id(telegram_chat_id),
            created_by=created_by if isinstance(created_by, User) else None,
            is_active=True,
        )
    except IntegrityError as exc:
        # Race condition — another request created the same phone in
        # between our uniqueness check and the INSERT.
        raise ValidationError(
            {"phone_number": ["Bu telefon raqami allaqachon ro'yxatda (DB constraint)."]}
        ) from exc
    return patient


@transaction.atomic
def update_patient(
    patient: Patient,
    *,
    first_name: str | None = None,
    last_name: str | None = None,
    phone_number: str | None = None,
    gender: Any = ...,  # sentinel: allow explicit ``None`` to clear
    address: str | None = None,
    notes: str | None = None,
    telegram_chat_id: Any = ...,
    is_active: bool | None = None,
) -> Patient:
    """Partial update — only kwargs that were passed are touched."""
    update_fields: list[str] = []

    if first_name is not None:
        patient.first_name = _clean_name(
            first_name, field="first_name", label="Ism"
        )
        update_fields.append("first_name")

    if last_name is not None:
        patient.last_name = _clean_name(
            last_name, field="last_name", label="Familiya"
        )
        update_fields.append("last_name")

    if phone_number is not None:
        phone = _clean_phone(phone_number)
        _assert_unique_phone(phone, exclude_id=patient.pk)
        patient.phone_number = phone
        update_fields.append("phone_number")

    if gender is not ...:
        patient.gender = _clean_gender(gender)
        update_fields.append("gender")

    if address is not None:
        patient.address = _clean_optional_text(address, max_length=500)
        update_fields.append("address")

    if notes is not None:
        patient.notes = _clean_optional_text(notes, max_length=5000)
        update_fields.append("notes")

    if telegram_chat_id is not ...:
        patient.telegram_chat_id = _clean_telegram_chat_id(telegram_chat_id)
        update_fields.append("telegram_chat_id")

    if is_active is not None:
        patient.is_active = bool(is_active)
        update_fields.append("is_active")

    if update_fields:
        patient.save(update_fields=update_fields + ["updated_at"])
    return patient


@transaction.atomic
def soft_delete_patient(patient: Patient) -> Patient:
    """Soft-delete: hide the patient from active queries.

    Full deletion is refused because appointments, treatments, and
    payments FK back to the patient row and the audit log must survive.
    """
    if patient.is_active:
        patient.is_active = False
        patient.save(update_fields=["is_active", "updated_at"])
    return patient


__all__ = [
    "create_patient",
    "update_patient",
    "soft_delete_patient",
]
