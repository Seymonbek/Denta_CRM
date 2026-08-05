"""Models for the ``notifications`` app.

* :class:`NotificationLog` is the append-only audit trail for every
  outbound message — one row per delivery attempt. It stores enough
  context (target ``user`` / ``patient``, ``type`` classifier,
  ``status`` state machine, ``sent_at`` timestamp) for the frontend to
  render an activity feed and for support to investigate delivery
  failures.

* Statuses form a simple state machine::

      pending → sent
      pending → failed

  Once ``sent``/``failed`` a row is immutable — corrections must be a
  new row.

* ``context`` (JSONField) is a bounded free-form payload where callers
  store IDs relevant to the message (e.g. ``material_id`` for a
  low-stock alert, ``appointment_id`` for a reminder). The frontend
  uses it to deep-link back into the app.
"""
from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.core.models import BaseModel


class NotificationStatus(models.TextChoices):
    """State machine for delivery."""

    PENDING = "pending", _("Kutilmoqda")
    SENT = "sent", _("Yuborilgan")
    FAILED = "failed", _("Xato")


class NotificationChannel(models.TextChoices):
    """Where the message is delivered."""

    TELEGRAM = "telegram", _("Telegram")
    IN_APP = "in_app", _("Ilova ichida")
    SMS = "sms", _("SMS")


class NotificationType(models.TextChoices):
    """Canonical event types — kept as a closed enum so the frontend
    can map to translated labels + icons."""

    LOW_STOCK = "inventory.low_stock", _("Zaxira kam qoldi")
    APPOINTMENT_REMINDER_1D = (
        "appointments.reminder_1d",
        _("Navbat eslatmasi (1 kun)"),
    )
    APPOINTMENT_REMINDER_2H = (
        "appointments.reminder_2h",
        _("Navbat eslatmasi (2 soat)"),
    )
    APPOINTMENT_CANCELLED = (
        "appointments.cancelled",
        _("Navbat bekor qilindi"),
    )
    PRESCRIPTION_SENT = "prescriptions.sent", _("Retsept yuborildi")
    PAYMENT_RECEIVED = "payments.received", _("To'lov qabul qilindi")
    FOLLOWUP_INVITE = "patients.followup_invite", _("Profilaktik taklif")
    NEW_PATIENT = "patients.new", _("Yangi bemor")
    RATING_MILESTONE = "ratings.milestone", _("Reyting yutugi")
    GENERIC = "generic", _("Umumiy")


class NotificationLog(BaseModel):
    """One row per outbound message."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="notifications_received",
        related_query_name="notification_received",
        null=True,
        blank=True,
        verbose_name=_("Foydalanuvchi (xodim)"),
    )
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.SET_NULL,
        related_name="notifications_received",
        related_query_name="notification_received",
        null=True,
        blank=True,
        verbose_name=_("Bemor"),
    )
    type = models.CharField(
        _("Turi"),
        max_length=64,
        choices=NotificationType.choices,
        default=NotificationType.GENERIC,
    )
    channel = models.CharField(
        _("Kanal"),
        max_length=20,
        choices=NotificationChannel.choices,
        default=NotificationChannel.TELEGRAM,
    )
    message = models.TextField(_("Xabar"))
    status = models.CharField(
        _("Holat"),
        max_length=20,
        choices=NotificationStatus.choices,
        default=NotificationStatus.PENDING,
    )
    context = models.JSONField(
        _("Kontekst"),
        default=dict,
        blank=True,
        help_text=_(
            "Xabarga tegishli qo'shimcha ma'lumot (material_id, appointment_id, ...)."
        ),
    )
    error_detail = models.TextField(
        _("Xato tafsiloti"),
        blank=True,
        default="",
    )
    sent_at = models.DateTimeField(
        _("Yuborilgan vaqti"),
        null=True,
        blank=True,
    )
    external_message_id = models.CharField(
        _("Tashqi xabar ID"),
        max_length=128,
        blank=True,
        default="",
        help_text=_("Masalan, Telegram ``message_id``."),
    )

    class Meta:
        verbose_name = _("Bildirishnoma")
        verbose_name_plural = _("Bildirishnomalar")
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "-created_at"], name="notif_status_idx"),
            models.Index(fields=["type"], name="notif_type_idx"),
            models.Index(fields=["user", "-created_at"], name="notif_user_idx"),
            models.Index(fields=["patient", "-created_at"], name="notif_patient_idx"),
        ]
        constraints = [
            # A notification must target either a user, a patient, or
            # both — a fully empty target is meaningless.
            models.CheckConstraint(
                check=(
                    models.Q(user__isnull=False) | models.Q(patient__isnull=False)
                ),
                name="notif_has_target",
            ),
        ]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        who = self.user_id or self.patient_id or "?"
        return f"[{self.type}] → {who} ({self.status})"

    # ------------------------------------------------------------------
    # Domain helpers
    # ------------------------------------------------------------------
    @property
    def is_terminal(self) -> bool:
        """True when the delivery attempt is finalised (sent/failed)."""
        return self.status in {
            NotificationStatus.SENT,
            NotificationStatus.FAILED,
        }


__all__ = [
    "NotificationLog",
    "NotificationStatus",
    "NotificationChannel",
    "NotificationType",
]
