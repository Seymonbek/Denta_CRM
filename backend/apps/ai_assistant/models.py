"""Models for the ``ai_assistant`` app.

Provides configurable AI data permissions set by Bosh Shifokor.
"""
from __future__ import annotations

from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.core.models import BaseModel


class AIPermissionConfig(BaseModel):
    """Dynamic permission rules for AI data access per role or user."""

    class TargetRole(models.TextChoices):
        DOCTOR = "doctor", _("Shifokor")
        ADMINISTRATOR = "administrator", _("Administrator")

    role = models.CharField(
        _("Rol"),
        max_length=20,
        choices=TargetRole.choices,
        unique=True,
    )
    can_view_inventory_costs = models.BooleanField(
        _("Ombor narxlarini ko'rish"),
        default=False,
    )
    can_view_financial_reports = models.BooleanField(
        _("Moliyaviy hisobotlarni ko'rish"),
        default=False,
    )
    can_view_other_doctors_stats = models.BooleanField(
        _("Boshqa shifokorlar statistikasini ko'rish"),
        default=False,
    )
    can_view_all_patients = models.BooleanField(
        _("Barcha bemorlar ma'lumotini ko'rish"),
        default=False,
    )

    class Meta:
        verbose_name = _("AI Ruxsat Sozlamasi")
        verbose_name_plural = _("AI Ruxsat Sozlamalari")

    def __str__(self) -> str:
        return f"AI Permissions: {self.get_role_display()}"
