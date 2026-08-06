"""Django admin registration for the ``inventory`` app."""
from __future__ import annotations

from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import Material, MaterialStockLog, MaterialUsage


@admin.register(Material)
class MaterialAdmin(ModelAdmin):
    list_display = (
        "name",
        "unit",
        "quantity_in_stock",
        "minimum_threshold",
        "unit_cost",
        "is_active",
    )
    list_filter = ("unit", "is_active")
    search_fields = ("name", "notes")
    ordering = ("name",)
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(MaterialUsage)
class MaterialUsageAdmin(ModelAdmin):
    list_display = ("material", "treatment", "quantity_used", "recorded_by", "created_at")
    list_filter = ("material",)
    search_fields = ("material__name",)
    ordering = ("-created_at",)
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(MaterialStockLog)
class MaterialStockLogAdmin(ModelAdmin):
    list_display = (
        "material",
        "change_amount",
        "reason",
        "resulting_quantity",
        "performed_by",
        "created_at",
    )
    list_filter = ("reason", "material")
    search_fields = ("material__name", "note")
    ordering = ("-created_at",)
    readonly_fields = (
        "id",
        "material",
        "change_amount",
        "reason",
        "resulting_quantity",
        "related_treatment",
        "related_usage",
        "performed_by",
        "note",
        "created_at",
        "updated_at",
    )

    def has_add_permission(self, request):  # audit log is append-only
        return False

    def has_delete_permission(self, request, obj=None):  # audit log is append-only
        return False

