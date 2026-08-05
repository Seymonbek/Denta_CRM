"""Write-side business logic for the ``prescriptions`` app.

Two public services:

* :func:`create_prescription_template` / :func:`update_prescription_template`
  — CRUD for reusable shablonlar.
* :func:`create_prescription_for_treatment` — issue a retsept for a
  treatment. Handles placeholder substitution and, if
  :func:`send_prescription_via_telegram` is available (T22 telegram_bot
  app), attempts to deliver it. In dev the sender falls back to a
  no-op mock so the endpoint always returns 201.
"""
from __future__ import annotations

import logging
from typing import Any

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.treatments.models import Treatment

from .models import Prescription, PrescriptionTemplate

logger = logging.getLogger(__name__)

User = get_user_model()


# ---------------------------------------------------------------------------
# Field cleaners
# ---------------------------------------------------------------------------
def _clean_text(value: Any, *, max_length: int, field: str, required: bool = True) -> str:
    if value in (None, ""):
        if required:
            raise ValidationError({field: [f"'{field}' majburiy."]})
        return ""
    text = str(value).strip()
    if not text and required:
        raise ValidationError({field: [f"'{field}' bo'sh bo'lishi mumkin emas."]})
    if len(text) > max_length:
        raise ValidationError(
            {field: [f"Matn {max_length} belgidan uzun bo'lmasin."]}
        )
    return text


# ---------------------------------------------------------------------------
# Template services
# ---------------------------------------------------------------------------
@transaction.atomic
def create_prescription_template(
    *,
    name: str,
    content: str,
    created_by: Any = None,
) -> PrescriptionTemplate:
    clean_name = _clean_text(name, max_length=200, field="name")
    clean_content = _clean_text(content, max_length=20_000, field="content")

    owner = created_by if isinstance(created_by, User) else None

    if PrescriptionTemplate.objects.filter(
        created_by=owner, name=clean_name, is_active=True
    ).exists():
        raise ValidationError(
            {"name": ["Sizda shu nomdagi shablon allaqachon mavjud."]}
        )

    return PrescriptionTemplate.objects.create(
        name=clean_name,
        content=clean_content,
        created_by=owner,
        is_active=True,
    )


@transaction.atomic
def update_prescription_template(
    template: PrescriptionTemplate,
    *,
    name: str | None = None,
    content: str | None = None,
    is_active: bool | None = None,
) -> PrescriptionTemplate:
    update_fields: list[str] = []

    if name is not None:
        new_name = _clean_text(name, max_length=200, field="name")
        if new_name != template.name and PrescriptionTemplate.objects.filter(
            created_by=template.created_by, name=new_name, is_active=True
        ).exclude(pk=template.pk).exists():
            raise ValidationError(
                {"name": ["Sizda shu nomdagi shablon allaqachon mavjud."]}
            )
        template.name = new_name
        update_fields.append("name")

    if content is not None:
        template.content = _clean_text(
            content, max_length=20_000, field="content"
        )
        update_fields.append("content")

    if is_active is not None:
        template.is_active = bool(is_active)
        update_fields.append("is_active")

    if update_fields:
        template.save(update_fields=update_fields + ["updated_at"])
    return template


@transaction.atomic
def soft_delete_template(template: PrescriptionTemplate) -> PrescriptionTemplate:
    if template.is_active:
        template.is_active = False
        template.save(update_fields=["is_active", "updated_at"])
    return template


# ---------------------------------------------------------------------------
# Prescription services
# ---------------------------------------------------------------------------
def _substitute_placeholders(text: str, treatment: Treatment) -> str:
    """Replace {patient_name}, {doctor_name}, {diagnosis} in ``text``."""
    patient = treatment.patient
    doctor = treatment.doctor
    doctor_user = getattr(doctor, "user", None)

    patient_name = (
        f"{getattr(patient, 'first_name', '') or ''} "
        f"{getattr(patient, 'last_name', '') or ''}"
    ).strip()
    doctor_name = (
        f"{getattr(doctor_user, 'first_name', '') or ''} "
        f"{getattr(doctor_user, 'last_name', '') or ''}"
    ).strip()

    replacements = {
        "{patient_name}": patient_name or "Bemor",
        "{doctor_name}": doctor_name or "Shifokor",
        "{diagnosis}": treatment.diagnosis or "",
    }
    for placeholder, value in replacements.items():
        text = text.replace(placeholder, value)
    return text


