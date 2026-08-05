"""Signal handlers for the ``payments`` app.

Keeps :attr:`Treatment.payment_status` and the doctor's
:class:`CommissionRecord` in sync with active payments.

* ``post_save`` on :class:`Payment` → refresh payment status; if the
  treatment is fully paid, recompute the commission.
* ``post_delete`` on :class:`Payment` → refresh payment status
  (defensive — the app soft-voids instead of hard-deleting, but tests
  and admin actions may still remove rows).
"""
from __future__ import annotations

import logging

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from apps.treatments.models import Treatment
from .models import Payment
from .services import _refresh_payment_status

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Payment, dispatch_uid="payments.payment.refresh_on_save")
def _on_payment_saved(sender, instance: Payment, created: bool, **kwargs):
    try:
        _refresh_payment_status(instance.treatment)
    except Exception:  # noqa: BLE001
        logger.exception(
            "payments: refresh after payment save failed for treatment %s",
            instance.treatment_id,
        )

    if created and not instance.is_void:
        try:
            from apps.notifications.models import NotificationType
            from apps.notifications.services import enqueue

            patient = instance.treatment.patient
            msg = (
                f"Hurmatli {patient.first_name} {patient.last_name}, "
                f"davolash muolajasi uchun {instance.amount:,.0f} so'm miqdoridagi "
                f"to'lovingiz qabul qilindi. Rahmat!"
            )
            enqueue(
                notification_type=NotificationType.PAYMENT_RECEIVED,
                message=msg,
                patient=patient,
                context={
                    "payment_id": str(instance.pk),
                    "treatment_id": str(instance.treatment_id),
                    "amount": str(instance.amount),
                },
            )
        except Exception:  # noqa: BLE001
            logger.exception(
                "payments: failed to enqueue PAYMENT_RECEIVED notification for payment %s",
                instance.pk,
            )


@receiver(post_delete, sender=Payment, dispatch_uid="payments.payment.refresh_on_delete")
def _on_payment_deleted(sender, instance: Payment, **kwargs):
    treatment = getattr(instance, "treatment", None)
    if treatment is None:
        return
    try:
        _refresh_payment_status(treatment)
    except Exception:  # noqa: BLE001
        logger.exception(
            "payments: refresh after payment delete failed for treatment %s",
            instance.treatment_id,
        )


@receiver(post_save, sender=Treatment, dispatch_uid="payments.treatment.refresh_on_save")
def _on_treatment_saved(sender, instance: Treatment, created: bool, **kwargs):
    update_fields = kwargs.get("update_fields")
    if update_fields and "payment_status" in update_fields:
        return
    try:
        _refresh_payment_status(instance)
    except Exception:  # noqa: BLE001
        logger.exception(
            "payments: refresh after treatment save failed for treatment %s",
            instance.pk,
        )


__all__ = ["_on_payment_saved", "_on_payment_deleted", "_on_treatment_saved"]
