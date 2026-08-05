"""AppConfig for the ``accounts`` app."""
from __future__ import annotations

from django.apps import AppConfig


class AccountsConfig(AppConfig):
    """Users, OTP codes, and JWT authentication."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.accounts"
    label = "accounts"
    verbose_name = "Foydalanuvchilar va Xavfsizlik"

    def ready(self) -> None:
        from django.apps import apps
        from . import signals  # noqa: F401

        # Defensively backfill missing DoctorProfiles for doctors/bosh_shifokor
        try:
            from django.db import connection
            if "accounts_user" in connection.introspection.table_names():
                from apps.accounts.models import User
                from apps.doctors.models import DoctorProfile

                for user in User.objects.filter(role__in=["doctor", "bosh_shifokor"]):
                    if not DoctorProfile.objects.filter(user=user).exists():
                        DoctorProfile.objects.create(
                            user=user,
                            specialization="",
                            bio="",
                            commission_basis="from_total",
                            default_commission_rate=30.00,
                            can_view_other_doctors=False,
                            is_active=True,
                        )
        except Exception:  # noqa: BLE001
            pass

        
        # Translate built-in Auth app
        try:
            auth_config = apps.get_app_config("auth")
            auth_config.verbose_name = "Guruhlar va Huquqlar"
        except LookupError:
            pass

        # Translate Celery Results app
        try:
            celery_results_config = apps.get_app_config("django_celery_results")
            celery_results_config.verbose_name = "Celery Natijalari"
        except LookupError:
            pass

        # Translate Celery Beat app
        try:
            celery_beat_config = apps.get_app_config("django_celery_beat")
            celery_beat_config.verbose_name = "Celery Rejalashtiruvchi"
        except LookupError:
            pass

