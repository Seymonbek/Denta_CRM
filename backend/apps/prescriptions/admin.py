"""Django admin registrations for the ``prescriptions`` app."""
from __future__ import annotations

from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import Prescription, PrescriptionTemplate


@admin.register(PrescriptionTemplate)
class PrescriptionTemplateAdmin(ModelAdmin):
    list_display = ("name", "created_by", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name", "content")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(Prescription)
class PrescriptionAdmin(ModelAdmin):
    list_display = (
        "id",
        "treatment",
        "template",
        "sent_to_telegram_at",
        "is_active",
        "created_at",
    )
    list_filter = ("is_active", "sent_to_telegram_at")
    search_fields = ("content", "treatment__id")
    readonly_fields = ("id", "created_at", "updated_at")

