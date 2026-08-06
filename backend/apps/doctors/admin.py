"""Django admin for the ``doctors`` app."""
from __future__ import annotations

from django.contrib import admin
from unfold.admin import ModelAdmin, TabularInline

from .models import DoctorProfile, ProcedureType, TimeOff, WorkingHours


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


class WorkingHoursInline(TabularInline):
    model = WorkingHours
    extra = 0
    fields = ("weekday", "start_time", "end_time")


class TimeOffInline(TabularInline):
    model = TimeOff
    extra = 0
    fields = ("date_start", "date_end", "reason")


@admin.register(DoctorProfile)
class DoctorProfileAdmin(ModelAdmin):
    list_display = (
        "user",
        "specialization",
        "commission_basis",
        "default_commission_rate",
        "is_active",
    )
    list_filter = ("commission_basis", "is_active")
    search_fields = (
        "user__first_name",
        "user__last_name",
        "user__phone_number",
        "specialization",
    )
    autocomplete_fields = ("user", "departments")
    filter_horizontal = ("departments",)
    readonly_fields = ("created_at", "updated_at")
    inlines = (WorkingHoursInline, TimeOffInline)

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if is_doctor_restricted(request.user):
            return qs.filter(user=request.user)
        return qs

    def get_readonly_fields(self, request, obj=None):
        readonly = list(super().get_readonly_fields(request, obj))
        if is_doctor_restricted(request.user):
            fields_to_add = ["user", "departments", "commission_basis", "default_commission_rate", "can_view_other_doctors", "is_active"]
            for f in fields_to_add:
                if f not in readonly:
                    readonly.append(f)
        return readonly


@admin.register(WorkingHours)
class WorkingHoursAdmin(ModelAdmin):
    list_display = ("doctor", "weekday", "start_time", "end_time")
    list_filter = ("weekday",)
    search_fields = ("doctor__user__first_name", "doctor__user__last_name")

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


@admin.register(TimeOff)
class TimeOffAdmin(ModelAdmin):
    list_display = ("doctor", "date_start", "date_end", "reason")
    list_filter = ("date_start",)
    search_fields = ("doctor__user__first_name", "doctor__user__last_name", "reason")

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


@admin.register(ProcedureType)
class ProcedureTypeAdmin(ModelAdmin):
    list_display = (
        "name",
        "department",
        "default_duration_minutes",
        "default_price",
        "is_active",
    )
    list_filter = ("department", "is_active")
    search_fields = ("name", "department__name")
    autocomplete_fields = ("department",)

