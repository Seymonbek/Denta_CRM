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
from django.core.validators import MaxValueValidator, MinValueValidator
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


class ApprovalStatus(models.TextChoices):
    PENDING = "pending", _("Kutilmoqda")
    APPROVED = "approved", _("Tasdiqlangan")
    REJECTED = "rejected", _("Rad etilgan")


class PlanStatus(models.TextChoices):
    DRAFT = "draft", _("Qoralama")
    PROPOSED = "proposed", _("Taklif qilingan")
    ACCEPTED = "accepted", _("Bemor qabul qilgan")
    IN_PROGRESS = "in_progress", _("Bajarilmoqda")
    COMPLETED = "completed", _("Yakunlangan")
    CANCELLED = "cancelled", _("Bekor qilingan")


class PlanItemStatus(models.TextChoices):
    PLANNED = "planned", _("Rejalashtirilgan")
    IN_PROGRESS = "in_progress", _("Bajarilmoqda")
    COMPLETED = "completed", _("Yakunlangan")
    CANCELLED = "cancelled", _("Bekor qilingan")


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
# ICD-10 Diagnosis Catalog
# ---------------------------------------------------------------------------
class ICD10Diagnosis(BaseModel):
    """Xalqaro Kasalliklar Tasnifi (XKT-10 / ICD-10) stomatologik tashxislar katalogi."""

    code = models.CharField(_("XKT-10 Kodi"), max_length=20, unique=True, db_index=True)
    name_uz = models.CharField(_("Tashxis nomi (O'zbekcha)"), max_length=300)
    name_ru = models.CharField(_("Tashxis nomi (Ruscha)"), max_length=300, blank=True, default="")
    category = models.CharField(_("Kategoriya"), max_length=150, blank=True, default="")
    is_common = models.BooleanField(_("Ko'p uchraydigan"), default=True)

    class Meta:
        verbose_name = _("XKT-10 Tashxis")
        verbose_name_plural = _("XKT-10 Tashxislar")
        ordering = ["code"]

    def __str__(self) -> str:
        return f"{self.code} - {self.name_uz}"


# ---------------------------------------------------------------------------
# Treatment Plan & Plan Items
# ---------------------------------------------------------------------------
class TreatmentPlan(BaseModel):
    """Bemor uchun kompleks davolash rejasi (Smeta)."""

    Status = PlanStatus

    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.PROTECT,
        related_name="treatment_plans",
        related_query_name="treatment_plan",
        verbose_name=_("Bemor"),
    )
    doctor = models.ForeignKey(
        "doctors.DoctorProfile",
        on_delete=models.PROTECT,
        related_name="treatment_plans",
        related_query_name="treatment_plan",
        verbose_name=_("Shifokor"),
    )
    title = models.CharField(_("Reja nomi"), max_length=250, default="Kompleks davolash rejasi")
    status = models.CharField(
        _("Holati"),
        max_length=20,
        choices=PlanStatus.choices,
        default=PlanStatus.PROPOSED,
    )
    notes = models.TextField(_("Klinik izohlar"), blank=True, default="")
    discount_percent = models.DecimalField(
        _("Chegirma foizi"),
        max_digits=5,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00")), MaxValueValidator(Decimal("100.00"))],
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_treatment_plans",
        verbose_name=_("Tuzgan xodim"),
    )

    history = HistoricalRecords(
        inherit=True,
        table_name="treatments_treatmentplan_history",
    )

    class Meta:
        verbose_name = _("Davolash rejasi")
        verbose_name_plural = _("Davolash rejalari")
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.title} ({self.patient})"

    @property
    def total_estimated_price(self) -> Decimal:
        return sum(
            (item.estimated_price for item in self.items.filter(is_active=True)),
            Decimal("0.00"),
        )

    @property
    def final_price_with_discount(self) -> Decimal:
        total = self.total_estimated_price
        if self.discount_percent > 0:
            discount_amount = total * self.discount_percent / Decimal("100")
            return max(Decimal("0.00"), total - discount_amount)
        return total


