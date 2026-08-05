"""Django admin registration for accounts app (minimal but functional)."""
from __future__ import annotations

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.utils.translation import gettext_lazy as _
from unfold.admin import ModelAdmin
from unfold.forms import UserChangeForm, UserCreationForm

from .models import OTPCode, User


@admin.register(User)
class UserAdmin(DjangoUserAdmin, ModelAdmin):
    """Admin for the custom User model.

    We reuse Django's UserAdmin infrastructure but rewrite the fieldsets
    for our custom fields (``phone_number``, ``role``, ``telegram_chat_id``,
    ``two_factor_enabled``). The default admin form is left intact for
    superuser creation via ``createsuperuser``.
    """

    form = UserChangeForm
    add_form = UserCreationForm

    list_filter_sheet = True

    ordering = ("last_name", "first_name")
    list_display = ("phone_number", "first_name", "last_name", "role", "is_active")
    list_filter = ("role", "is_active", "is_staff", "two_factor_enabled")
    search_fields = ("phone_number", "first_name", "last_name")

    fieldsets = (
        (None, {"fields": ("phone_number", "password")}),
        (_("Shaxsiy ma'lumot"), {"fields": ("first_name", "last_name")}),
        (
            _("Rol va integratsiya"),
            {
                "fields": (
                    "role",
                    "telegram_chat_id",
                    "two_factor_enabled",
                )
            },
        ),
        (
            _("Ruxsatlar"),
            {
                "fields": (
                    "is_active",
                    "is_staff",
                    "is_superuser",
                    "groups",
                    "user_permissions",
                )
            },
        ),
        (_("Muhim sanalar"), {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": (
                    "phone_number",
                    "first_name",
                    "last_name",
                    "role",
                    "password1",
                    "password2",
                ),
            },
        ),
    )


@admin.register(OTPCode)
class OTPCodeAdmin(ModelAdmin):
    list_display = ("user", "purpose", "is_used", "expires_at", "created_at")
    list_filter = ("purpose", "is_used")
    search_fields = ("user__phone_number",)
    autocomplete_fields = ("user",)
    readonly_fields = ("created_at",)

