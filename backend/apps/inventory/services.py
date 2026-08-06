"""Write-side business logic for the ``inventory`` app.

Every mutation goes through a service function so that:

* transactions are opened at the boundary,
* :class:`~apps.inventory.models.MaterialStockLog` audit rows are
  created consistently,
* low-stock notifications are dispatched at one well-known point.

Signals in :mod:`apps.inventory.signals` reduce stock synchronously
when a :class:`~apps.inventory.models.MaterialUsage` is inserted. The
signal handler calls :func:`_after_stock_change` (the private helper
below) so the log / low-stock path is shared with restocks and
adjustments.
"""
from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import F

from .models import (
    Material,
    MaterialStockLog,
    MaterialUsage,
    StockChangeReason,
)

logger = logging.getLogger(__name__)
User = get_user_model()

# Cast helpers ---------------------------------------------------------------


def _to_decimal(value: Any, *, field: str) -> Decimal:
    """Coerce ``value`` to :class:`Decimal`, raising a friendly error."""
    if value is None:
        raise ValidationError({field: [f"{field} majburiy."]})
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except Exception as exc:  # noqa: BLE001
        raise ValidationError({field: [f"{field} noto'g'ri son."]}) from exc


# ---------------------------------------------------------------------------
# Low-stock notification hook (delegates to the notifications app)
# ---------------------------------------------------------------------------
def _maybe_notify_low_stock(material: Material) -> None:
    """Best-effort low-stock notification.

    When ``material.quantity_in_stock`` drops to or below
    ``minimum_threshold`` we enqueue one :class:`NotificationLog` row
    per active ``bosh_shifokor`` user via
    :func:`apps.notifications.services.enqueue`. Kept in a try/except
    so a notifications-layer failure never blocks stock movements.
    """
    if not material.is_active:
        return
    if material.quantity_in_stock > material.minimum_threshold:
        return

    try:
        from apps.notifications import services as notifications_services
        from apps.notifications.models import NotificationType
    except Exception:  # noqa: BLE001 — notifications app not installed
        logger.info(
            "inventory: material %s below threshold "
            "(stock=%s, min=%s) — notifications app not installed, skipping.",
            material.name,
            material.quantity_in_stock,
            material.minimum_threshold,
        )
        return

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

    # Fan-out to every active head doctor. We prefer the enum value from
    # the notifications app so the type stays canonical.
    try:
        recipients = list(
            User.objects.filter(role="bosh_shifokor", is_active=True)
        )
        if not recipients:
            # No head doctor yet (fresh install / migrations) — record
            # an untargeted log for the audit trail via patient=None hack
            # is invalid (constraint requires a target); log a warning.
            logger.warning(
                "inventory: no bosh_shifokor recipient — low-stock alert "
                "for '%s' not enqueued.",
                material.name,
            )
            return
        for user in recipients:
            notifications_services.enqueue(
                notification_type=NotificationType.LOW_STOCK,
                message=message,
                user=user,
                context=context,
            )
    except Exception:  # noqa: BLE001 — never block the caller
        logger.exception(
            "inventory: failed to enqueue low-stock notification for %s",
            material.name,
        )


# ---------------------------------------------------------------------------
# Material CRUD
# ---------------------------------------------------------------------------
def _clean_name(name: str) -> str:
    if name is None:
        raise ValidationError({"name": ["Material nomi majburiy."]})
    cleaned = " ".join(str(name).split())
    if not cleaned:
        raise ValidationError({"name": ["Material nomi majburiy."]})
    return cleaned


