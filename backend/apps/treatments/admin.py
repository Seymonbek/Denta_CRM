"""Django admin for the treatments app."""
from __future__ import annotations

from django.contrib import admin
from unfold.admin import ModelAdmin, TabularInline
from apps.payments.models import Payment, CommissionRecord
from .models import Treatment, TreatmentPhoto


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


class PaymentInline(TabularInline):
    model = Payment
    extra = 0
    fields = ("amount", "method", "received_by", "note", "created_at")
    readonly_fields = ("created_at",)
    autocomplete_fields = ("received_by",)

    def has_add_permission(self, request, obj=None):
        return not is_doctor_restricted(request.user)

    def has_change_permission(self, request, obj=None):
        return not is_doctor_restricted(request.user)

    def has_delete_permission(self, request, obj=None):
        return not is_doctor_restricted(request.user)


class CommissionRecordInline(TabularInline):
    model = CommissionRecord
    extra = 0
    fields = ("doctor", "amount", "rate", "basis", "base_amount", "material_cost", "calculated_at")
    readonly_fields = ("doctor", "amount", "rate", "basis", "base_amount", "material_cost", "calculated_at")
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Treatment)
class TreatmentAdmin(ModelAdmin):
    list_display = (
        "id",
        "patient",
        "doctor",
        "department",
        "price",
        "payment_status",
        "stage",
        "is_active",
        "created_at",
    )
    list_filter = ("payment_status", "stage", "department", "is_active")
    search_fields = (
        "diagnosis",
        "description",
        "patient__first_name",
        "patient__last_name",
        "patient__phone_number",
    )
    autocomplete_fields = ("appointment", "doctor", "patient", "department")
    readonly_fields = ("created_at", "updated_at")
    ordering = ("-created_at",)
    inlines = (PaymentInline, CommissionRecordInline)

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if is_doctor_restricted(request.user):
            profile = get_doctor_profile(request.user)
            if profile:
                return qs.filter(doctor=profile)
        return qs

    def save_model(self, request, obj, form, change):
        if is_doctor_restricted(request.user):
            profile = get_doctor_profile(request.user)
            if profile:
                obj.doctor = profile
        super().save_model(request, obj, form, change)

    def get_readonly_fields(self, request, obj=None):
        readonly = list(super().get_readonly_fields(request, obj))
        if is_doctor_restricted(request.user):
            readonly.append("doctor")
        return readonly


@admin.register(TreatmentPhoto)
class TreatmentPhotoAdmin(ModelAdmin):
    list_display = (
        "id",
        "treatment",
        "photo_type",
        "uploaded_at",
        "uploaded_by",
        "is_active",
    )
    list_filter = ("photo_type", "is_active")
    autocomplete_fields = ("treatment",)
    readonly_fields = ("uploaded_at", "created_at", "updated_at")
    ordering = ("-uploaded_at",)

