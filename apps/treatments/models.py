"""Models for the ``treatments`` app.

Design decisions:

* Inherits :class:`apps.core.models.BaseModel` for the UUID pk, audit
  timestamps, and ``is_active`` soft-flag.
* All FKs use ``PROTECT`` (patient / doctor / department) to preserve
  the audit trail. ``appointment`` uses ``SET_NULL`` so a treatment
  can survive an appointment being removed (rare, but the clinical
  record must not vanish). ``procedure_type`` uses ``SET_NULL`` for
  the same reason.
* ``price`` is a positive :class:`Decimal` at DB level.
* ``payment_status`` and ``stage`` are small closed enums matching
  PROJECT_BRIEF § "treatments app".
* :mod:`simple_history` records every change (PROJECT_BRIEF §
  "Constraints" — Treatment/Payment/Material must be audit-tracked).
* :class:`TreatmentPhoto` stores the raw upload plus an optional
  thumbnail path (populated by the T23 celery task). The
  ``uploaded_at`` field is separate from ``created_at`` to match the
  brief field-list literally.
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
class PaymentStatus(models.TextChoices):
    UNPAID = "unpaid", _("To'lanmagan")
    PARTIAL = "partial", _("Qisman to'langan")
    PAID = "paid", _("To'langan")


class TreatmentStage(models.TextChoices):
    IN_PROGRESS = "in_progress", _("Davom etmoqda")
    COMPLETED = "completed", _("Yakunlangan")


class PhotoType(models.TextChoices):
    BEFORE = "before", _("Davolashdan oldin")
    AFTER = "after", _("Davolashdan keyin")
    XRAY = "xray", _("Rentgen")


def _treatment_photo_upload_to(instance: TreatmentPhoto, filename: str) -> str:
    """Store photos under ``treatments/<treatment_id>/<photo_type>/<filename>``."""
    tid = instance.treatment_id or "unknown"
    ptype = instance.photo_type or "misc"
    return f"treatments/{tid}/{ptype}/{filename}"


# ---------------------------------------------------------------------------
# Treatment
# ---------------------------------------------------------------------------
class Treatment(BaseModel):
    """A single clinical treatment (davolash yozuvi)."""

    PaymentStatus = PaymentStatus  # convenience re-exports
    Stage = TreatmentStage

    appointment = models.ForeignKey(
        "scheduling.Appointment",
        on_delete=models.SET_NULL,
        related_name="treatments",
        related_query_name="treatment",
        verbose_name=_("Navbat"),
        null=True,
        blank=True,
    )
    doctor = models.ForeignKey(
        "doctors.DoctorProfile",
        on_delete=models.PROTECT,
        related_name="treatments",
        related_query_name="treatment",
        verbose_name=_("Shifokor"),
    )
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.PROTECT,
        related_name="treatments",
        related_query_name="treatment",
        verbose_name=_("Bemor"),
    )
    department = models.ForeignKey(
        "departments.Department",
        on_delete=models.PROTECT,
        related_name="treatments",
        related_query_name="treatment",
        verbose_name=_("Bo'lim"),
    )
    procedure_type = models.ForeignKey(
        "doctors.ProcedureType",
        on_delete=models.SET_NULL,
        related_name="treatments",
        related_query_name="treatment",
        verbose_name=_("Muolaja turi"),
        null=True,
        blank=True,
    )
    diagnosis = models.CharField(
        _("Tashxis"),
        max_length=500,
        blank=True,
        default="",
    )
    description = models.TextField(
        _("Tavsif"),
        blank=True,
        default="",
    )
    price = models.DecimalField(
        _("Narx"),
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    payment_status = models.CharField(
        _("To'lov holati"),
        max_length=10,
        choices=PaymentStatus.choices,
        default=PaymentStatus.UNPAID,
    )
    stage = models.CharField(
        _("Bosqichi"),
        max_length=20,
        choices=TreatmentStage.choices,
        default=TreatmentStage.IN_PROGRESS,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="treatments_created",
        related_query_name="treatment_created",
        verbose_name=_("Yaratgan foydalanuvchi"),
        null=True,
        blank=True,
    )

    history = HistoricalRecords(
        inherit=True,
        table_name="treatments_treatment_history",
    )

    class Meta:
        verbose_name = _("Davolash")
        verbose_name_plural = _("Davolashlar")
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                check=models.Q(price__gte=0),
                name="treatments_treatment_price_non_negative",
            ),
        ]
        indexes = [
            models.Index(fields=["patient", "-created_at"], name="tr_patient_idx"),
            models.Index(fields=["doctor", "-created_at"], name="tr_doctor_idx"),
            models.Index(fields=["payment_status"], name="tr_paystatus_idx"),
            models.Index(fields=["stage"], name="tr_stage_idx"),
        ]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"Treatment({self.patient_id}, {self.diagnosis[:40]}, {self.stage})"

    @property
    def is_completed(self) -> bool:
        return self.stage == TreatmentStage.COMPLETED


# ---------------------------------------------------------------------------
# TreatmentPhoto
# ---------------------------------------------------------------------------
class TreatmentPhoto(BaseModel):
    """Before / after / x-ray photo attached to a :class:`Treatment`."""

    PhotoType = PhotoType  # convenience re-export

    treatment = models.ForeignKey(
        Treatment,
        on_delete=models.CASCADE,
        related_name="photos",
        related_query_name="photo",
        verbose_name=_("Davolash"),
    )
    photo_type = models.CharField(
        _("Rasm turi"),
        max_length=10,
        choices=PhotoType.choices,
    )
    image = models.FileField(
        _("Rasm"),
        upload_to=_treatment_photo_upload_to,
        max_length=500,
    )
    thumbnail = models.FileField(
        _("Thumbnail"),
        upload_to="treatments/thumbnails/",
        max_length=500,
        null=True,
        blank=True,
        help_text=_(
            "T23 (Celery task) tomonidan generatsiya qilingan 300px "
            "kichraytirilgan rasm. Bo'sh bo'lsa asosiy rasm ko'rsatiladi."
        ),
    )
    thumbnail_path = models.CharField(
        _("Thumbnail yo'li"),
        max_length=500,
        blank=True,
        default="",
        help_text=_(
            "Thumbnail fayl yo'li (denormalizatsiya — API ni tez oqish uchun)."
        ),
    )
    uploaded_at = models.DateTimeField(
        _("Yuklangan sana"),
        auto_now_add=True,
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="treatment_photos_uploaded",
        verbose_name=_("Yuklagan foydalanuvchi"),
        null=True,
        blank=True,
    )
    caption = models.CharField(
        _("Izoh"),
        max_length=255,
        blank=True,
        default="",
    )

    class Meta:
        verbose_name = _("Davolash rasmi")
        verbose_name_plural = _("Davolash rasmlari")
        ordering = ["-uploaded_at"]
        indexes = [
            models.Index(
                fields=["treatment", "photo_type"],
                name="tp_treatment_type_idx",
            ),
        ]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"TreatmentPhoto({self.treatment_id}, {self.photo_type})"


__all__ = [
    "Treatment",
    "TreatmentPhoto",
    "PaymentStatus",
    "TreatmentStage",
    "PhotoType",
]
