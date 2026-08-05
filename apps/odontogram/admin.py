"""Django admin registration for the ``odontogram`` app."""
from __future__ import annotations

from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import ToothRecord


@admin.register(ToothRecord)
class ToothRecordAdmin(ModelAdmin):
    list_display = (
        "id",
        "treatment",
        "tooth_number",
        "procedure",
        "status",
        "is_active",
        "created_at",
    )
    list_filter = ("procedure", "status", "is_active")
    search_fields = (
        "id",
        "treatment__id",
        "treatment__patient__first_name",
        "treatment__patient__last_name",
    )
    autocomplete_fields = ("treatment",)
    readonly_fields = ("id", "created_at", "updated_at")

