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
from django.utils import timezone
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


class CashShiftStatus(models.TextChoices):
    """Shift status."""

    OPEN = "open", _("Ochiq")
    CLOSED = "closed", _("Yopiq")


class RefundStatus(models.TextChoices):
    """Refund status for payments in closed shifts."""
    
    NONE = "none", _("Yo'q")
    PENDING = "pending", _("Kutilmoqda")
    APPROVED = "approved", _("Tasdiqlangan")
    REJECTED = "rejected", _("Rad etilgan")


# ---------------------------------------------------------------------------
# Payment
# ---------------------------------------------------------------------------
class Payment(BaseModel):
    """Money received against a :class:`~apps.treatments.models.Treatment`."""

    Method = PaymentMethod  # convenience re-export
    Refund = RefundStatus

    cash_shift = models.ForeignKey(
        "payments.CashShift",
        on_delete=models.SET_NULL,
        related_name="payments",
        null=True,
        blank=True,
        verbose_name=_("Kassa Smenasi"),
    )
    treatment = models.ForeignKey(
        "treatments.Treatment",
        on_delete=models.PROTECT,
        related_name="payments",
        related_query_name="payment",
        verbose_name=_("Davolash"),
        null=True,
        blank=True,
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
    refund_status = models.CharField(
        _("Qaytarish holati"),
        max_length=20,
        choices=RefundStatus.choices,
        default=RefundStatus.NONE,
    )
    is_active = models.BooleanField(_("Faol"), default=True)
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

    @property
    def is_void(self) -> bool:
        return not self.is_active

    def clean(self):
        super().clean()
        # Prevent modification if linked to a closed shift
        if self.pk:
            old = Payment.objects.get(pk=self.pk)
            if old.cash_shift_id and old.cash_shift.status == 'closed':
                from django.core.exceptions import ValidationError
                raise ValidationError("Yopiq kassa smenasiga tegishli to'lovni o'zgartirib bo'lmaydi.")

    def delete(self, *args, **kwargs):
        if self.cash_shift_id and self.cash_shift.status == 'closed':
            from django.core.exceptions import ValidationError
            raise ValidationError("Yopiq kassa smenasiga tegishli to'lovni o'chirib bo'lmaydi.")
        super().delete(*args, **kwargs)

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


# ---------------------------------------------------------------------------
# CashShift
# ---------------------------------------------------------------------------
class CashShift(BaseModel):
    administrator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="cash_shifts",
        verbose_name=_("Administrator"),
    )
    opened_at = models.DateTimeField(auto_now_add=True, verbose_name=_("Ochilgan vaqti"))
    closed_at = models.DateTimeField(null=True, blank=True, verbose_name=_("Yopilgan vaqti"))
    start_balance = models.DecimalField(
        _("Boshlang'ich qoldiq"), max_digits=12, decimal_places=2, default=Decimal("0.00")
    )
    cash_collected = models.DecimalField(
        _("Naqd tushum"), max_digits=12, decimal_places=2, default=Decimal("0.00")
    )
    card_collected = models.DecimalField(
        _("Karta/Plastik tushum"), max_digits=12, decimal_places=2, default=Decimal("0.00")
    )
    cash_expenses = models.DecimalField(
        _("Naqd xarajatlar"), max_digits=12, decimal_places=2, default=Decimal("0.00")
    )
    card_expenses = models.DecimalField(
        _("Karta xarajatlar"), max_digits=12, decimal_places=2, default=Decimal("0.00")
    )
    status = models.CharField(
        _("Holati"), max_length=10, choices=CashShiftStatus.choices, default=CashShiftStatus.OPEN
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_shifts",
        verbose_name=_("Tasdiqlagan shaxs"),
    )

    class Meta:
        verbose_name = _("Kassa Smenasi")
        verbose_name_plural = _("Kassa Smenalari")
        ordering = ["-opened_at"]

    def __str__(self):
        return f"Shift {self.pk} - {self.administrator.get_full_name()}"


# ---------------------------------------------------------------------------
# Expenses
# ---------------------------------------------------------------------------
class ExpenseCategory(BaseModel):
    name = models.CharField(_("Toifa nomi"), max_length=100)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = _("Xarajat toifasi")
        verbose_name_plural = _("Xarajat toifalari")
        ordering = ["name"]

    def __str__(self):
        return self.name


class Expense(BaseModel):
    category = models.ForeignKey(
        ExpenseCategory, on_delete=models.PROTECT, related_name="expenses", verbose_name=_("Toifa")
    )
    amount = models.DecimalField(_("Summa"), max_digits=12, decimal_places=2)
    description = models.TextField(_("Izoh"), blank=True, default="")
    date = models.DateTimeField(_("Sana"), default=timezone.now)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recorded_expenses",
        verbose_name=_("Kiritgan shaxs"),
    )
    payment_method = models.CharField(
        _("To'lov usuli"), max_length=20, choices=PaymentMethod.choices, default=PaymentMethod.CASH
    )
    cash_shift = models.ForeignKey(
        CashShift,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="expenses",
        verbose_name=_("Smena"),
    )

    class Meta:
        verbose_name = _("Xarajat")
        verbose_name_plural = _("Xarajatlar")
        ordering = ["-date"]

    def __str__(self):
        return f"{self.category.name} - {self.amount}"


# ---------------------------------------------------------------------------
# Payroll / Salary
# ---------------------------------------------------------------------------
class SalaryPayment(BaseModel):
    """Records a salary/commission payout to a doctor."""
    doctor = models.ForeignKey(
        "doctors.DoctorProfile",
        on_delete=models.PROTECT,
        related_name="salary_payments",
        verbose_name=_("Shifokor"),
    )
    amount = models.DecimalField(
        _("To'langan summa"), 
        max_digits=12, 
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))]
    )
    payment_method = models.CharField(
        _("To'lov usuli"), 
        max_length=20, 
        choices=PaymentMethod.choices, 
        default=PaymentMethod.CASH
    )
    expense = models.OneToOneField(
        Expense,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="salary_payment",
        verbose_name=_("Xarajat yozuvi")
    )
    cash_shift = models.ForeignKey(
        CashShift,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="salary_payments",
        verbose_name=_("Kassa Smenasi"),
    )
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recorded_salaries",
        verbose_name=_("Kiritgan shaxs"),
    )
    notes = models.TextField(_("Izoh"), blank=True, default="")
    date = models.DateTimeField(_("Sana"), default=timezone.now)

    class Meta:
        verbose_name = _("Ish haqi to'lovi")
        verbose_name_plural = _("Ish haqi to'lovlari")
        ordering = ["-date"]

    def __str__(self):
        return f"SalaryPayment({self.doctor_id}, {self.amount})"


__all__ = [
    "Payment",
    "CommissionRecord",
    "CashShift",
    "PaymentMethod",
    "CommissionBasisSnapshot",
    "CashShiftStatus",
    "RefundStatus",
    "ExpenseCategory",
    "Expense",
    "SalaryPayment",
]
