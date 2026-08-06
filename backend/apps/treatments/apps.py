"""AppConfig for the ``treatments`` app."""
from __future__ import annotations

from django.apps import AppConfig


class TreatmentsConfig(AppConfig):
    """Davolash yozuvlari (Treatment) app configuration."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.treatments"
    label = "treatments"
    verbose_name = "Davolash Yozuvlari"

    def ready(self) -> None:  # pragma: no cover - import side-effect
        # Register post_save signal for thumbnail generation.
        from . import signals  # noqa: F401
