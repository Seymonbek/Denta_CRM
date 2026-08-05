"""Celery tasks for the ``inventory`` app.

Contains:

* :func:`check_low_stock` — invoked per-Material after a stock change
  (see :mod:`apps.inventory.signals`). Enqueues a NotificationLog when
  the stock drops to or below ``minimum_threshold``.
* :func:`sweep_low_stock` — periodic sweep (beat) that walks every
  active material and re-notifies for anything still below threshold.
"""
from __future__ import annotations

import logging

from celery import shared_task

logger = logging.getLogger(__name__)


def _notify_low(material) -> bool:
    """Enqueue a low-stock NotificationLog. Returns True on success."""
    from django.contrib.auth import get_user_model

    from apps.notifications.models import NotificationType
    from apps.notifications.services import enqueue

    if material.quantity_in_stock > material.minimum_threshold:
        return False

    User = get_user_model()
    recipients = list(User.objects.filter(role="bosh_shifokor", is_active=True))
    if not recipients:
        logger.info(
            "inventory: no bosh_shifokor recipients for low-stock alert on %s",
            material.name,
        )
        return False

    message = (
        f"Material '{material.name}' zaxirasi kam qoldi: "
        f"{material.quantity_in_stock} {material.unit} "
        f"(minimum: {material.minimum_threshold})."
    )
    context = {
        "material_id": str(material.pk),
        "material_name": material.name,
        "quantity_in_stock": str(material.quantity_in_stock),
        "minimum_threshold": str(material.minimum_threshold),
    }
    for user in recipients:
        enqueue(
            notification_type=NotificationType.LOW_STOCK,
            message=message,
            user=user,
            context=context,
        )
    return True


@shared_task(name="apps.inventory.tasks.check_low_stock")
def check_low_stock(material_id: str) -> str:
    """Enqueue a low-stock alert for the given Material pk."""
    from apps.inventory.models import Material

    try:
        material = Material.objects.get(pk=material_id, is_active=True)
    except Material.DoesNotExist:
        logger.warning("inventory: material %s missing/inactive", material_id)
        return "missing"

    return "notified" if _notify_low(material) else "ok"


@shared_task(name="apps.inventory.tasks.sweep_low_stock")
def sweep_low_stock() -> int:
    """Sweep every active material and re-notify below-threshold ones."""
    from apps.inventory.models import Material

    count = 0
    qs = Material.objects.filter(is_active=True)
    for material in qs:
        if material.quantity_in_stock <= material.minimum_threshold:
            if _notify_low(material):
                count += 1
    if count:
        logger.info("inventory: sweep notified %s low-stock materials", count)
    return count


__all__ = ["check_low_stock", "sweep_low_stock"]
