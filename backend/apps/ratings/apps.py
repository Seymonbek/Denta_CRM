"""AppConfig for the ``ratings`` app."""
from __future__ import annotations

from django.apps import AppConfig


class RatingsConfig(AppConfig):
    """Doctor scoring, leaderboard, and achievement badges."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.ratings"
    label = "ratings"
    verbose_name = "Reyting va Nishonlar"

    def ready(self) -> None:  # pragma: no cover - import side-effect
        # Importing ``signals`` wires post_save hooks to
        # ``services.award_points`` so the ledger is populated
        # automatically when patients / treatments / photos are created.
        from . import signals  # noqa: F401