class TreatmentPlanItem(BaseModel):
    """Davolash rejasining alohida bandi / bosqichi."""

    Status = PlanItemStatus

    plan = models.ForeignKey(
        TreatmentPlan,
        on_delete=models.CASCADE,
        related_name="items",
        related_query_name="item",
        verbose_name=_("Davolash rejasi"),
    )
    tooth_number = models.PositiveSmallIntegerField(
        _("Tish raqami (FDI)"),
        null=True,
        blank=True,
        help_text=_("Ixtiyoriy: muayyan tishga tegishli bo'lsa (11-85)."),
    )
    procedure_type = models.ForeignKey(
        "doctors.ProcedureType",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="plan_items",
        verbose_name=_("Muolaja turi"),
    )
    order = models.PositiveSmallIntegerField(_("Bosqich tartibi"), default=1)
    title = models.CharField(_("Bosqich / Muolaja nomi"), max_length=250)
    estimated_price = models.DecimalField(
        _("Taxminiy narx"),
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    status = models.CharField(
        _("Holati"),
        max_length=20,
        choices=PlanItemStatus.choices,
        default=PlanItemStatus.PLANNED,
    )
    completed_treatment = models.ForeignKey(
        "treatments.Treatment",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="plan_items_completed",
        verbose_name=_("Bajarilgan davolash"),
    )
    notes = models.TextField(_("Izoh"), blank=True, default="")

    class Meta:
        verbose_name = _("Davolash rejasi bandi")
        verbose_name_plural = _("Davolash rejasi bandlari")
        ordering = ["plan", "order", "created_at"]

    def __str__(self) -> str:
        return f"{self.order}. {self.title} - {self.estimated_price} ({self.status})"


# ---------------------------------------------------------------------------
# Treatment
# ---------------------------------------------------------------------------
class Treatment(BaseModel):
    """A single clinical treatment (davolash yozuvi)."""

    PaymentStatus = PaymentStatus  # convenience re-exports
    Stage = TreatmentStage
    ApprovalStatus = ApprovalStatus

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
    icd_code = models.CharField(
        _("XKT-10 Kodi"),
        max_length=20,
        blank=True,
        default="",
    )
    icd_diagnosis = models.ForeignKey(
        ICD10Diagnosis,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="treatments",
        verbose_name=_("XKT-10 Tashxis"),
    )
    plan_item = models.ForeignKey(
        TreatmentPlanItem,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="completed_treatments",
        verbose_name=_("Reja bandi"),
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
    original_price = models.DecimalField(
        _("Asl Narx"),
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    discount_percent = models.DecimalField(
        _("Chegirma foizi"),
        max_digits=5,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    discount_reason = models.CharField(
        _("Chegirma sababi"),
        max_length=500,
        blank=True,
        default="",
    )
    approval_status = models.CharField(
        _("Tasdiqlash holati"),
        max_length=20,
        choices=ApprovalStatus.choices,
        default=ApprovalStatus.APPROVED,
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

    def save(self, *args, **kwargs) -> None:
        if self.image:
            from PIL import Image
            import io
            import sys
            import os
            from django.core.files.uploadedfile import InMemoryUploadedFile
            
            is_new = True
            if self.pk:
                try:
                    orig = TreatmentPhoto.objects.get(pk=self.pk)
                    if orig.image == self.image:
                        is_new = False
                except TreatmentPhoto.DoesNotExist:
                    pass
            
            if is_new:
                try:
                    im = Image.open(self.image)
                    if im.mode in ("RGBA", "P"):
                        im = im.convert("RGB")
                    
                    im.thumbnail((1920, 1080), Image.Resampling.LANCZOS)
                    output = io.BytesIO()
                    im.save(output, format='JPEG', quality=70)
                    output.seek(0)
                    
                    basename = os.path.basename(self.image.name)
                    name_without_ext = os.path.splitext(basename)[0]
                    
                    self.image = InMemoryUploadedFile(
                        output, 'ImageField', f"{name_without_ext}.jpg",
                        'image/jpeg', sys.getsizeof(output), None
                    )
                    
                    im.thumbnail((300, 300), Image.Resampling.LANCZOS)
                    thumb_output = io.BytesIO()
                    im.save(thumb_output, format='JPEG', quality=60)
                    thumb_output.seek(0)
                    
                    self.thumbnail = InMemoryUploadedFile(
                        thumb_output, 'ImageField', f"{name_without_ext}_thumb.jpg",
                        'image/jpeg', sys.getsizeof(thumb_output), None
                    )
                except Exception:
                    # Ignore image processing errors (e.g. invalid file)
                    pass

        super().save(*args, **kwargs)


__all__ = [
    "Treatment",
    "TreatmentPhoto",
    "ICD10Diagnosis",
    "TreatmentPlan",
    "TreatmentPlanItem",
    "PaymentStatus",
    "TreatmentStage",
    "ApprovalStatus",
    "PlanStatus",
    "PlanItemStatus",
    "PhotoType",
]
