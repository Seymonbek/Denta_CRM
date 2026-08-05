"""AppConfig for the ``reports`` app."""
from __future__ import annotations

from django.apps import AppConfig


class ReportsConfig(AppConfig):
    """Aggregate reports app (modelless)."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.reports"
    label = "reports"
    verbose_name = "Reports"
