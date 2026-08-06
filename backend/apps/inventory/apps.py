"""AppConfig for the ``inventory`` app."""
from __future__ import annotations

from django.apps import AppConfig


class InventoryConfig(AppConfig):
    """Materiallar (Material / MaterialUsage / MaterialStockLog) app."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.inventory"
    label = "inventory"
    verbose_name = "Sklad va Ombor"

    def ready(self) -> None:  # pragma: no cover - import side-effect
        # Importing ``signals`` binds the post_save handlers on
        # MaterialUsage. Kept inside ``ready`` so migrations don't fire
        # signals before the app registry is populated.
        from . import signals  # noqa: F401
