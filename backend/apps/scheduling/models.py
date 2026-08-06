"""Models for the ``scheduling`` app.

The single model is :class:`Appointment`. Design decisions:

* Inherits :class:`apps.core.models.BaseModel` for the UUID pk, audit
  timestamps, and ``is_active`` soft-flag. The soft flag is not part
  of the domain (we use ``status='cancelled'`` instead) but keeps the
  admin filter consistent with every other model.
* ``patient``, ``doctor``, ``department`` are all required and use
  ``PROTECT`` so we can never orphan an appointment when someone tries
  to hard-delete a related row. Soft-deletes still work because our
  business queries respect ``is_active``.
* ``procedure_type`` is nullable — a receptionist may create a slot
  before a specific procedure is chosen.
* ``scheduled_start`` / ``scheduled_end`` are timezone-aware datetimes.
  A ``CheckConstraint`` guarantees ``start < end`` at the DB level.
* ``status`` is a small closed enum matching PROJECT_BRIEF:
  ``scheduled / confirmed / in_progress / completed / cancelled /
  no_show``. Only the first three block a doctor's slot; completed /
  cancelled / no_show do not. This same set is used by the
  exclusion-constraint filter in migration 0002.
* ``reminder_*_sent`` flags are toggled by Celery beat tasks (T23) so
  reminders never fire twice.
* :mod:`simple_history` records every change (mandatory audit —
  PROJECT_BRIEF § Constraints).
"""
from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _
from simple_history.models import HistoricalRecords

from apps.core.models import BaseModel


class AppointmentStatus(models.TextChoices):
    SCHEDULED = "scheduled", _("Rejalashtirilgan")
    CONFIRMED = "confirmed", _("Tasdiqlangan")
    IN_PROGRESS = "in_progress", _("Bajarilmoqda")
    COMPLETED = "completed", _("Yakunlangan")
    CANCELLED = "cancelled", _("Bekor qilingan")
    NO_SHOW = "no_show", _("Kelmadi")


# Statuses that actually occupy a doctor's slot. Used by the overlap
# check in services.py and by the postgres exclusion constraint in the
# 0002 migration.
BLOCKING_STATUSES: tuple[str, ...] = (
    AppointmentStatus.SCHEDULED,
    AppointmentStatus.CONFIRMED,
    AppointmentStatus.IN_PROGRESS,
)


class Appointment(BaseModel):
    """A scheduled visit (navbat) for one patient with one doctor."""

    Status = AppointmentStatus  # convenience re-export

    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.PROTECT,
        related_name="appointments",
        related_query_name="appointment",
        verbose_name=_("Bemor"),
    )
    doctor = models.ForeignKey(
        "doctors.DoctorProfile",
        on_delete=models.PROTECT,
        related_name="appointments",
        related_query_name="appointment",
        verbose_name=_("Shifokor"),
    )
    department = models.ForeignKey(
        "departments.Department",
        on_delete=models.PROTECT,
        related_name="appointments",
        related_query_name="appointment",
        verbose_name=_("Bo'lim"),
    )
    procedure_type = models.ForeignKey(
        "doctors.ProcedureType",
        on_delete=models.SET_NULL,
        related_name="appointments",
        related_query_name="appointment",
        verbose_name=_("Muolaja turi"),
        null=True,
        blank=True,
    )
    scheduled_start = models.DateTimeField(_("Boshlanish"))
    scheduled_end = models.DateTimeField(_("Tugash"))
    status = models.CharField(
        _("Holati"),
        max_length=20,
        choices=AppointmentStatus.choices,
        default=AppointmentStatus.SCHEDULED,
    )
    notes = models.TextField(
        _("Izohlar"),
        blank=True,
        default="",
        help_text=_(
            "Reseptsionist yozib qo'yadigan izohlar (masalan, sabab)."
        ),
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="appointments_created",
        related_query_name="appointment_created",
        verbose_name=_("Yaratgan foydalanuvchi"),
        null=True,
        blank=True,
    )
    reminder_1d_sent = models.BooleanField(
        _("1 kunlik eslatma yuborilgan"),
        default=False,
    )
    reminder_2h_sent = models.BooleanField(
        _("2 soatlik eslatma yuborilgan"),
        default=False,
    )

    history = HistoricalRecords(
        inherit=True,
        table_name="scheduling_appointment_history",
    )

    class Meta:
        verbose_name = _("Navbat")
        verbose_name_plural = _("Navbatlar")
        ordering = ["-scheduled_start"]
        constraints = [
            models.CheckConstraint(
                check=models.Q(scheduled_start__lt=models.F("scheduled_end")),
                name="scheduling_appointment_start_before_end",
            ),
        ]
        indexes = [
            models.Index(
                fields=["doctor", "scheduled_start"],
                name="sched_appt_doc_start_idx",
            ),
            models.Index(
                fields=["patient", "scheduled_start"],
                name="sched_appt_pat_start_idx",
            ),
            models.Index(fields=["status"], name="sched_appt_status_idx"),
        ]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return (
            f"Appointment({self.patient_id} @ "
            f"{self.scheduled_start:%Y-%m-%d %H:%M}, {self.status})"
        )

    @property
    def is_blocking(self) -> bool:
        """Return True if this appointment occupies the doctor's slot."""
        return self.status in BLOCKING_STATUSES

    @property
    def duration_minutes(self) -> int:
        delta = self.scheduled_end - self.scheduled_start
        return int(delta.total_seconds() // 60)


__all__ = [
    "Appointment",
    "AppointmentStatus",
    "BLOCKING_STATUSES",
]