@transaction.atomic
def create_material(
    *,
    name: str,
    unit: str,
    quantity_in_stock: Any = Decimal("0.000"),
    minimum_threshold: Any = Decimal("0.000"),
    unit_cost: Any = None,
    notes: str = "",
) -> Material:
    """Create a new active material."""
    cleaned_name = _clean_name(name)
    if Material.objects.filter(name__iexact=cleaned_name, is_active=True).exists():
        raise ValidationError(
            {"name": [f"'{cleaned_name}' nomli material allaqachon mavjud."]}
        )
    qty = _to_decimal(quantity_in_stock, field="quantity_in_stock")
    threshold = _to_decimal(minimum_threshold, field="minimum_threshold")
    cost = _to_decimal(unit_cost, field="unit_cost") if unit_cost not in (None, "") else None
    if qty < 0 or threshold < 0 or (cost is not None and cost < 0):
        raise ValidationError({"non_field_errors": ["Salbiy qiymatlar ruxsat etilmaydi."]})

    material = Material.objects.create(
        name=cleaned_name,
        unit=unit,
        quantity_in_stock=qty,
        minimum_threshold=threshold,
        unit_cost=cost,
        notes=(notes or "").strip(),
        is_active=True,
    )
    if qty > 0:
        MaterialStockLog.objects.create(
            material=material,
            change_amount=qty,
            reason=StockChangeReason.ADJUSTMENT,
            resulting_quantity=qty,
            note="Boshlang'ich zaxira",
        )
    return material


@transaction.atomic
def update_material(
    material: Material,
    *,
    name: str | None = None,
    unit: str | None = None,
    minimum_threshold: Any = None,
    unit_cost: Any = None,
    notes: str | None = None,
    is_active: bool | None = None,
) -> Material:
    """Update a material. Quantity is intentionally NOT accepted here —
    stock changes must go through :func:`restock` or :func:`adjust_stock`
    so the audit trail stays consistent."""
    update_fields: list[str] = []

    if name is not None:
        cleaned = _clean_name(name)
        clash = Material.objects.filter(
            name__iexact=cleaned, is_active=True
        ).exclude(pk=material.pk)
        if clash.exists():
            raise ValidationError(
                {"name": [f"'{cleaned}' nomli material allaqachon mavjud."]}
            )
        material.name = cleaned
        update_fields.append("name")

    if unit is not None:
        material.unit = unit
        update_fields.append("unit")

    if minimum_threshold is not None:
        threshold = _to_decimal(minimum_threshold, field="minimum_threshold")
        if threshold < 0:
            raise ValidationError({"minimum_threshold": ["Salbiy qiymat ruxsat etilmaydi."]})
        material.minimum_threshold = threshold
        update_fields.append("minimum_threshold")

    if unit_cost is not None:
        cost = None if unit_cost == "" else _to_decimal(unit_cost, field="unit_cost")
        if cost is not None and cost < 0:
            raise ValidationError({"unit_cost": ["Salbiy qiymat ruxsat etilmaydi."]})
        material.unit_cost = cost
        update_fields.append("unit_cost")

    if notes is not None:
        material.notes = (notes or "").strip()
        update_fields.append("notes")

    if is_active is not None:
        material.is_active = bool(is_active)
        update_fields.append("is_active")

    if update_fields:
        material.save(update_fields=update_fields + ["updated_at"])
    return material


@transaction.atomic
def soft_delete_material(material: Material) -> Material:
    """Soft-delete (``is_active = False``)."""
    if material.is_active:
        material.is_active = False
        material.save(update_fields=["is_active", "updated_at"])
    return material


# ---------------------------------------------------------------------------
# Stock movements
# ---------------------------------------------------------------------------
@transaction.atomic
def restock(
    material: Material,
    *,
    amount: Any,
    performed_by: Any = None,
    note: str = "",
) -> MaterialStockLog:
    """Increase ``material.quantity_in_stock`` by ``amount``."""
    delta = _to_decimal(amount, field="amount")
    if delta <= 0:
        raise ValidationError({"amount": ["Miqdor musbat bo'lishi kerak."]})

    # Atomic update via F() to avoid lost updates under concurrency.
    Material.objects.filter(pk=material.pk).update(
        quantity_in_stock=F("quantity_in_stock") + delta,
    )
    material.refresh_from_db(fields=["quantity_in_stock"])

    log = MaterialStockLog.objects.create(
        material=material,
        change_amount=delta,
        reason=StockChangeReason.RESTOCK,
        resulting_quantity=material.quantity_in_stock,
        performed_by=performed_by if isinstance(performed_by, User) else None,
        note=(note or "").strip(),
    )
    return log


