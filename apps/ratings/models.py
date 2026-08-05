"""Models for the ``ratings`` app.

Design decisions:

* Every model inherits :class:`apps.core.models.BaseModel` for the UUID
  pk, ``created_at`` / ``updated_at`` timestamps, and the ``is_active``
  soft-delete flag.
* :class:`ScoreLog` is append-only. Historical corrections are made by
  writing new rows with :class:`ScoreReason.ADJUSTMENT` (positive or
  negative points) rather than mutating existing entries.
* :class:`Badge` is a small reusable catalog — the same ``top_doctor``
  badge is awarded month after month via :class:`DoctorBadge`.
* :class:`DoctorBadge.period` is a compact ``YYYY-MM`` string so the
  leaderboard can filter by month cheaply and the frontend can display
  a period picker without extra formatting.
"""
from __future__ import annotations

from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.core.models import BaseModel


# ---------------------------------------------------------------------------
# Choices
# ---------------------------------------------------------------------------
class ScoreReason(models.TextChoices):
    """Why the doctor earned (or lost) points.

    PROJECT_BRIEF § "ratings app" lists the first four; ``ADJUSTMENT``
    is added so bosh_shifokor can hand-tune the ledger without breaking
    the append-only invariant.
    """

    NEW_PATIENT = "new_patient", _("Yangi bemor")
    TREATMENT_COMPLETED = "treatment_completed", _("Davolash yakunlandi")
    PHOTO_UPLOADED = "photo_uploaded", _("Rasm yuklandi")
    ACTIVITY_STREAK = "activity_streak", _("Faollik ketma-ketligi")
    ADJUSTMENT = "adjustment", _("Qo'lda tuzatish")


# Default points per reason. Overrideable via
# ``settings.RATINGS_POINTS_PER_REASON`` in prod.py if the clinic wants
# to reweight the leaderboard.
DEFAULT_POINTS_PER_REASON: dict[str, int] = {
    ScoreReason.NEW_PATIENT: 5,
    ScoreReason.TREATMENT_COMPLETED: 10,
    ScoreReason.PHOTO_UPLOADED: 2,
    ScoreReason.ACTIVITY_STREAK: 15,
    ScoreReason.ADJUSTMENT: 0,
}


# ---------------------------------------------------------------------------
# ScoreLog
# ---------------------------------------------------------------------------
class ScoreLog(BaseModel):
    """Append-only entry recording points awarded to a doctor."""

    doctor = models.ForeignKey(
        "doctors.DoctorProfile",
        on_delete=models.CASCADE,
        related_name="score_logs",
        related_query_name="score_log",
        verbose_name=_("Shifokor"),
    )
    points = models.IntegerField(
        _("Ballar"),
        help_text=_("Ijobiy — ball qo'shildi; manfiy — ball ayirildi."),
    )
    reason = models.CharField(
        _("Sabab"),
        max_length=30,
        choices=ScoreReason.choices,
    )
    related_patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.SET_NULL,
        related_name="score_logs",
        related_query_name="score_log",
        null=True,
        blank=True,
        verbose_name=_("Bog'liq bemor"),
    )
    related_treatment = models.ForeignKey(
        "treatments.Treatment",
        on_delete=models.SET_NULL,
        related_name="score_logs",
        related_query_name="score_log",
        null=True,
        blank=True,
        verbose_name=_("Bog'liq davolash"),
    )
    note = models.CharField(
        _("Izoh"),
        max_length=255,
        blank=True,
        default="",
    )

    class Meta:
        verbose_name = _("Ball yozuvi")
        verbose_name_plural = _("Ball yozuvlari")
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["doctor", "-created_at"], name="ratings_log_doctor_idx"),
            models.Index(fields=["reason"], name="ratings_log_reason_idx"),
            models.Index(fields=["created_at"], name="ratings_log_created_idx"),
        ]

    def __str__(self) -> str:  # pragma: no cover — repr helper
        return f"ScoreLog({self.doctor_id} {self.points:+d} {self.reason})"


# ---------------------------------------------------------------------------
# Badge
# ---------------------------------------------------------------------------
class Badge(BaseModel):
    """Catalog of achievement badges (top_doctor, first_100_patients, …)."""

    slug = models.SlugField(
        _("Kod"),
        max_length=64,
        unique=True,
        help_text=_("Barqaror identifikator, masalan 'top_doctor_month'."),
    )
    name = models.CharField(_("Nomi"), max_length=150)
    description = models.TextField(
        _("Tavsif"),
        blank=True,
        default="",
    )
    icon = models.CharField(
        _("Ikon"),
        max_length=100,
        blank=True,
        default="",
        help_text=_("Frontend'da ko'rsatiladigan ikon nomi (masalan 'trophy')."),
    )

    class Meta:
        verbose_name = _("Nishon")
        verbose_name_plural = _("Nishonlar")
        ordering = ["name"]

    def __str__(self) -> str:  # pragma: no cover
        return f"Badge({self.slug})"


# ---------------------------------------------------------------------------
# DoctorBadge
# ---------------------------------------------------------------------------
class DoctorBadge(BaseModel):
    """A :class:`Badge` awarded to a doctor for a specific period."""

    doctor = models.ForeignKey(
        "doctors.DoctorProfile",
        on_delete=models.CASCADE,
        related_name="badges",
        related_query_name="badge",
        verbose_name=_("Shifokor"),
    )
    badge = models.ForeignKey(
        Badge,
        on_delete=models.PROTECT,
        related_name="awards",
        related_query_name="award",
        verbose_name=_("Nishon"),
    )
    period = models.CharField(
        _("Davri"),
        max_length=16,
        help_text=_("Masalan '2026-07' — oylik reyting davri."),
    )
    awarded_at = models.DateTimeField(
        _("Berilgan sana"),
        auto_now_add=True,
    )
    total_points = models.IntegerField(
        _("Davr yakuni bo'yicha ballar"),
        default=0,
        help_text=_("Nishon berilgan paytdagi umumiy ballar (audit uchun snapshot)."),
    )

    class Meta:
        verbose_name = _("Shifokor nishoni")
        verbose_name_plural = _("Shifokor nishonlari")
        ordering = ["-awarded_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["doctor", "badge", "period"],
                name="ratings_doctorbadge_unique_per_period",
            ),
        ]
        indexes = [
            models.Index(fields=["doctor", "-awarded_at"], name="ratings_db_doctor_idx"),
            models.Index(fields=["period"], name="ratings_db_period_idx"),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"DoctorBadge({self.doctor_id} · {self.badge_id} · {self.period})"


__all__ = [
    "ScoreLog",
    "Badge",
    "DoctorBadge",
    "ScoreReason",
    "DEFAULT_POINTS_PER_REASON",
]
