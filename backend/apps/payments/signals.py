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
    # Only refresh treatment status when a treatment is linked
    if instance.treatment_id:
        try:
            _refresh_payment_status(instance.treatment)
        except Exception:  # noqa: BLE001
            logger.exception(
                "payments: refresh after payment save failed for treatment %s",
                instance.treatment_id,
            )

    if created and not instance.is_void and instance.treatment_id:
        try:
            from apps.notifications.models import NotificationType
            from apps.notifications.services import enqueue, notify_roles

            treatment = instance.treatment
            if not treatment:
                return

            patient = treatment.patient
            if not patient:
                return

            patient_name = f"{patient.first_name} {patient.last_name}"
            amount_str = f"{instance.amount:,.0f}"

            # 1. Patient Notification
            msg_p = f"Hurmatli {patient_name}, davolash muolajasi uchun {amount_str} so'm miqdoridagi to'lovingiz qabul qilindi. Rahmat!"
            enqueue(
                notification_type=NotificationType.PAYMENT_RECEIVED,
                message=msg_p,
                patient=patient,
                context={
                    "payment_id": str(instance.pk),
                    "treatment_id": str(instance.treatment_id),
                    "amount": str(instance.amount),
                },
            )

            # 2. Doctor Notification
            doc_user = treatment.doctor.user if treatment.doctor else None
            if doc_user:
                msg_d = f"💰 Bemoringiz {patient_name} {amount_str} so'm to'lov qildi."
                enqueue(
                    notification_type=NotificationType.PAYMENT_RECEIVED,
                    message=msg_d,
                    user=doc_user,
                    context={
                        "payment_id": str(instance.pk),
                        "treatment_id": str(instance.treatment_id),
                    },
                )

            # 3. Bosh Shifokor Multicast Notification
            msg_bs = f"💰 Yangi to'lov qabul qilindi: {amount_str} so'm (Bemor: {patient_name})"
            notify_roles(
                ["bosh_shifokor"],
                notification_type=NotificationType.PAYMENT_RECEIVED,
                message=msg_bs,
                context={
                    "payment_id": str(instance.pk),
                    "treatment_id": str(instance.treatment_id),
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
