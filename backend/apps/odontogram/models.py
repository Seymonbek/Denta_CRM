"""Models for the ``odontogram`` app.

Only one model: :class:`ToothRecord`. It is linked to a
:class:`apps.treatments.Treatment` (many tooth records per treatment)
and carries the FDI-numbered tooth plus the procedure/status pair.

Constraints:

* ``tooth_number`` must belong to :data:`FDI_VALID_NUMBERS` — enforced
  both at the Python layer (validators) and at the DB layer
  (CheckConstraint).
* ``(treatment, tooth_number)`` is unique — you can only have one
  record for a given tooth per treatment. Repeat treatments on the
  same tooth create *new* Treatment rows.

``simple_history`` records changes for the audit trail (PROJECT_BRIEF
Constraints — Treatment/Payment/Material must be audit-tracked; we
extend that to ToothRecord too because it is part of the clinical
record).
"""
from __future__ import annotations

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils.translation import gettext_lazy as _
from simple_history.models import HistoricalRecords

from apps.core.models import BaseModel

# ---------------------------------------------------------------------------
# FDI numbering constants
# ---------------------------------------------------------------------------
#: Permanent adult dentition (32 teeth).
FDI_VALID_NUMBERS: tuple[int, ...] = tuple(
    number
    for quadrant in (10, 20, 30, 40)
    for number in range(quadrant + 1, quadrant + 9)
)
FDI_PERMANENT_NUMBERS: tuple[int, ...] = FDI_VALID_NUMBERS

#: Deciduous / primary / child dentition (20 teeth).
FDI_PRIMARY_NUMBERS: tuple[int, ...] = tuple(
    number
    for quadrant in (50, 60, 70, 80)
    for number in range(quadrant + 1, quadrant + 6)
)

#: All valid FDI tooth numbers (permanent + primary). 52 items total.
FDI_ALL_NUMBERS: tuple[int, ...] = FDI_VALID_NUMBERS + FDI_PRIMARY_NUMBERS

FDI_MIN = min(FDI_ALL_NUMBERS)  # 11
FDI_MAX = max(FDI_ALL_NUMBERS)  # 85


# ---------------------------------------------------------------------------
# Choices
# ---------------------------------------------------------------------------
class ToothProcedure(models.TextChoices):
    """Procedure performed on the tooth (PROJECT_BRIEF § "odontogram")."""

    FILLING = "filling", _("Plomba")
    ROOT_CANAL = "root_canal", _("Kanal davolash")
    EXTRACTION = "extraction", _("Olib tashlash")
    CROWN = "crown", _("Koronka")
    IMPLANT = "implant", _("Implant")
    CLEANING = "cleaning", _("Tozalash")
    WHITENING = "whitening", _("Oqartirish")
    OTHER = "other", _("Boshqa")


class ToothStatus(models.TextChoices):
    """Post-procedure status shown on the odontogram grid."""

    HEALTHY = "healthy", _("Sog'lom")
    TREATED = "treated", _("Davolangan")
    MISSING = "missing", _("Yo'q / olib tashlangan")
    PLANNED = "planned", _("Rejalashtirilgan")


# ---------------------------------------------------------------------------
# ToothRecord
# ---------------------------------------------------------------------------
class ToothRecord(BaseModel):
    """A single tooth's record inside a treatment or general patient baseline chart."""

    Procedure = ToothProcedure  # convenience re-exports
    Status = ToothStatus

    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.CASCADE,
        related_name="tooth_records",
        related_query_name="tooth_record",
        verbose_name=_("Bemor"),
        null=True,
        blank=True,
    )
    treatment = models.ForeignKey(
        "treatments.Treatment",
        on_delete=models.CASCADE,
        related_name="tooth_records",
        related_query_name="tooth_record",
        verbose_name=_("Davolash"),
        null=True,
        blank=True,
    )
    tooth_number = models.PositiveSmallIntegerField(
        _("Tish raqami (FDI)"),
        validators=[
            MinValueValidator(FDI_MIN),
            MaxValueValidator(FDI_MAX),
        ],
        help_text=_(
            "FDI tish raqamlari: Doimiy 11–48 (32 ta) yoki Sut tishlari 51–85 (20 ta)."
        ),
    )
    surfaces = models.JSONField(
        _("Tish sirtlari"),
        default=list,
        blank=True,
        help_text=_("Tishning shikastlangan/davolangan yuzalari: O, M, D, V, L."),
    )
    procedure = models.CharField(
        _("Muolaja"),
        max_length=20,
        choices=ToothProcedure.choices,
    )
    status = models.CharField(
        _("Holat"),
        max_length=10,
        choices=ToothStatus.choices,
        default=ToothStatus.PLANNED,
    )
    notes = models.TextField(
        _("Izohlar"),
        blank=True,
        default="",
    )

    history = HistoricalRecords(
        inherit=True,
        table_name="odontogram_toothrecord_history",
    )

    class Meta:
        verbose_name = _("Tish yozuvi")
        verbose_name_plural = _("Tish yozuvlari")
        ordering = ["tooth_number", "-created_at"]
        constraints = [
            models.CheckConstraint(
                check=(
                    models.Q(tooth_number__gte=11, tooth_number__lte=18)
                    | models.Q(tooth_number__gte=21, tooth_number__lte=28)
                    | models.Q(tooth_number__gte=31, tooth_number__lte=38)
                    | models.Q(tooth_number__gte=41, tooth_number__lte=48)
                    | models.Q(tooth_number__gte=51, tooth_number__lte=55)
                    | models.Q(tooth_number__gte=61, tooth_number__lte=65)
                    | models.Q(tooth_number__gte=71, tooth_number__lte=75)
                    | models.Q(tooth_number__gte=81, tooth_number__lte=85)
                ),
                name="odontogram_toothrecord_fdi_range",
            ),
        ]
        indexes = [
            models.Index(fields=["patient", "tooth_number"], name="tr_pat_tn_idx"),
            models.Index(fields=["treatment", "tooth_number"], name="tr_tr_tn_idx"),
            models.Index(fields=["status"], name="tr_status_idx"),
        ]

    def save(self, *args, **kwargs):
        # Auto-link patient from treatment if not provided
        if not self.patient_id and self.treatment_id:
            self.patient_id = self.treatment.patient_id
        super().save(*args, **kwargs)

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return (
            f"ToothRecord(patient={self.patient_id}, "
            f"tooth={self.tooth_number}, {self.procedure}/{self.status})"
        )


__all__ = [
    "ToothRecord",
    "ToothProcedure",
    "ToothStatus",
    "FDI_PERMANENT_NUMBERS",
    "FDI_PRIMARY_NUMBERS",
    "FDI_VALID_NUMBERS",
    "FDI_ALL_NUMBERS",
    "FDI_MIN",
    "FDI_MAX",
]
