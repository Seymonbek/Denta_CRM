"""Models for the ``payments`` app.

Design decisions:

* Every model inherits :class:`apps.core.models.BaseModel` for the UUID
  pk, ``created_at`` / ``updated_at`` timestamps, and the ``is_active``
  flag (a payment can be voided by flipping ``is_active`` to False —
  the audit trail lives in :mod:`simple_history`).
* :class:`Payment.method` is a small closed enum matching
  PROJECT_BRIEF § "payments app" exactly: ``cash / card / payme /
  click / bank_transfer``.
* :class:`Payment.received_by` is an :class:`accounts.User` FK
  because reception clerks (administrators), doctors, and the head
  doctor may all receive money — we don't restrict it here, the
  permission class does.
* :class:`CommissionRecord.basis` mirrors
  :class:`apps.doctors.models.CommissionBasis` at the time of
  calculation. It's stored as a plain string so audit rows survive if
  the doctor's basis changes later — the historical record must not
  mutate silently.
* :class:`CommissionRecord` has a ``UniqueConstraint`` on
  ``(doctor, treatment)`` — one commission per treatment per doctor.
  The service layer recalculates and updates that single row rather
  than inserting duplicates.
"""
from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.utils.translation import gettext_lazy as _
from simple_history.models import HistoricalRecords

from apps.core.models import BaseModel


# ---------------------------------------------------------------------------
# Choices
# ---------------------------------------------------------------------------
class PaymentMethod(models.TextChoices):
    """PROJECT_BRIEF § 'payments app'."""

    CASH = "cash", _("Naqd")
    CARD = "card", _("Karta")
    PAYME = "payme", _("Payme")
    CLICK = "click", _("Click")
    BANK_TRANSFER = "bank_transfer", _("Bank o'tkazmasi")


class CommissionBasisSnapshot(models.TextChoices):
    """Snapshot of the basis used at calculation time."""

    FROM_TOTAL = "from_total", _("Umumiy narxdan")
    FROM_NET = "from_net", _("Sof daromaddan")


# ---------------------------------------------------------------------------
# Payment
# ---------------------------------------------------------------------------
class Payment(BaseModel):
    """Money received against a :class:`~apps.treatments.models.Treatment`."""

    Method = PaymentMethod  # convenience re-export

    treatment = models.ForeignKey(
        "treatments.Treatment",
        on_delete=models.PROTECT,
        related_name="payments",
        related_query_name="payment",
        verbose_name=_("Davolash"),
    )
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.PROTECT,
        related_name="payments",
        related_query_name="payment",
        verbose_name=_("Bemor"),
    )
    amount = models.DecimalField(
        _("Miqdor"),
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    method = models.CharField(
        _("To'lov turi"),
        max_length=20,
        choices=PaymentMethod.choices,
        default=PaymentMethod.CASH,
    )
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="payments_received",
        related_query_name="payment_received",
        verbose_name=_("Qabul qilgan xodim"),
        null=True,
        blank=True,
    )
    note = models.CharField(
        _("Izoh"),
        max_length=255,
        blank=True,
        default="",
    )

    history = HistoricalRecords(
        inherit=True,
        table_name="payments_payment_history",
    )

    class Meta:
        verbose_name = _("To'lov")
        verbose_name_plural = _("To'lovlar")
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                check=models.Q(amount__gt=0),
                name="payments_payment_amount_positive",
            ),
        ]
        indexes = [
            models.Index(fields=["treatment", "-created_at"], name="pay_treatment_idx"),
            models.Index(fields=["patient", "-created_at"], name="pay_patient_idx"),
            models.Index(fields=["method"], name="pay_method_idx"),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"Payment({self.amount} {self.method} → {self.treatment_id})"


# ---------------------------------------------------------------------------
# CommissionRecord
# ---------------------------------------------------------------------------
class CommissionRecord(BaseModel):
    """A doctor's commission on a single :class:`Treatment`.

    One row per ``(doctor, treatment)`` — recomputed in place when the
    treatment price / material cost / basis changes.
    """

    Basis = CommissionBasisSnapshot  # convenience re-export

    doctor = models.ForeignKey(
        "doctors.DoctorProfile",
        on_delete=models.PROTECT,
        related_name="commissions",
        related_query_name="commission",
        verbose_name=_("Shifokor"),
    )
    treatment = models.ForeignKey(
        "treatments.Treatment",
        on_delete=models.PROTECT,
        related_name="commissions",
        related_query_name="commission",
        verbose_name=_("Davolash"),
    )
    amount = models.DecimalField(
        _("Komissiya miqdori"),
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    rate = models.DecimalField(
        _("Foiz"),
        max_digits=5,
        decimal_places=2,
        help_text=_("Hisoblash paytida qo'llanilgan foiz (0–100)."),
    )
    basis = models.CharField(
        _("Asos"),
        max_length=20,
        choices=CommissionBasisSnapshot.choices,
    )
    base_amount = models.DecimalField(
        _("Hisoblash bazasi"),
        max_digits=12,
        decimal_places=2,
        help_text=_("Foiz qo'llanilgan pul miqdori (from_total: narx, from_net: narx - material)."),
    )
    material_cost = models.DecimalField(
        _("Material xarajati"),
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text=_(
            "from_net asosda ishlatilgan material xarajati. from_total uchun 0."
        ),
    )
    calculated_at = models.DateTimeField(
        _("Hisoblangan vaqti"),
        auto_now=True,
    )

    class Meta:
        verbose_name = _("Komissiya yozuvi")
        verbose_name_plural = _("Komissiya yozuvlari")
        ordering = ["-calculated_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["doctor", "treatment"],
                name="payments_commission_unique_per_doctor_treatment",
            ),
            models.CheckConstraint(
                check=models.Q(amount__gte=0),
                name="payments_commission_amount_non_negative",
            ),
            models.CheckConstraint(
                check=models.Q(rate__gte=0) & models.Q(rate__lte=100),
                name="payments_commission_rate_bounded",
            ),
        ]
        indexes = [
            models.Index(fields=["doctor", "-calculated_at"], name="comm_doctor_idx"),
            models.Index(fields=["treatment"], name="comm_treatment_idx"),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"Commission({self.doctor_id}, {self.amount})"


__all__ = [
    "Payment",
    "CommissionRecord",
    "PaymentMethod",
    "CommissionBasisSnapshot",
]
