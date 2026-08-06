"""Models for the ``inventory`` app.

Design decisions:

* Every model inherits :class:`apps.core.models.BaseModel` for the UUID
  pk, ``created_at`` / ``updated_at`` timestamps, and the ``is_active``
  soft-delete flag.
* :class:`Material` stores stock in a ``DecimalField`` because dental
  materials are frequently measured in fractional grams / millilitres.
* :class:`MaterialUsage` lives here — not in the ``treatments`` app —
  because PROJECT_BRIEF § "inventory app" is the authoritative home.
  Treatments simply reverse-references it via ``treatment.usages``.
* :class:`MaterialStockLog` is append-only; a positive ``change_amount``
  means stock **increased** (restock, positive adjustment), a negative
  value means it **decreased** (usage, negative adjustment). This
  invariant is enforced by the service layer and by a Meta constraint
  that pairs the sign with the ``reason``.
* :mod:`simple_history` tracks :class:`Material` mutations because
  PROJECT_BRIEF § "Constraints" specifies Materials must be audit-logged.
"""
from __future__ import annotations

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.utils.translation import gettext_lazy as _
from simple_history.models import HistoricalRecords

from apps.core.models import BaseModel


# ---------------------------------------------------------------------------
# Choices
# ---------------------------------------------------------------------------
class MaterialUnit(models.TextChoices):
    """Unit of measure — PROJECT_BRIEF § "inventory app"."""

    GRAM = "gram", _("Gramm")
    PIECE = "piece", _("Dona")
    ML = "ml", _("Millilitr")


class StockChangeReason(models.TextChoices):
    """Why the material stock changed."""

    USAGE = "usage", _("Sarflash")
    RESTOCK = "restock", _("To'ldirish")
    ADJUSTMENT = "adjustment", _("Tuzatish")


# ---------------------------------------------------------------------------
# Material
# ---------------------------------------------------------------------------
class Material(BaseModel):
    """A consumable material (composite, needle, adhesive, ...)."""

    Unit = MaterialUnit  # convenience re-export

    name = models.CharField(
        _("Nomi"),
        max_length=150,
        unique=True,
        help_text=_("Material nomi, masalan: 'Filtek Z250', 'Endo fayli #25'."),
    )
    unit = models.CharField(
        _("O'lchov birligi"),
        max_length=10,
        choices=MaterialUnit.choices,
        default=MaterialUnit.PIECE,
    )
    quantity_in_stock = models.DecimalField(
        _("Ombordagi miqdor"),
        max_digits=12,
        decimal_places=3,
        default=Decimal("0.000"),
        validators=[MinValueValidator(Decimal("0.000"))],
        help_text=_("Joriy zaxira — sarflash signali orqali kamayadi."),
    )
    minimum_threshold = models.DecimalField(
        _("Minimum chegara"),
        max_digits=12,
        decimal_places=3,
        default=Decimal("0.000"),
        validators=[MinValueValidator(Decimal("0.000"))],
        help_text=_("Zaxira shu qiymatga tushganda bosh shifokorga ogohlantirish yuboriladi."),
    )
    unit_cost = models.DecimalField(
        _("Birlik narxi"),
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.00"))],
        help_text=_(
            "Ixtiyoriy — komissiya 'from_net' asosda hisoblanganda material "
            "xarajati sifatida qo'llaniladi."
        ),
    )
    notes = models.TextField(
        _("Izohlar"),
        blank=True,
        default="",
    )

    history = HistoricalRecords(
        inherit=True,
        table_name="inventory_material_history",
    )

    class Meta:
        verbose_name = _("Material")
        verbose_name_plural = _("Materiallar")
        ordering = ["name"]
        constraints = [
            models.CheckConstraint(
                check=models.Q(quantity_in_stock__gte=0),
                name="inventory_material_quantity_non_negative",
            ),
            models.CheckConstraint(
                check=models.Q(minimum_threshold__gte=0),
                name="inventory_material_threshold_non_negative",
            ),
        ]
        indexes = [
            models.Index(fields=["is_active"], name="inv_material_active_idx"),
        ]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"{self.name} ({self.quantity_in_stock} {self.unit})"

    @property
    def is_below_threshold(self) -> bool:
        """True when the current stock is at or under the minimum threshold."""
        return self.quantity_in_stock <= self.minimum_threshold


