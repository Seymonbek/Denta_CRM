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
    FDI_ALL_NUMBERS,
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
    if number not in FDI_ALL_NUMBERS:
        raise ValidationError(
            {
                "tooth_number": [
                    "FDI raqamlari 11–48 (doimiy) yoki 51–85 (sut tishlari) "
                    "oralig'ida bo'lishi kerak."
                ]
            }
        )
    return number


def _clean_surfaces(value: Any) -> list[str]:
    if not value:
        return []
    valid = {"O", "M", "D", "V", "B", "L", "P"}
    if isinstance(value, str):
        parts = [p.strip().upper() for p in value.replace(",", " ").split() if p.strip()]
    elif isinstance(value, (list, tuple)):
        parts = [str(p).strip().upper() for p in value if p]
    else:
        parts = []
    return [p for p in parts if p in valid]


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


def _resolve_treatment(treatment: Any) -> Treatment | None:
    if treatment in (None, ""):
        return None
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
    tooth_number: Any,
    procedure: Any,
    treatment: Any = None,
    patient: Any = None,
    surfaces: Any = None,
    status_value: Any = None,
    notes: Any = "",
) -> ToothRecord:
    """Create or update a :class:`ToothRecord` for a treatment or patient baseline."""
    treatment_obj = _resolve_treatment(treatment)

    if treatment_obj and not treatment_obj.is_active:
        raise ValidationError(
            {"treatment": ["Yopilgan davolashga tish yozuvi qo'shib bo'lmaydi."]}
        )

    resolved_patient_id = None
    if treatment_obj:
        resolved_patient_id = treatment_obj.patient_id
    elif patient:
        resolved_patient_id = getattr(patient, "pk", patient)

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
    surfaces_clean = _clean_surfaces(surfaces)

    if treatment_obj:
        if ToothRecord.objects.filter(
            treatment=treatment_obj, tooth_number=number, is_active=True
        ).exists():
            raise ValidationError(
                {"tooth_number": ["Ushbu tish uchun yozuv bu davolashda allaqachon mavjud."]}
            )
        return ToothRecord.objects.create(
            treatment=treatment_obj,
            patient_id=resolved_patient_id,
            tooth_number=number,
            procedure=procedure_value,
            status=status_clean,
            surfaces=surfaces_clean,
            notes=notes_clean,
            is_active=True,
        )

    record, _ = ToothRecord.objects.update_or_create(
        patient_id=resolved_patient_id,
        tooth_number=number,
        treatment__isnull=True,
        defaults={
            "procedure": procedure_value,
            "status": status_clean,
            "surfaces": surfaces_clean,
            "notes": notes_clean,
            "is_active": True,
        },
    )
    return record


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