@transaction.atomic
def adjust_stock(
    material: Material,
    *,
    delta: Any,
    performed_by: Any = None,
    note: str = "",
) -> MaterialStockLog:
    """Apply a signed manual adjustment (correction) to stock."""
    change = _to_decimal(delta, field="delta")
    if change == 0:
        raise ValidationError({"delta": ["O'zgarish nolga teng bo'lolmaydi."]})

    new_qty = material.quantity_in_stock + change
    if new_qty < 0:
        raise ValidationError(
            {"delta": ["Ushbu tuzatishdan keyin zaxira manfiy bo'lib qoladi."]}
        )

    Material.objects.filter(pk=material.pk).update(
        quantity_in_stock=F("quantity_in_stock") + change,
    )
    material.refresh_from_db(fields=["quantity_in_stock"])

    log = MaterialStockLog.objects.create(
        material=material,
        change_amount=change,
        reason=StockChangeReason.ADJUSTMENT,
        resulting_quantity=material.quantity_in_stock,
        performed_by=performed_by if isinstance(performed_by, User) else None,
        note=(note or "").strip(),
    )
    _maybe_notify_low_stock(material)
    return log


@transaction.atomic
def record_usage(
    *,
    treatment: Any,
    material: Material,
    quantity_used: Any,
    recorded_by: Any = None,
) -> MaterialUsage:
    """Record a :class:`MaterialUsage` and let the post_save signal
    decrement stock. Kept as a service so callers don't call the model
    manager directly (encapsulation)."""
    qty = _to_decimal(quantity_used, field="quantity_used")
    if qty <= 0:
        raise ValidationError({"quantity_used": ["Miqdor musbat bo'lishi kerak."]})
    if not material.is_active:
        raise ValidationError({"material": ["Bu material faol emas."]})
    if qty > material.quantity_in_stock:
        raise ValidationError(
            {
                "quantity_used": [
                    f"Zaxirada faqat {material.quantity_in_stock} {material.unit} bor."
                ]
            }
        )

    usage = MaterialUsage.objects.create(
        treatment=treatment,
        material=material,
        quantity_used=qty,
        recorded_by=recorded_by if isinstance(recorded_by, User) else None,
    )
    return usage


# ---------------------------------------------------------------------------
# Signal-side helpers (called from apps.inventory.signals)
# ---------------------------------------------------------------------------
@transaction.atomic
def apply_usage_to_stock(usage: MaterialUsage) -> None:
    """Decrement stock for ``usage`` and write the audit log.

    Called by the ``post_save`` handler in :mod:`apps.inventory.signals`
    exactly once per newly-created usage. Kept idempotent by refusing to
    log twice for the same usage (guarded by ``related_usage``).
    """
    if MaterialStockLog.objects.filter(
        related_usage_id=usage.pk,
        reason=StockChangeReason.USAGE,
    ).exists():
        return  # Already applied — signal fired twice for some reason.

    Material.objects.filter(pk=usage.material_id).update(
        quantity_in_stock=F("quantity_in_stock") - usage.quantity_used,
    )
    material = Material.objects.get(pk=usage.material_id)

    MaterialStockLog.objects.create(
        material=material,
        change_amount=-usage.quantity_used,
        reason=StockChangeReason.USAGE,
        resulting_quantity=material.quantity_in_stock,
        related_treatment_id=usage.treatment_id,
        related_usage=usage,
        performed_by=usage.recorded_by,
        note="Davolash paytida sarflandi.",
    )
    _maybe_notify_low_stock(material)


__all__ = [
    "create_material",
    "update_material",
    "soft_delete_material",
    "restock",
    "adjust_stock",
    "record_usage",
    "apply_usage_to_stock",
]
