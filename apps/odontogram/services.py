"""Write-side business logic for the ``odontogram`` app.

Rules enforced here:

* ``tooth_number`` must belong to :data:`FDI_VALID_NUMBERS` — even
  though the model has ``MinValueValidator/MaxValueValidator``, those
  alone accept e.g. 19 (invalid). We validate against the explicit
  set to reject *all* invalid FDI numbers.
* ``procedure`` must be one of :class:`ToothProcedure`.
* ``status`` must be one of :class:`ToothStatus` (defaults to ``planned``).
* ``(treatment, tooth_number)`` pair is unique — attempting to create
  a second record for the same tooth on the same treatment raises
  :class:`django.core.exceptions.ValidationError`.

Every public function is transactional so a partial write can never
leave the DB in an inconsistent state.
"""
from __future__ import annotations

from typing import Any

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction

from apps.treatments.models import Treatment

from .models import (
    FDI_VALID_NUMBERS,
    ToothProcedure,
    ToothRecord,
    ToothStatus,
)


# ---------------------------------------------------------------------------
# Cleaners
# ---------------------------------------------------------------------------
def _clean_tooth_number(value: Any) -> int:
    if value in (None, ""):
        raise ValidationError({"tooth_number": ["Tish raqami majburiy."]})
    try:
        number = int(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError(
            {"tooth_number": ["Tish raqami butun son bo'lishi kerak."]}
        ) from exc
    if number not in FDI_VALID_NUMBERS:
        raise ValidationError(
            {
                "tooth_number": [
                    "FDI raqamlari faqat 11–18, 21–28, 31–38, 41–48 "
                    "oralig'ida bo'lishi kerak."
                ]
            }
        )
    return number


def _clean_choice(value: Any, *, choices: type, field: str, default: str | None = None) -> str:
    if value in (None, ""):
        if default is not None:
            return default
        raise ValidationError({field: [f"'{field}' majburiy."]})
    text = str(value).strip().lower()
    if text not in choices.values:
        raise ValidationError({field: [f"Noto'g'ri qiymat: {value!r}."]})
    return text


def _clean_notes(value: Any) -> str:
    if value in (None, ""):
        return ""
    text = str(value).strip()
    if len(text) > 5000:
        raise ValidationError({"notes": ["Izoh 5000 belgidan uzun bo'lmasin."]})
    return text


def _resolve_treatment(treatment: Any) -> Treatment:
    if isinstance(treatment, Treatment):
        return treatment
    try:
        return Treatment.objects.get(pk=treatment)
    except Treatment.DoesNotExist as exc:
        raise ValidationError({"treatment": ["Davolash topilmadi."]}) from exc


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
@transaction.atomic
def create_tooth_record(
    *,
    treatment: Any,
    tooth_number: Any,
    procedure: Any,
    status_value: Any = None,
    notes: Any = "",
) -> ToothRecord:
    """Create a new :class:`ToothRecord` for a treatment.

    Raises :class:`ValidationError` on any invalid input.
    """
    treatment_obj = _resolve_treatment(treatment)

    if not treatment_obj.is_active:
        raise ValidationError(
            {"treatment": ["Yopilgan davolashga tish yozuvi qo'shib bo'lmaydi."]}
        )

    number = _clean_tooth_number(tooth_number)
    procedure_value = _clean_choice(
        procedure, choices=ToothProcedure, field="procedure"
    )
    status_clean = _clean_choice(
        status_value,
        choices=ToothStatus,
        field="status",
        default=ToothStatus.PLANNED,
    )
    notes_clean = _clean_notes(notes)

    try:
        return ToothRecord.objects.create(
            treatment=treatment_obj,
            tooth_number=number,
            procedure=procedure_value,
            status=status_clean,
            notes=notes_clean,
            is_active=True,
        )
    except IntegrityError as exc:
        # Unique (treatment, tooth_number) violation → surface as a
        # validation error the API layer already knows how to render.
        raise ValidationError(
            {
                "tooth_number": [
                    "Ushbu davolashda bu tish uchun yozuv allaqachon mavjud."
                ]
            }
        ) from exc


@transaction.atomic
def update_tooth_record(
    record: ToothRecord,
    *,
    procedure: Any = ...,
    status_value: Any = ...,
    notes: Any = ...,
    tooth_number: Any = ...,
    is_active: bool | None = None,
) -> ToothRecord:
    """Partial update — only the kwargs actually passed are touched."""
    updated: list[str] = []

    if procedure is not ...:
        record.procedure = _clean_choice(
            procedure, choices=ToothProcedure, field="procedure"
        )
        updated.append("procedure")

    if status_value is not ...:
        record.status = _clean_choice(
            status_value,
            choices=ToothStatus,
            field="status",
            default=ToothStatus.PLANNED,
        )
        updated.append("status")

    if notes is not ...:
        record.notes = _clean_notes(notes)
        updated.append("notes")

    if tooth_number is not ...:
        record.tooth_number = _clean_tooth_number(tooth_number)
        updated.append("tooth_number")

    if is_active is not None:
        record.is_active = bool(is_active)
        updated.append("is_active")

    if updated:
        try:
            record.save(update_fields=updated + ["updated_at"])
        except IntegrityError as exc:
            raise ValidationError(
                {
                    "tooth_number": [
                        "Ushbu davolashda bu tish uchun yozuv allaqachon mavjud."
                    ]
                }
            ) from exc

    return record


@transaction.atomic
def soft_delete_tooth_record(record: ToothRecord) -> ToothRecord:
    if record.is_active:
        record.is_active = False
        record.save(update_fields=["is_active", "updated_at"])
    return record


@transaction.atomic
def clone_last_odontogram_state(target_treatment: Treatment) -> list[ToothRecord]:
    """Clone the latest tooth record state for each tooth of the patient into the target treatment.

    Excludes the target treatment itself from the source records to avoid self-cloning.
    """
    from .selectors import latest_records_by_tooth

    patient_id = target_treatment.patient_id
    latest_records = latest_records_by_tooth(patient_id)

    cloned: list[ToothRecord] = []
    for tooth_number, src_record in latest_records.items():
        # Do not clone if it belongs to the target treatment itself (already exists)
        if src_record.treatment_id == target_treatment.id:
            continue

        # Skip if a record for this tooth already exists on the target treatment
        if ToothRecord.objects.filter(
            treatment=target_treatment, tooth_number=tooth_number, is_active=True
        ).exists():
            continue

        rec = ToothRecord.objects.create(
            treatment=target_treatment,
            tooth_number=tooth_number,
            procedure=src_record.procedure,
            status=src_record.status,
            notes=src_record.notes or "",
            is_active=True,
        )
        cloned.append(rec)
    return cloned


__all__ = [
    "create_tooth_record",
    "update_tooth_record",
    "soft_delete_tooth_record",
    "clone_last_odontogram_state",
]
