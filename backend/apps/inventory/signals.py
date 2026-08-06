"""Signal handlers for the ``inventory`` app.

Wires ``post_save`` on :class:`~apps.inventory.models.MaterialUsage`
to :func:`apps.inventory.services.apply_usage_to_stock` so that stock
is decremented atomically whenever a usage row is created. Deletion is
intentionally NOT reversed — corrections must be made through
:func:`apps.inventory.services.adjust_stock`.
"""
from __future__ import annotations

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import MaterialUsage
from .services import apply_usage_to_stock

logger = logging.getLogger(__name__)


@receiver(post_save, sender=MaterialUsage, dispatch_uid="inventory.material_usage.apply_stock")
def _on_material_usage_created(sender, instance: MaterialUsage, created: bool, **kwargs):
    """Decrement stock the moment a usage is inserted."""
    if not created:
        return
    try:
        apply_usage_to_stock(instance)
    except Exception:  # noqa: BLE001 — never swallow silently in signals
        logger.exception(
            "inventory: apply_usage_to_stock failed for usage %s",
            instance.pk,
        )
        raise


__all__ = ["_on_material_usage_created"]
