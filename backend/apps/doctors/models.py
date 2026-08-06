"""Models for the ``doctors`` app.

Design notes:

* :class:`DoctorProfile` is a **1:1 extension** of ``accounts.User``. We
  keep authentication concerns (phone, password, role) on ``User`` and
  clinical concerns (department, specialization, commission) here so
  each app owns its own migrations. ``role`` on User must be either
  ``doctor`` or ``bosh_shifokor`` — validated at the service layer, not
  by a DB-level check, so we don't have to migrate whenever roles evolve.
* Commission logic — a small closed enum (``from_total`` / ``from_net``)
  driving the calculator in :mod:`apps.payments.services` (T17). The
  ``default_commission_rate`` is a percentage stored with two decimal
  places (e.g. ``30.00`` → 30 %). We validate 0 ≤ rate ≤ 100.
* :class:`WorkingHours` is a recurring weekly shift keyed by
  ``(doctor, weekday, start_time)`` so a doctor may have multiple non-
  overlapping shifts on the same day (e.g. 09:00–13:00 & 15:00–19:00).
* :class:`TimeOff` is a *closed-open* range on **dates** (whole-day
  granularity is sufficient for MVP). Overlap prevention is done at the
  service layer — an all-day range doesn't need PG exclusion constraints.
* :class:`ProcedureType` links a clinical procedure to a department and
  provides defaults that :class:`apps.treatments.Treatment` can override.
"""
from __future__ import annotations

from decimal import Decimal

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils.translation import gettext_lazy as _
from simple_history.models import HistoricalRecords

from apps.core.models import BaseModel


# ---------------------------------------------------------------------------
# Choices
# ---------------------------------------------------------------------------
class CommissionBasis(models.TextChoices):
    """Rule used when computing a doctor's commission on a treatment."""

    FROM_TOTAL = "from_total", _("Umumiy narxdan")
    FROM_NET = "from_net", _("Sof daromaddan (material chegirilgan)")


class Weekday(models.IntegerChoices):
    """ISO 8601 weekday (Monday = 0 … Sunday = 6)."""

    MONDAY = 0, _("Dushanba")
    TUESDAY = 1, _("Seshanba")
    WEDNESDAY = 2, _("Chorshanba")
    THURSDAY = 3, _("Payshanba")
    FRIDAY = 4, _("Juma")
    SATURDAY = 5, _("Shanba")
    SUNDAY = 6, _("Yakshanba")


# ---------------------------------------------------------------------------
# DoctorProfile
# ---------------------------------------------------------------------------
class DoctorProfile(BaseModel):
    """Clinical profile for a doctor / bosh_shifokor user."""

    user = models.OneToOneField(
        "accounts.User",
        on_delete=models.CASCADE,
        related_name="doctor_profile",
        verbose_name=_("Foydalanuvchi"),
    )
    departments = models.ManyToManyField(
        "departments.Department",
        related_name="doctors",
        related_query_name="doctor",
        verbose_name=_("Bo'limlar"),
        blank=True,
    )
    specialization = models.CharField(
        _("Mutaxassislik"),
        max_length=150,
        blank=True,
        default="",
    )
    bio = models.TextField(
        _("Biografiya"),
        blank=True,
        default="",
    )
    commission_basis = models.CharField(
        _("Komissiya asosi"),
        max_length=20,
        choices=CommissionBasis.choices,
        default=CommissionBasis.FROM_TOTAL,
    )
    default_commission_rate = models.DecimalField(
        _("Standart komissiya foizi"),
        max_digits=5,
        decimal_places=2,
        default=Decimal("30.00"),
        validators=[
            MinValueValidator(Decimal("0.00")),
            MaxValueValidator(Decimal("100.00")),
        ],
    )
    can_view_other_doctors = models.BooleanField(
        _("Boshqa shifokorlar ma'lumotini ko'ra oladi"),
        default=False,
    )

    history = HistoricalRecords(
        inherit=True,
        table_name="doctors_doctorprofile_history",
    )

    class Meta:
        verbose_name = _("Shifokor profili")
        verbose_name_plural = _("Shifokor profillari")
        ordering = ["user__last_name", "user__first_name"]
        indexes = [
            models.Index(fields=["is_active"], name="doctors_active_idx"),
        ]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        user = self.user
        name = user.get_full_name() if user else "?"
        return f"Dr. {name} ({self.specialization or _('umumiy')})"

    @property
    def effective_commission_rate(self) -> Decimal:
        """Return the rate used for treatments when no procedure override applies."""
        return Decimal(self.default_commission_rate)


