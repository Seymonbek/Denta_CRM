"""AppConfig for the ``prescriptions`` app."""
from __future__ import annotations

from django.apps import AppConfig


class PrescriptionsConfig(AppConfig):
    """Retseptlar (Prescription) app configuration."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.prescriptions"
    label = "prescriptions"
    verbose_name = "Retseptlar"

    def ready(self) -> None:
        from . import signals  # noqa: F401
