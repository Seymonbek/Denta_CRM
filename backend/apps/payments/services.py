"""Write-side business logic for the ``payments`` app.

The two public entry points:

* :func:`record_payment` — validates + saves a :class:`Payment`, refreshes
  the treatment's ``payment_status``, and (when fully paid)
  recalculates the commission via :func:`recalculate_commission`.
* :func:`recalculate_commission` — pure calculation over a treatment;
  writes/updates the single :class:`CommissionRecord` row for that
  ``(doctor, treatment)`` pair.

Commission formula — PROJECT_BRIEF § "payments app":

    rate  = procedure_type.commission_rate_override
              or doctor.default_commission_rate
    base  = price                   (basis = "from_total")
          | price - material_cost   (basis = "from_net")
    amount = base * rate / 100      (never < 0 — clamped at zero)
"""
from __future__ import annotations

import logging
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from django.core.exceptions import ValidationError
from django.db import transaction

from apps.doctors.models import CommissionBasis
from apps.treatments.models import PaymentStatus, Treatment

from .models import (
    CommissionBasisSnapshot,
    CommissionRecord,
    Payment,
    PaymentMethod,
)
from .selectors import total_paid_for_treatment

logger = logging.getLogger(__name__)

_MONEY_QUANT = Decimal("0.01")
_ZERO = Decimal("0.00")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _to_decimal(value: Any, *, field: str) -> Decimal:
    if value is None:
        raise ValidationError({field: [f"{field} majburiy."]})
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except Exception as exc:  # noqa: BLE001
        raise ValidationError({field: [f"{field} noto'g'ri son."]}) from exc


def _quantise(value: Decimal) -> Decimal:
    return value.quantize(_MONEY_QUANT, rounding=ROUND_HALF_UP)


def _material_cost_for(treatment: Treatment) -> Decimal:
    """Total material cost consumed by ``treatment``.

    Uses ``material.unit_cost`` when set; falls back to zero for rows
    without a cost. The Inventory app already stores unit costs on
    :class:`~apps.inventory.models.Material`.
    """
    # Local import so the payments app doesn't hard-require inventory
    # tables at migration time (they're in the same INSTALLED_APPS but
    # this keeps the dependency direction clean).
    from apps.inventory.models import MaterialUsage

    total = _ZERO
    usages = MaterialUsage.objects.filter(
        treatment_id=treatment.pk,
    ).select_related("material")
    for usage in usages:
        unit_cost = usage.material.unit_cost
        if unit_cost is None:
            continue
        total += Decimal(unit_cost) * Decimal(usage.quantity_used)
    return _quantise(total)


def _resolve_rate_and_basis(treatment: Treatment) -> tuple[Decimal, str]:
    """Pick the effective commission rate and basis for a treatment.

    * rate  = ``procedure_type.commission_rate_override`` if set,
              else ``doctor.default_commission_rate``.
    * basis = ``doctor.commission_basis`` (procedure type does NOT
              override the basis — only the rate).
    """
    doctor = treatment.doctor
    proc = treatment.procedure_type
    rate = None
    if proc is not None and proc.commission_rate_override is not None:
        rate = Decimal(proc.commission_rate_override)
    else:
        rate = Decimal(doctor.default_commission_rate)
    if rate < 0:
        rate = _ZERO
    if rate > 100:
        rate = Decimal("100")
    return rate, str(doctor.commission_basis)


# ---------------------------------------------------------------------------
# Commission calculation
# ---------------------------------------------------------------------------
def calculate_commission_for(treatment: Treatment) -> dict[str, Decimal | str]:
    """Return the numbers used for a commission WITHOUT writing anything.

    Handy for previewing the doctor's cut on the treatment form before
    the treatment is finalised.
    """
    rate, basis = _resolve_rate_and_basis(treatment)
    price = Decimal(treatment.price or _ZERO)
    material_cost = _ZERO
    if basis == CommissionBasis.FROM_NET:
        material_cost = _material_cost_for(treatment)
        base = price - material_cost
    else:
        base = price
    if base < 0:
        base = _ZERO
    amount = _quantise(base * rate / Decimal("100"))
    return {
        "rate": rate,
        "basis": basis,
        "price": _quantise(price),
        "materialCost": _quantise(material_cost),
        "baseAmount": _quantise(base),
        "amount": amount,
    }