# ---------------------------------------------------------------------------
# WorkingHours
# ---------------------------------------------------------------------------
class WorkingHours(BaseModel):
    """Recurring weekly shift for a doctor."""

    doctor = models.ForeignKey(
        DoctorProfile,
        on_delete=models.CASCADE,
        related_name="working_hours",
        related_query_name="working_hour",
        verbose_name=_("Shifokor"),
    )
    weekday = models.IntegerField(
        _("Hafta kuni"),
        choices=Weekday.choices,
    )
    start_time = models.TimeField(_("Boshlanish"))
    end_time = models.TimeField(_("Tugash"))

    class Meta:
        verbose_name = _("Ish soati")
        verbose_name_plural = _("Ish soatlari")
        ordering = ["doctor__user__last_name", "weekday", "start_time"]
        constraints = [
            models.UniqueConstraint(
                fields=["doctor", "weekday", "start_time"],
                name="doctors_workinghours_unique_slot",
            ),
            models.CheckConstraint(
                check=models.Q(start_time__lt=models.F("end_time")),
                name="doctors_workinghours_start_before_end",
            ),
        ]
        indexes = [
            models.Index(fields=["doctor", "weekday"], name="doctors_wh_by_day_idx"),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return (
            f"{self.doctor_id} w{self.weekday} "
            f"{self.start_time:%H:%M}-{self.end_time:%H:%M}"
        )


# ---------------------------------------------------------------------------
# TimeOff
# ---------------------------------------------------------------------------
class TimeOff(BaseModel):
    """One-off leave (inclusive date range) that suspends working hours."""

    doctor = models.ForeignKey(
        DoctorProfile,
        on_delete=models.CASCADE,
        related_name="time_off",
        related_query_name="time_off_entry",
        verbose_name=_("Shifokor"),
    )
    date_start = models.DateField(_("Boshlanish sanasi"))
    date_end = models.DateField(_("Tugash sanasi"))
    reason = models.CharField(
        _("Sabab"),
        max_length=255,
        blank=True,
        default="",
    )

    class Meta:
        verbose_name = _("Dam olish")
        verbose_name_plural = _("Dam olish kunlari")
        ordering = ["-date_start"]
        constraints = [
            models.CheckConstraint(
                check=models.Q(date_start__lte=models.F("date_end")),
                name="doctors_timeoff_start_lte_end",
            ),
        ]
        indexes = [
            models.Index(
                fields=["doctor", "date_start", "date_end"],
                name="doctors_timeoff_range_idx",
            ),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"TimeOff({self.doctor_id}) {self.date_start} → {self.date_end}"

    def covers(self, day) -> bool:
        """Return True if ``day`` (a ``date``) falls inside the leave range."""
        return self.date_start <= day <= self.date_end


# ---------------------------------------------------------------------------
# ProcedureType
# ---------------------------------------------------------------------------
class ProcedureType(BaseModel):
    """Clinical procedure catalog entry (default price + duration)."""

    name = models.CharField(_("Nomi"), max_length=150)
    department = models.ForeignKey(
        "departments.Department",
        on_delete=models.PROTECT,
        related_name="procedure_types",
        related_query_name="procedure_type",
        verbose_name=_("Bo'lim"),
    )
    default_duration_minutes = models.PositiveIntegerField(
        _("Standart davomiyligi (daqiqa)"),
        default=30,
        validators=[MinValueValidator(1), MaxValueValidator(24 * 60)],
    )
    default_price = models.DecimalField(
        _("Standart narx"),
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    commission_rate_override = models.DecimalField(
        _("Komissiya foizi (override)"),
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[
            MinValueValidator(Decimal("0.00")),
            MaxValueValidator(Decimal("100.00")),
        ],
        help_text=_(
            "Bo'sh qoldirilsa, shifokorning standart komissiya foizi ishlatiladi."
        ),
    )

    history = HistoricalRecords(
        inherit=True,
        table_name="doctors_proceduretype_history",
    )

    class Meta:
        verbose_name = _("Muolaja turi")
        verbose_name_plural = _("Muolaja turlari")
        ordering = ["department__name", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["department", "name"],
                condition=models.Q(is_active=True),
                name="doctors_proceduretype_dept_name_unique",
            ),
        ]
        indexes = [
            models.Index(fields=["department"], name="doctors_pt_dept_idx"),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"{self.name} ({self.department_id})"


__all__ = [
    "CommissionBasis",
    "Weekday",
    "DoctorProfile",
    "WorkingHours",
    "TimeOff",
    "ProcedureType",
]
