"""AppConfig for the ``patients`` app."""
from __future__ import annotations

from django.apps import AppConfig


class PatientsConfig(AppConfig):
    """Bemorlar (Patient) app configuration."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.patients"
    label = "patients"
    verbose_name = "Bemorlar"