@transaction.atomic
def recalculate_commission(treatment: Treatment) -> CommissionRecord:
    """Create or refresh the :class:`CommissionRecord` for ``treatment``.

    Called after :func:`record_payment` marks the treatment as ``paid``
    and can also be called directly (admin action, backfill, tests).
    """
    numbers = calculate_commission_for(treatment)
    basis_value = numbers["basis"]
    # Map into the snapshot enum — same string values, kept separate so
    # the payments module doesn't depend on the doctors enum at DB level.
    if basis_value not in {c.value for c in CommissionBasisSnapshot}:
        raise ValidationError({"basis": [f"Noma'lum komissiya asosi: {basis_value!r}."]})

    obj, _ = CommissionRecord.objects.update_or_create(
        doctor=treatment.doctor,
        treatment=treatment,
        defaults={
            "amount": numbers["amount"],
            "rate": numbers["rate"],
            "basis": basis_value,
            "base_amount": numbers["baseAmount"],
            "material_cost": numbers["materialCost"],
        },
    )
    return obj


# ---------------------------------------------------------------------------
# Payment writes
# ---------------------------------------------------------------------------
@transaction.atomic
def record_payment(
    *,
    treatment: Treatment,
    amount: Any,
    method: str = PaymentMethod.CASH,
    received_by: Any = None,
    note: str = "",
) -> Payment:
    """Record one payment and update the treatment's ``payment_status``.

    Raises :class:`ValidationError` when:
      * amount is not positive,
      * amount would over-pay the treatment (more than 0.01 over),
      * method is not in :class:`PaymentMethod`.
    """
    money = _to_decimal(amount, field="amount")
    if money <= _ZERO:
        raise ValidationError({"amount": ["Miqdor musbat bo'lishi kerak."]})

    if method not in {m.value for m in PaymentMethod}:
        raise ValidationError({"method": [f"Noto'g'ri to'lov turi: {method!r}."]})

    already_paid = total_paid_for_treatment(treatment.pk)
    price = Decimal(treatment.price or _ZERO)
    projected = already_paid + money
    # Allow a 1-tiyin cushion for rounding drift.
    if projected > price + Decimal("0.01"):
        raise ValidationError(
            {
                "amount": [
                    (
                        "Kiritilgan miqdor umumiy narxdan oshib ketadi. "
                        f"Qolgan qarz: {(price - already_paid):.2f}."
                    )
                ]
            }
        )

    payment = Payment.objects.create(
        treatment=treatment,
        patient=treatment.patient,
        amount=_quantise(money),
        method=method,
        received_by=received_by if getattr(received_by, "pk", None) else None,
        note=(note or "").strip(),
    )

    # Refresh treatment state — signal also does this but keeping the
    # call here means the return value already reflects the new status.
    _refresh_payment_status(treatment)
    return payment


@transaction.atomic
def void_payment(payment: Payment) -> Payment:
    """Soft-void a payment (``is_active=False``) and refresh state."""
    if payment.is_active:
        payment.is_active = False
        payment.save(update_fields=["is_active", "updated_at"])
    _refresh_payment_status(payment.treatment)
    return payment


def _refresh_payment_status(treatment: Treatment) -> Treatment:
    """Recompute ``treatment.payment_status`` from active payments.

    Also refreshes the commission when the treatment is fully paid.
    """
    total = total_paid_for_treatment(treatment.pk)
    price = Decimal(treatment.price or _ZERO)

    if total <= _ZERO:
        new_status = PaymentStatus.UNPAID
    elif total + Decimal("0.01") < price:
        new_status = PaymentStatus.PARTIAL
    else:
        new_status = PaymentStatus.PAID

    if treatment.payment_status != new_status:
        treatment.payment_status = new_status
        treatment.save(update_fields=["payment_status", "updated_at"])

    if new_status == PaymentStatus.PAID:
        try:
            recalculate_commission(treatment)
        except ValidationError:
            logger.exception(
                "payments: commission recalculation failed for treatment %s",
                treatment.pk,
            )
    return treatment


__all__ = [
    "calculate_commission_for",
    "recalculate_commission",
    "record_payment",
    "void_payment",
]
