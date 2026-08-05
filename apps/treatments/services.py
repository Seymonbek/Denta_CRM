"""Write-side business logic for the ``treatments`` app.

Rules enforced here (per PROJECT_BRIEF § "treatments app"):

* ``doctor.departments`` must include ``department`` (so a doctor can
  only treat under a department they belong to).
* ``procedure_type.department`` (if provided) must match the treatment
  department — prevents mis-classified statistics.
* ``appointment`` (if provided) must reference the same patient and
  doctor — you can't attach a treatment to someone else's appointment.
* ``price`` must be non-negative. Defaults to the procedure_type's
  ``default_price`` when omitted.
* Stage transitions: ``in_progress`` → ``completed`` only. Moving back
  is not supported to keep the audit trail meaningful.

Photo upload validation (T130):

* MIME type must be one of ``image/jpeg``, ``image/png``, ``image/webp``
  — SVG is explicitly rejected because it can carry inline JavaScript.
* File extension must match the allow-list.
* File size must be ≤ ``settings.MAX_PHOTO_MB`` MiB.
* The bytes must open successfully via ``Pillow.Image.verify()`` so
  files with faked headers (extension says .png, bytes are anything
  else) are rejected before they hit storage.
"""
from __future__ import annotations

import os
from decimal import Decimal, InvalidOperation
from io import BytesIO
from typing import Any

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import transaction

from apps.departments.models import Department
from apps.doctors.models import DoctorProfile, ProcedureType
from apps.patients.models import Patient
from apps.scheduling.models import Appointment

from .models import PaymentStatus, PhotoType, Treatment, TreatmentPhoto, TreatmentStage

User = get_user_model()


# ---------------------------------------------------------------------------
# Photo upload constants (T130)
# ---------------------------------------------------------------------------
ALLOWED_PHOTO_MIME_TYPES = frozenset({
    "image/jpeg",
    "image/png",
    "image/webp",
})

ALLOWED_PHOTO_EXTENSIONS = frozenset({
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
})

# Explicitly denied — SVG can carry inline <script>, HEIC/HEIF confuses
# some downstream image processors, GIF is disallowed by product spec.
DENIED_PHOTO_MIME_TYPES = frozenset({
    "image/svg+xml",
    "image/gif",
    "image/heic",
    "image/heif",
    "application/pdf",
    "text/html",
})


