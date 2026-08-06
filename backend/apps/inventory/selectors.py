"""Read-side query helpers for the ``inventory`` app.

Selectors only build querysets — they never mutate. Views and services
call these instead of hand-rolling ``.filter(...)`` chains so that
filtering rules stay in one place.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db.models import F, QuerySet

from .models import Material, MaterialStockLog, MaterialUsage


# ---------------------------------------------------------------------------
# Material
# ---------------------------------------------------------------------------
def active_materials() -> QuerySet[Material]:
    """Every active material, ordered by name."""
    return Material.objects.filter(is_active=True).order_by("name")


def all_materials() -> QuerySet[Material]:
    """Every material, active and archived. Admin views only."""
    return Material.objects.all().order_by("name")


def below_threshold(*, only_active: bool = True) -> QuerySet[Material]:
    """Materials whose current stock has dropped to or below the threshold."""
    qs = Material.objects.filter(quantity_in_stock__lte=F("minimum_threshold"))
    if only_active:
        qs = qs.filter(is_active=True)
    return qs.order_by("name")


def material_by_id(material_id: Any) -> Material | None:
    """Return a single :class:`Material` by pk or ``None`` when missing."""
    return Material.objects.filter(pk=material_id).first()


# ---------------------------------------------------------------------------
# Logs & usages
# ---------------------------------------------------------------------------
def material_logs(material_id: Any) -> QuerySet[MaterialStockLog]:
    """Return the audit log for a single material, newest first."""
    return (
        MaterialStockLog.objects.filter(material_id=material_id)
        .select_related("material", "related_treatment", "related_usage", "performed_by")
        .order_by("-created_at")
    )


def usages_for_treatment(treatment_id: Any) -> QuerySet[MaterialUsage]:
    """Return material-usage rows for a single treatment."""
    return (
        MaterialUsage.objects.filter(treatment_id=treatment_id)
        .select_related("material", "recorded_by")
        .order_by("created_at")
    )


def total_used_of(material_id: Any) -> Decimal:
    """Total quantity consumed of a material across all treatments."""
    from django.db.models import Sum  # local import — cheap in Django >=4

    result = MaterialUsage.objects.filter(material_id=material_id).aggregate(
        total=Sum("quantity_used"),
    )
    return result["total"] or Decimal("0.000")


__all__ = [
    "active_materials",
    "all_materials",
    "below_threshold",
    "material_by_id",
    "material_logs",
    "usages_for_treatment",
    "total_used_of",
]
