"""Django-admin registration for the ``ratings`` app."""
from __future__ import annotations

from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import Badge, DoctorBadge, ScoreLog


@admin.register(ScoreLog)
class ScoreLogAdmin(ModelAdmin):
    list_display = ("doctor", "points", "reason", "created_at")
    list_filter = ("reason",)
    search_fields = ("doctor__user__first_name", "doctor__user__last_name", "note")
    raw_id_fields = ("doctor", "related_patient", "related_treatment")
    date_hierarchy = "created_at"


@admin.register(Badge)
class BadgeAdmin(ModelAdmin):
    list_display = ("slug", "name", "icon", "is_active")
    search_fields = ("slug", "name")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(DoctorBadge)
class DoctorBadgeAdmin(ModelAdmin):
    list_display = ("doctor", "badge", "period", "total_points", "awarded_at")
    list_filter = ("period", "badge")
    search_fields = ("doctor__user__first_name", "doctor__user__last_name")
    raw_id_fields = ("doctor", "badge")

