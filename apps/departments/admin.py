"""Django admin for the departments app."""
from __future__ import annotations

from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import Department


@admin.register(Department)
class DepartmentAdmin(ModelAdmin):
    list_display = ("name", "is_active", "created_by", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name", "description")
    autocomplete_fields = ("created_by",)
    readonly_fields = ("created_at", "updated_at")
    ordering = ("name",)