# ---------------------------------------------------------------------------
# Photo upload validation (T130)
# ---------------------------------------------------------------------------
def _validate_photo_upload(image: Any) -> None:
    """Enforce MIME / extension / size / Pillow-verify on an uploaded photo.

    Raises :class:`django.core.exceptions.ValidationError` on any
    failure so callers surface a clean 400 via DRF's exception handler.

    Rejected uploads:

    * Size > ``settings.MAX_PHOTO_MB`` MiB (default 8 MiB).
    * MIME type not in :data:`ALLOWED_PHOTO_MIME_TYPES`.
    * Extension not in :data:`ALLOWED_PHOTO_EXTENSIONS`.
    * MIME type in :data:`DENIED_PHOTO_MIME_TYPES` (e.g. SVG, PDF).
    * Bytes fail ``Pillow.Image.verify()`` — catches fake-header
      uploads (extension says .png, bytes are anything else).
    """
    # Local Pillow import so the app boots without Pillow installed
    # in exotic contexts (e.g. plain manage.py check on a fresh clone).
    try:
        from PIL import Image, UnidentifiedImageError
    except ImportError as exc:  # pragma: no cover - installed by base.txt
        raise ValidationError(
            {"image": ["Rasm ishlov beruvchi kutubxona (Pillow) o'rnatilmagan."]}
        ) from exc

    # ---- size --------------------------------------------------------
    max_mb = int(getattr(settings, "MAX_PHOTO_MB", 8))
    max_bytes = max_mb * 1024 * 1024
    size = getattr(image, "size", None)
    if size is not None and size > max_bytes:
        raise ValidationError(
            {"image": [
                f"Rasm hajmi {max_mb} MB dan oshmasligi kerak "
                f"(joriy: {size / (1024 * 1024):.1f} MB)."
            ]}
        )

    # ---- MIME --------------------------------------------------------
    content_type = (
        getattr(image, "content_type", "") or ""
    ).strip().lower()
    # Strip parameters like ``image/jpeg; charset=binary`` that some
    # multipart parsers append.
    if ";" in content_type:
        content_type = content_type.split(";", 1)[0].strip()

    if content_type in DENIED_PHOTO_MIME_TYPES:
        raise ValidationError(
            {"image": [
                f"Bu turdagi fayl ruxsat etilmagan ({content_type})."
            ]}
        )

    if content_type and content_type not in ALLOWED_PHOTO_MIME_TYPES:
        raise ValidationError(
            {"image": [
                "Faqat JPEG, PNG yoki WEBP formatli rasm yuklash mumkin "
                f"(qabul qilindi: {content_type!r})."
            ]}
        )

    # ---- extension ---------------------------------------------------
    filename = getattr(image, "name", "") or ""
    _, ext = os.path.splitext(filename)
    ext = ext.lower()
    if ext and ext not in ALLOWED_PHOTO_EXTENSIONS:
        raise ValidationError(
            {"image": [
                "Fayl kengaytmasi noto'g'ri "
                f"(qabul qilindi: {ext!r}). Ruxsat berilgan: "
                f"{', '.join(sorted(ALLOWED_PHOTO_EXTENSIONS))}."
            ]}
        )

    # ---- Pillow verify ----------------------------------------------
    # verify() consumes the file pointer, so we snapshot the bytes,
    # verify from a copy, then rewind the original for downstream
    # ImageField save.
    read_method = getattr(image, "read", None)
    seek_method = getattr(image, "seek", None)
    if read_method is None:
        return  # non-file-like objects (unusual) skip verify().

    if seek_method is not None:
        try:
            seek_method(0)
        except (OSError, ValueError):
            pass

    try:
        raw = read_method()
    except (OSError, ValueError) as exc:
        raise ValidationError(
            {"image": ["Rasm faylini o'qib bo'lmadi."]}
        ) from exc

    try:
        with Image.open(BytesIO(raw)) as im:
            im.verify()
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError) as exc:
        raise ValidationError(
            {"image": [
                "Fayl haqiqiy rasm emas yoki zararlangan."
            ]}
        ) from exc
    finally:
        # Rewind so the ImageField can persist the bytes.
        if seek_method is not None:
            try:
                seek_method(0)
            except (OSError, ValueError):
                pass



def _clean_text(value: Any, *, max_length: int, field: str) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if len(text) > max_length:
        raise ValidationError(
            {field: [f"Matn {max_length} belgidan uzun bo'lmasin."]}
        )
    return text


def _clean_price(value: Any, *, default: Decimal = Decimal("0.00")) -> Decimal:
    if value in (None, ""):
        return default
    try:
        price = Decimal(str(value))
    except (InvalidOperation, TypeError) as exc:
        raise ValidationError({"price": ["Narx raqam bo'lishi kerak."]}) from exc
    if price < 0:
        raise ValidationError({"price": ["Narx manfiy bo'lishi mumkin emas."]})
    # Normalise to 2dp so DB round-trips are stable in tests.
    return price.quantize(Decimal("0.01"))


def _clean_choice(
    value: Any, *, choices: type, field: str, default: str | None = None
) -> str:
    if value in (None, ""):
        if default is not None:
            return default
        raise ValidationError({field: [f"'{field}' majburiy."]})
    text = str(value).strip().lower()
    if text not in choices.values:
        raise ValidationError({field: [f"Noto'g'ri qiymat: {value!r}."]})
    return text


# ---------------------------------------------------------------------------
# Cross-model consistency
# ---------------------------------------------------------------------------
def _resolve_doctor(doctor: Any) -> DoctorProfile:
    if isinstance(doctor, DoctorProfile):
        return doctor
    try:
        return DoctorProfile.objects.select_related("user").get(pk=doctor)
    except DoctorProfile.DoesNotExist as exc:
        raise ValidationError({"doctor": ["Shifokor topilmadi."]}) from exc


def _resolve_patient(patient: Any) -> Patient:
    if isinstance(patient, Patient):
        return patient
    try:
        return Patient.objects.get(pk=patient)
    except Patient.DoesNotExist as exc:
        raise ValidationError({"patient": ["Bemor topilmadi."]}) from exc