# ---------------------------------------------------------------------------
# MaterialUsage
# ---------------------------------------------------------------------------
class MaterialUsage(BaseModel):
    """One material consumed inside a :class:`~apps.treatments.models.Treatment`.

    Creating a row triggers a ``post_save`` signal in
    :mod:`apps.inventory.signals` that atomically decrements
    :attr:`Material.quantity_in_stock` and appends a
    :class:`MaterialStockLog` with ``reason=usage``. Deleting a
    usage-row does **not** restore stock automatically — corrections
    must go through :func:`apps.inventory.services.adjust_stock`.
    """

    treatment = models.ForeignKey(
        "treatments.Treatment",
        on_delete=models.CASCADE,
        related_name="material_usages",
        related_query_name="material_usage",
        verbose_name=_("Davolash"),
    )
    material = models.ForeignKey(
        Material,
        on_delete=models.PROTECT,
        related_name="usages",
        related_query_name="usage",
        verbose_name=_("Material"),
    )
    quantity_used = models.DecimalField(
        _("Sarflangan miqdor"),
        max_digits=12,
        decimal_places=3,
        validators=[MinValueValidator(Decimal("0.001"))],
    )
    recorded_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.PROTECT,
        related_name="material_usages_recorded",
        null=True,
        blank=True,
        verbose_name=_("Yozgan foydalanuvchi"),
    )

    def clean(self) -> None:
        super().clean()
        if self.material_id and self.quantity_used:
            if self._state.adding:
                if self.quantity_used > self.material.quantity_in_stock:
                    raise ValidationError(
                        {
                            "quantity_used": [
                                f"Zaxirada yetarli material yo'q. Faqat {self.material.quantity_in_stock} {self.material.unit} bor."
                            ]
                        }
                    )

    class Meta:
        verbose_name = _("Material sarflash")
        verbose_name_plural = _("Material sarflashlar")
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                check=models.Q(quantity_used__gt=0),
                name="inventory_usage_quantity_positive",
            ),
        ]
        indexes = [
            models.Index(fields=["treatment"], name="inv_usage_treatment_idx"),
            models.Index(fields=["material"], name="inv_usage_material_idx"),
        ]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"{self.material_id} × {self.quantity_used} → {self.treatment_id}"


# ---------------------------------------------------------------------------
# MaterialStockLog
# ---------------------------------------------------------------------------
class MaterialStockLog(BaseModel):
    """Append-only audit row for every stock movement.

    A positive ``change_amount`` means the stock went **up** (restock or
    positive adjustment); a negative value means it went **down** (usage
    or negative adjustment). ``related_treatment`` is populated for
    usage entries so the audit trail can trace stock back to the
    clinical record it served.
    """

    material = models.ForeignKey(
        Material,
        on_delete=models.PROTECT,
        related_name="stock_logs",
        related_query_name="stock_log",
        verbose_name=_("Material"),
    )
    change_amount = models.DecimalField(
        _("O'zgarish miqdori"),
        max_digits=12,
        decimal_places=3,
        help_text=_("Musbat qiymat — kirim; manfiy qiymat — chiqim."),
    )
    reason = models.CharField(
        _("Sabab"),
        max_length=20,
        choices=StockChangeReason.choices,
    )
    resulting_quantity = models.DecimalField(
        _("Yakuniy zaxira"),
        max_digits=12,
        decimal_places=3,
        validators=[MinValueValidator(Decimal("0.000"))],
        help_text=_(
            "Ushbu yozuvdan keyingi ombordagi miqdor — audit uchun snapshot."
        ),
    )
    related_treatment = models.ForeignKey(
        "treatments.Treatment",
        on_delete=models.SET_NULL,
        related_name="stock_logs",
        related_query_name="stock_log",
        null=True,
        blank=True,
        verbose_name=_("Bog'liq davolash"),
    )
    related_usage = models.ForeignKey(
        MaterialUsage,
        on_delete=models.SET_NULL,
        related_name="stock_logs",
        related_query_name="stock_log",
        null=True,
        blank=True,
        verbose_name=_("Bog'liq sarflash"),
    )
    performed_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.PROTECT,
        related_name="stock_logs_performed",
        null=True,
        blank=True,
        verbose_name=_("Bajargan foydalanuvchi"),
    )
    note = models.CharField(
        _("Izoh"),
        max_length=255,
        blank=True,
        default="",
    )

    class Meta:
        verbose_name = _("Zaxira jurnali")
        verbose_name_plural = _("Zaxira jurnallari")
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                check=(
                    (models.Q(reason="usage") & models.Q(change_amount__lt=0))
                    | (models.Q(reason="restock") & models.Q(change_amount__gt=0))
                    | models.Q(reason="adjustment")
                ),
                name="inv_stock_log_reason_sign_consistent",
            ),
        ]
        indexes = [
            models.Index(fields=["material", "-created_at"], name="inv_log_material_idx"),
            models.Index(fields=["reason"], name="inv_log_reason_idx"),
        ]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"{self.material_id} {self.change_amount:+} ({self.reason})"


__all__ = [
    "Material",
    "MaterialUsage",
    "MaterialStockLog",
    "MaterialUnit",
    "StockChangeReason",
]
