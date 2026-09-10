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


def all_stock_logs_qs(
    *,
    reason: str | None = None,
    material_id: Any = None,
    search: str | None = None,
) -> QuerySet[MaterialStockLog]:
    """Return global audit log for materials, ordered newest first."""
    from django.db.models import Q

    qs = MaterialStockLog.objects.select_related(
        "material",
        "related_treatment",
        "related_treatment__patient",
        "related_usage",
        "performed_by",
    ).order_by("-created_at")

    if reason:
        qs = qs.filter(reason=reason)
    if material_id:
        qs = qs.filter(material_id=material_id)
    if search:
        search_stripped = search.strip()
        qs = qs.filter(
            Q(material__name__icontains=search_stripped)
            | Q(note__icontains=search_stripped)
            | Q(related_treatment__patient__first_name__icontains=search_stripped)
            | Q(related_treatment__patient__last_name__icontains=search_stripped)
        )
    return qs


def inventory_stats() -> dict[str, Any]:
    """Calculate summary metrics for inventory dashboard."""
    from django.db.models import DecimalField, Sum
    from django.db.models.functions import Coalesce

    active_qs = Material.objects.filter(is_active=True)
    total_materials = active_qs.count()
    low_stock_count = active_qs.filter(quantity_in_stock__lte=F("minimum_threshold")).count()

    total_value_agg = active_qs.filter(unit_cost__isnull=False).aggregate(
        val=Coalesce(
            Sum(F("quantity_in_stock") * F("unit_cost"), output_field=DecimalField()),
            Decimal("0.00"),
        )
    )
    total_stock_value = total_value_agg["val"] or Decimal("0.00")

    recent_restocks_count = MaterialStockLog.objects.filter(reason="restock").count()
    recent_usages_count = MaterialStockLog.objects.filter(reason="usage").count()

    return {
        "total_materials": total_materials,
        "low_stock_count": low_stock_count,
        "total_stock_value": str(total_stock_value.quantize(Decimal("0.01"))),
        "recent_restocks_count": recent_restocks_count,
        "recent_usages_count": recent_usages_count,
    }


__all__ = [
    "active_materials",
    "all_materials",
    "below_threshold",
    "material_by_id",
    "material_logs",
    "usages_for_treatment",
    "total_used_of",
    "all_stock_logs_qs",
    "inventory_stats",
]