def _send_via_telegram(prescription: Prescription) -> bool:
    """Attempt to deliver ``prescription`` through Telegram.

    Import is deferred so the prescriptions app doesn't depend on the
    telegram_bot app existing (it comes online in T22). If the
    telegram_bot sender is missing OR the patient has no
    ``telegram_chat_id`` we return ``False`` and the caller records
    ``sent_to_telegram_at`` accordingly.

    In dev / test the real bot is stubbed, so this function is safe to
    call from any environment.
    """
    treatment = prescription.treatment
    patient = treatment.patient
    chat_id = getattr(patient, "telegram_chat_id", None)
    if not chat_id:
        return False

    try:
        from apps.telegram_bot.services import send_prescription  # type: ignore[import-not-found]
    except Exception:  # noqa: BLE001 - app not installed yet
        logger.info(
            "telegram_bot app not available; skipping delivery for %s",
            prescription.pk,
        )
        return False

    try:
        send_prescription(chat_id=chat_id, content=prescription.content)
    except Exception:  # noqa: BLE001 - never surface bot errors to caller
        logger.exception("Telegram delivery failed for prescription %s", prescription.pk)
        return False
    return True


@transaction.atomic
def create_prescription_for_treatment(
    *,
    treatment: Treatment,
    template: PrescriptionTemplate | Any = None,
    content: str | None = None,
    created_by: Any = None,
    send: bool = True,
) -> Prescription:
    """Create a retsept for ``treatment`` and (optionally) send via Telegram.

    * If ``content`` is given it is used verbatim (after placeholder
      substitution).
    * Otherwise ``template.content`` is used. Passing neither raises
      :class:`ValidationError`.
    * ``sent_to_telegram_at`` is set only when the send actually
      succeeds; a missing bot or missing chat_id leaves it ``None``
      but the retsept is still stored.
    """
    if template is not None and not isinstance(template, PrescriptionTemplate):
        try:
            template = PrescriptionTemplate.objects.get(pk=template, is_active=True)
        except PrescriptionTemplate.DoesNotExist as exc:
            raise ValidationError({"template": ["Shablon topilmadi."]}) from exc

    raw_content = content if content not in (None, "") else (
        template.content if template is not None else None
    )
    if not raw_content:
        raise ValidationError(
            {"content": ["'content' yoki 'template' kiritilishi shart."]}
        )

    final_content = _substitute_placeholders(
        _clean_text(raw_content, max_length=20_000, field="content"),
        treatment,
    )

    owner = created_by if isinstance(created_by, User) else None

    prescription = Prescription.objects.create(
        treatment=treatment,
        template=template,
        content=final_content,
        sent_to_telegram_at=None,
        created_by=owner,
        is_active=True,
    )

    if send and _send_via_telegram(prescription):
        prescription.sent_to_telegram_at = timezone.now()
        prescription.save(
            update_fields=["sent_to_telegram_at", "updated_at"]
        )

    return prescription


@transaction.atomic
def mark_prescription_sent(prescription: Prescription) -> Prescription:
    """Manually flag a retsept as sent (used by admin actions / retries)."""
    if prescription.sent_to_telegram_at is None:
        prescription.sent_to_telegram_at = timezone.now()
        prescription.save(
            update_fields=["sent_to_telegram_at", "updated_at"]
        )
    return prescription


@transaction.atomic
def soft_delete_prescription(prescription: Prescription) -> Prescription:
    if prescription.is_active:
        prescription.is_active = False
        prescription.save(update_fields=["is_active", "updated_at"])
    return prescription


__all__ = [
    "create_prescription_template",
    "update_prescription_template",
    "soft_delete_template",
    "create_prescription_for_treatment",
    "mark_prescription_sent",
    "soft_delete_prescription",
]
