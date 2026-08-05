"""Models for the ``patients`` app.

The :class:`Patient` model is the pivot for every clinical record in
DentaCRM. Design decisions:

* Inherits :class:`apps.core.models.BaseModel` for a UUID pk, audit
  timestamps, and a soft-delete flag (``is_active``).
* ``phone_number`` is normalised through the same helper used by
  :mod:`apps.accounts.models` so admins can search by phone regardless
  of formatting (``+998 90 123 45 67`` and ``998901234567`` collapse to
  the same canonical form).
* ``created_by`` — the user who registered the patient. Kept as
  ``on_delete=PROTECT`` so we never accidentally lose the audit trail
  when a receptionist account is removed.
* ``simple_history`` is enabled to satisfy the audit-log constraint in
  PROJECT_BRIEF § "Constraints" (the brief calls out Treatment/Payment/
  Material specifically; adding it here is cheap and gives the admin a
  free change log).
"""
from __future__ import annotations

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.db import models
from django.db.models.functions import Lower
from django.utils.translation import gettext_lazy as _
from simple_history.models import HistoricalRecords

from apps.accounts.models import normalise_phone_number
from apps.core.models import BaseModel

# Re-use the accounts app's phone-number regex so patient phones follow
# the same rules as user phones (accepted by Telegram bot, easy to
# normalise for search).
_PHONE_VALIDATOR = RegexValidator(
    regex=r"^\+?[0-9]{7,15}$",
    message=_(
        "Telefon raqami xalqaro formatda bo'lishi kerak "
        "(masalan, +998901234567)."
    ),
)


class Patient(BaseModel):
    """A single patient (bemor) registered at the clinic."""

    class Gender(models.TextChoices):
        MALE = "male", _("Erkak")
        FEMALE = "female", _("Ayol")

    first_name = models.CharField(_("Ism"), max_length=100)
    last_name = models.CharField(_("Familiya"), max_length=100)
    phone_number = models.CharField(
        _("Telefon raqami"),
        max_length=20,
        validators=[_PHONE_VALIDATOR],
        help_text=_("Xalqaro formatda saqlanadi (masalan +998901234567)."),
    )
    gender = models.CharField(
        _("Jinsi"),
        max_length=10,
        choices=Gender.choices,
        null=True,
        blank=True,
    )
    address = models.CharField(
        _("Manzil"),
        max_length=500,
        blank=True,
        default="",
    )
    notes = models.TextField(
        _("Eslatmalar"),
        blank=True,
        default="",
        help_text=_(
            "Allergiya, surunkali kasalliklar va boshqa muhim tibbiy izohlar."
        ),
    )
    telegram_chat_id = models.BigIntegerField(
        _("Telegram chat ID"),
        null=True,
        blank=True,
        unique=True,
        help_text=_("Bemorga eslatma va retseptni Telegram orqali yuborish uchun."),
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="patients_created",
        related_query_name="patient_created",
        verbose_name=_("Yaratgan foydalanuvchi"),
        null=True,
        blank=True,
    )

    # Audit history (PROJECT_BRIEF § Constraints).
    history = HistoricalRecords(
        inherit=True,
        table_name="patients_patient_history",
    )

    class Meta:
        verbose_name = _("Bemor")
        verbose_name_plural = _("Bemorlar")
        ordering = ["last_name", "first_name"]
        constraints = [
            # A patient can only be registered once per phone number
            # (among active rows). Soft-deleted rows keep their old phone
            # so we don't lose history when a duplicate is discovered.
            models.UniqueConstraint(
                fields=["phone_number"],
                condition=models.Q(is_active=True),
                name="patients_patient_phone_unique_active",
            ),
        ]
        indexes = [
            models.Index(fields=["last_name", "first_name"], name="patients_name_idx"),
            models.Index(fields=["phone_number"], name="patients_phone_idx"),
            models.Index(Lower("last_name"), name="patients_lname_ci_idx"),
        ]

    # ------------------------------------------------------------------
    # Convenience
    # ------------------------------------------------------------------
    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"{self.full_name} ({self.phone_number})"

    @property
    def full_name(self) -> str:
        parts = [self.first_name, self.last_name]
        return " ".join(p for p in parts if p).strip()

    # ------------------------------------------------------------------
    # Validation / normalisation
    # ------------------------------------------------------------------
    def clean(self) -> None:  # noqa: D401
        super().clean()
        if self.phone_number:
            try:
                self.phone_number = normalise_phone_number(self.phone_number)
            except ValidationError as exc:
                raise ValidationError({"phone_number": exc.messages}) from exc


__all__ = ["Patient"]
