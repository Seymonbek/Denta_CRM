"""Models for the ``prescriptions`` app.

Design notes:

* Both models inherit :class:`apps.core.models.BaseModel` for UUID pk,
  ``created_at`` / ``updated_at`` / ``is_active``.
* :class:`Prescription` records ``content`` verbatim rather than
  linking dynamically to the template body — a retsept that has been
  handed to a patient must not silently change if the template is
  edited later.
* ``sent_to_telegram_at`` is nullable; ``None`` means "not yet sent".
* :class:`PrescriptionTemplate.name` is unique per-created_by so
  a doctor can freely reuse names another doctor already picked.
"""
from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.core.models import BaseModel


# ---------------------------------------------------------------------------
# PrescriptionTemplate
# ---------------------------------------------------------------------------
class PrescriptionTemplate(BaseModel):
    """Reusable retsept shabloni."""

    name = models.CharField(
        _("Nomi"),
        max_length=200,
    )
    content = models.TextField(
        _("Matn"),
        help_text=_(
            "Retsept matni. Placeholderlar (masalan {patient_name}) qo'llab-"
            "quvvatlanadi va yaratish vaqtida almashtiriladi."
        ),
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="prescription_templates",
        related_query_name="prescription_template",
        verbose_name=_("Yaratgan foydalanuvchi"),
        null=True,
        blank=True,
    )

    class Meta:
        verbose_name = _("Retsept shabloni")
        verbose_name_plural = _("Retsept shablonlari")
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["created_by", "name"],
                name="prescriptions_template_unique_name_per_owner",
            ),
        ]
        indexes = [
            models.Index(fields=["name"], name="pr_tpl_name_idx"),
        ]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"PrescriptionTemplate({self.name})"


# ---------------------------------------------------------------------------
# Prescription
# ---------------------------------------------------------------------------
class Prescription(BaseModel):
    """A single retsept issued for a :class:`treatments.Treatment`."""

    treatment = models.ForeignKey(
        "treatments.Treatment",
        on_delete=models.CASCADE,
        related_name="prescriptions",
        related_query_name="prescription",
        verbose_name=_("Davolash"),
    )
    template = models.ForeignKey(
        PrescriptionTemplate,
        on_delete=models.SET_NULL,
        related_name="prescriptions",
        related_query_name="prescription",
        verbose_name=_("Shablon"),
        null=True,
        blank=True,
    )
    content = models.TextField(
        _("Matn"),
        help_text=_(
            "Retsept matni — patientga yuboriladigan yakuniy versiya. "
            "Shablondan olingan bo'lsa ham, bu yerda mustaqil saqlanadi."
        ),
    )
    sent_to_telegram_at = models.DateTimeField(
        _("Telegram ga yuborilgan sana"),
        null=True,
        blank=True,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="prescriptions_created",
        related_query_name="prescription_created",
        verbose_name=_("Yaratgan foydalanuvchi"),
        null=True,
        blank=True,
    )

    class Meta:
        verbose_name = _("Retsept")
        verbose_name_plural = _("Retseptlar")
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["treatment", "-created_at"], name="pr_tr_idx"),
            models.Index(fields=["sent_to_telegram_at"], name="pr_sent_idx"),
        ]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"Prescription(treatment={self.treatment_id})"

    @property
    def is_sent(self) -> bool:
        return self.sent_to_telegram_at is not None


__all__ = [
    "PrescriptionTemplate",
    "Prescription",
]
