"""AppConfig for the ``odontogram`` app."""
from __future__ import annotations

from django.apps import AppConfig


class OdontogramConfig(AppConfig):
    """Odontogram (tish formulasi) app configuration."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.odontogram"
    label = "odontogram"
    verbose_name = "Tish Kartasi (Odontogram)"
