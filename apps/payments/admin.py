"""Django admin registrations for the ``payments`` app."""
from __future__ import annotations

from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import CommissionRecord, Payment


def is_doctor_restricted(user):
    if user.is_superuser:
        return False
    if getattr(user, "role", None) != "doctor":
        return False
    try:
        profile = user.doctor_profile
        return not profile.can_view_other_doctors
    except Exception:
        return True


def get_doctor_profile(user):
    try:
        return user.doctor_profile
    except Exception:
        return None


@admin.register(Payment)
class PaymentAdmin(ModelAdmin):
    list_display = (
        "id", "treatment", "patient", "amount", "method",
        "received_by", "is_active", "created_at",
    )
    list_filter = ("method", "is_active", "created_at")
    search_fields = ("patient__first_name", "patient__last_name", "note")
    autocomplete_fields = ("treatment", "patient", "received_by")
    readonly_fields = ("id", "created_at", "updated_at")
    ordering = ("-created_at",)

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if is_doctor_restricted(request.user):
            profile = get_doctor_profile(request.user)
            if profile:
                return qs.filter(treatment__doctor=profile)
        return qs

    def has_add_permission(self, request):
        return not is_doctor_restricted(request.user)

    def has_change_permission(self, request, obj=None):
        return not is_doctor_restricted(request.user)

    def has_delete_permission(self, request, obj=None):
        return not is_doctor_restricted(request.user)


@admin.register(CommissionRecord)
class CommissionRecordAdmin(ModelAdmin):
    list_display = (
        "id", "doctor", "treatment", "amount", "rate",
        "basis", "material_cost", "calculated_at",
    )
    list_filter = ("basis", "calculated_at")
    search_fields = ("doctor__user__last_name",)
    autocomplete_fields = ("doctor", "treatment")
    readonly_fields = (
        "id", "created_at", "updated_at", "calculated_at",
        "base_amount", "material_cost",
    )
    ordering = ("-calculated_at",)

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if is_doctor_restricted(request.user):
            profile = get_doctor_profile(request.user)
            if profile:
                return qs.filter(doctor=profile)
        return qs

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