def _resolve_department(department: Any) -> Department:
    if isinstance(department, Department):
        return department
    try:
        return Department.objects.get(pk=department)
    except Department.DoesNotExist as exc:
        raise ValidationError({"department": ["Bo'lim topilmadi."]}) from exc


def _resolve_procedure_type(procedure_type: Any) -> ProcedureType | None:
    if procedure_type in (None, ""):
        return None
    if isinstance(procedure_type, ProcedureType):
        return procedure_type
    try:
        return ProcedureType.objects.select_related("department").get(pk=procedure_type)
    except ProcedureType.DoesNotExist as exc:
        raise ValidationError(
            {"procedure_type": ["Muolaja turi topilmadi."]}
        ) from exc


def _resolve_appointment(appointment: Any) -> Appointment | None:
    if appointment in (None, ""):
        return None
    if isinstance(appointment, Appointment):
        return appointment
    try:
        return Appointment.objects.get(pk=appointment)
    except Appointment.DoesNotExist as exc:
        raise ValidationError(
            {"appointment": ["Navbat topilmadi."]}
        ) from exc


def _assert_consistency(
    *,
    doctor: DoctorProfile,
    patient: Patient,
    department: Department,
    procedure_type: ProcedureType | None,
    appointment: Appointment | None,
) -> None:
    """Cross-object rules that can't be expressed as DB constraints."""
    # Doctor must belong to department.
    if not doctor.departments.filter(pk=department.pk).exists():
        raise ValidationError(
            {"department": [
                "Bu shifokor tanlangan bo'limda ishlamaydi."
            ]}
        )

    # ProcedureType.department must match treatment.department.
    if procedure_type is not None and procedure_type.department_id != department.pk:
        raise ValidationError(
            {"procedure_type": [
                "Muolaja turi tanlangan bo'limga tegishli emas."
            ]}
        )

    # Appointment.patient / .doctor must match.
    if appointment is not None:
        if appointment.patient_id != patient.pk:
            raise ValidationError(
                {"appointment": [
                    "Navbat bemori ushbu davolanish bemori bilan mos kelmaydi."
                ]}
            )
        if appointment.doctor_id != doctor.pk:
            raise ValidationError(
                {"appointment": [
                    "Navbat shifokori ushbu davolanish shifokori bilan mos kelmaydi."
                ]}
            )


# ---------------------------------------------------------------------------
# Public API — Treatment
# ---------------------------------------------------------------------------
@transaction.atomic
def create_treatment(
    *,
    doctor: Any,
    patient: Any,
    department: Any,
    procedure_type: Any = None,
    appointment: Any = None,
    diagnosis: str = "",
    description: str = "",
    price: Any = None,
    payment_status: str = PaymentStatus.UNPAID,
    stage: str = TreatmentStage.IN_PROGRESS,
    created_by: Any = None,
) -> Treatment:
    """Create a new treatment, enforcing cross-object consistency."""
    doctor_obj = _resolve_doctor(doctor)
    patient_obj = _resolve_patient(patient)
    department_obj = _resolve_department(department)
    procedure_obj = _resolve_procedure_type(procedure_type)
    appointment_obj = _resolve_appointment(appointment)

    _assert_consistency(
        doctor=doctor_obj,
        patient=patient_obj,
        department=department_obj,
        procedure_type=procedure_obj,
        appointment=appointment_obj,
    )

    # Default price from procedure type when omitted.
    if price in (None, "") and procedure_obj is not None:
        resolved_price = Decimal(procedure_obj.default_price)
    else:
        resolved_price = _clean_price(price)

    return Treatment.objects.create(
        doctor=doctor_obj,
        patient=patient_obj,
        department=department_obj,
        procedure_type=procedure_obj,
        appointment=appointment_obj,
        diagnosis=_clean_text(diagnosis, max_length=500, field="diagnosis"),
        description=_clean_text(
            description, max_length=10_000, field="description"
        ),
        price=resolved_price,
        payment_status=_clean_choice(
            payment_status,
            choices=PaymentStatus,
            field="payment_status",
            default=PaymentStatus.UNPAID,
        ),
        stage=_clean_choice(
            stage,
            choices=TreatmentStage,
            field="stage",
            default=TreatmentStage.IN_PROGRESS,
        ),
        created_by=created_by if isinstance(created_by, User) else None,
        is_active=True,
    )


