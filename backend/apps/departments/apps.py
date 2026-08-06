"""AppConfig for the ``departments`` app."""
from __future__ import annotations

from django.apps import AppConfig


class DepartmentsConfig(AppConfig):
    """Clinical bo'limlar (Department) app configuration."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.departments"
    label = "departments"
    verbose_name = "Bo'limlar"
