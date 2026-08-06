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
#: All valid FDI tooth numbers (permanent dentition, adult). 32 items.
FDI_VALID_NUMBERS: tuple[int, ...] = tuple(
    number
    for quadrant in (10, 20, 30, 40)
    for number in range(quadrant + 1, quadrant + 9)
)

FDI_MIN = min(FDI_VALID_NUMBERS)  # 11
FDI_MAX = max(FDI_VALID_NUMBERS)  # 48


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
    """A single tooth's record inside a treatment."""

    Procedure = ToothProcedure  # convenience re-exports
    Status = ToothStatus

    treatment = models.ForeignKey(
        "treatments.Treatment",
        on_delete=models.CASCADE,
        related_name="tooth_records",
        related_query_name="tooth_record",
        verbose_name=_("Davolash"),
    )
    tooth_number = models.PositiveSmallIntegerField(
        _("Tish raqami (FDI)"),
        validators=[
            MinValueValidator(FDI_MIN),
            MaxValueValidator(FDI_MAX),
        ],
        help_text=_(
            "FDI tish raqamlari: 11–18, 21–28, 31–38, 41–48 "
            "(jami 32 ta doimiy tish)."
        ),
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
                # FDI: quadrants 1–4 × positions 1–8. Equivalent to the
                # explicit ``tooth_number in FDI_VALID_NUMBERS`` list but
                # expressible as a simple range/modulo predicate SQL
                # can enforce cheaply.
                check=(
                    models.Q(tooth_number__gte=11, tooth_number__lte=18)
                    | models.Q(tooth_number__gte=21, tooth_number__lte=28)
                    | models.Q(tooth_number__gte=31, tooth_number__lte=38)
                    | models.Q(tooth_number__gte=41, tooth_number__lte=48)
                ),
                name="odontogram_toothrecord_fdi_range",
            ),
            models.UniqueConstraint(
                fields=["treatment", "tooth_number"],
                name="odontogram_toothrecord_unique_per_treatment",
            ),
        ]
        indexes = [
            models.Index(fields=["treatment", "tooth_number"], name="tr_tr_tn_idx"),
            models.Index(fields=["status"], name="tr_status_idx"),
        ]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return (
            f"ToothRecord(treatment={self.treatment_id}, "
            f"tooth={self.tooth_number}, {self.procedure}/{self.status})"
        )


__all__ = [
    "ToothRecord",
    "ToothProcedure",
    "ToothStatus",
    "FDI_VALID_NUMBERS",
    "FDI_MIN",
    "FDI_MAX",
]