@transaction.atomic
def update_treatment(
    treatment: Treatment,
    *,
    diagnosis: str | None = None,
    description: str | None = None,
    price: Any = ...,
    payment_status: str | None = None,
    stage: str | None = None,
    procedure_type: Any = ...,
    is_active: bool | None = None,
) -> Treatment:
    """Partial update; only kwargs that were passed are touched."""
    update_fields: list[str] = []

    if diagnosis is not None:
        treatment.diagnosis = _clean_text(
            diagnosis, max_length=500, field="diagnosis"
        )
        update_fields.append("diagnosis")

    if description is not None:
        treatment.description = _clean_text(
            description, max_length=10_000, field="description"
        )
        update_fields.append("description")

    if price is not ...:
        treatment.price = _clean_price(price, default=treatment.price)
        update_fields.append("price")

    if payment_status is not None:
        treatment.payment_status = _clean_choice(
            payment_status, choices=PaymentStatus, field="payment_status"
        )
        update_fields.append("payment_status")

    if stage is not None:
        new_stage = _clean_choice(
            stage, choices=TreatmentStage, field="stage"
        )
        # Prevent backwards transition completed → in_progress.
        if (
            treatment.stage == TreatmentStage.COMPLETED
            and new_stage == TreatmentStage.IN_PROGRESS
        ):
            raise ValidationError(
                {"stage": [
                    "Yakunlangan davolashni qayta 'davom etmoqda' holatiga "
                    "o'tkazib bo'lmaydi."
                ]}
            )
        treatment.stage = new_stage
        update_fields.append("stage")

    if procedure_type is not ...:
        new_pt = _resolve_procedure_type(procedure_type)
        if new_pt is not None and new_pt.department_id != treatment.department_id:
            raise ValidationError(
                {"procedure_type": [
                    "Muolaja turi tanlangan bo'limga tegishli emas."
                ]}
            )
        treatment.procedure_type = new_pt
        update_fields.append("procedure_type")

    if is_active is not None:
        treatment.is_active = bool(is_active)
        update_fields.append("is_active")

    if update_fields:
        treatment.save(update_fields=update_fields + ["updated_at"])
    return treatment


@transaction.atomic
def soft_delete_treatment(treatment: Treatment) -> Treatment:
    if treatment.is_active:
        treatment.is_active = False
        treatment.save(update_fields=["is_active", "updated_at"])
    return treatment


# ---------------------------------------------------------------------------
# Public API — TreatmentPhoto
# ---------------------------------------------------------------------------
@transaction.atomic
def upload_treatment_photo(
    treatment: Treatment,
    *,
    photo_type: str,
    image: Any,
    caption: str = "",
    uploaded_by: Any = None,
) -> TreatmentPhoto:
    """Attach a before/after/x-ray photo to ``treatment``.

    T130 — validates the incoming file for MIME type, extension, size,
    and Pillow-openable bytes before it hits storage. See
    :func:`_validate_photo_upload`.
    """
    if image in (None, ""):
        raise ValidationError({"image": ["Rasm fayli majburiy."]})

    _validate_photo_upload(image)

    photo = TreatmentPhoto.objects.create(
        treatment=treatment,
        photo_type=_clean_choice(
            photo_type, choices=PhotoType, field="photo_type"
        ),
        image=image,
        caption=_clean_text(caption, max_length=255, field="caption"),
        uploaded_by=uploaded_by if isinstance(uploaded_by, User) else None,
        is_active=True,
    )
    return photo


@transaction.atomic
def soft_delete_photo(photo: TreatmentPhoto) -> TreatmentPhoto:
    if photo.is_active:
        photo.is_active = False
        photo.save(update_fields=["is_active", "updated_at"])
    return photo


__all__ = [
    "create_treatment",
    "update_treatment",
    "soft_delete_treatment",
    "upload_treatment_photo",
    "soft_delete_photo",
    "ALLOWED_PHOTO_MIME_TYPES",
    "ALLOWED_PHOTO_EXTENSIONS",
    "DENIED_PHOTO_MIME_TYPES",
]
