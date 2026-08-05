"""Django admin for the patients app."""
from __future__ import annotations

from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import Patient


@admin.register(Patient)
class PatientAdmin(ModelAdmin):
    list_display = (
        "last_name",
        "first_name",
        "phone_number",
        "gender",
        "is_active",
        "created_at",
    )
    list_filter = ("gender", "is_active")
    search_fields = ("first_name", "last_name", "phone_number", "notes")
    autocomplete_fields = ("created_by",)
    readonly_fields = ("created_at", "updated_at")
    ordering = ("last_name", "first_name")

