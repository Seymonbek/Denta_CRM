"""Signal handlers for the ``ratings`` app.

Wires the following model post-save events to
:func:`apps.ratings.services.award_points`:

* :class:`Patient` created         → ``NEW_PATIENT`` for the creator's
  doctor profile (if the creator has one).
* :class:`Treatment.stage` flips
  to ``COMPLETED``                 → ``TREATMENT_COMPLETED`` for the
  treating doctor.
* :class:`TreatmentPhoto` created  → ``PHOTO_UPLOADED`` for the
  treatment's doctor.
"""
from __future__ import annotations

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.patients.models import Patient
from apps.treatments.models import Treatment, TreatmentPhoto, TreatmentStage

from .models import ScoreReason
from .services import award_points, award_points_by_user

logger = logging.getLogger(__name__)

_TREATMENT_STAGE_CACHE_ATTR = "_ratings_prev_stage"


@receiver(post_save, sender=Patient, dispatch_uid="ratings.patient_created")
def _on_patient_created(sender, instance: Patient, created: bool, **kwargs):
    """Award NEW_PATIENT points to the creator's doctor profile."""
    if not created:
        return
    creator = getattr(instance, "created_by", None)
    if creator is None:
        return
    try:
        award_points_by_user(
            user=creator,
            reason=ScoreReason.NEW_PATIENT,
            related_patient=instance,
        )
    except Exception:  # noqa: BLE001 — never break the transaction
        logger.exception(
            "ratings: failed to award NEW_PATIENT for patient=%s", instance.pk,
        )


@receiver(post_save, sender=Treatment, dispatch_uid="ratings.treatment_completed")
def _on_treatment_saved(sender, instance: Treatment, created: bool, **kwargs):
    """Award TREATMENT_COMPLETED the first time ``stage`` reaches COMPLETED."""
    if instance.stage != TreatmentStage.COMPLETED:
        return
    # Avoid duplicate awards: only fire once per treatment.
    from .models import ScoreLog

    already = ScoreLog.objects.filter(
        related_treatment=instance,
        reason=ScoreReason.TREATMENT_COMPLETED,
        is_active=True,
    ).exists()
    if already:
        return
    doctor = getattr(instance, "doctor", None)
    if doctor is None:
        return
    try:
        award_points(
            doctor=doctor,
            reason=ScoreReason.TREATMENT_COMPLETED,
            related_patient=getattr(instance, "patient", None),
            related_treatment=instance,
        )
    except Exception:  # noqa: BLE001
        logger.exception(
            "ratings: failed to award TREATMENT_COMPLETED for treatment=%s",
            instance.pk,
        )

    # Award NEW_PATIENT points if this is the patient's first completed treatment
    patient = getattr(instance, "patient", None)
    if patient:
        first_completed = not Treatment.objects.filter(
            patient=patient,
            stage=TreatmentStage.COMPLETED,
        ).exclude(pk=instance.pk).exists()

        if first_completed:
            already_new_patient = ScoreLog.objects.filter(
                related_patient=patient,
                reason=ScoreReason.NEW_PATIENT,
                is_active=True,
            ).exists()
            if not already_new_patient:
                try:
                    award_points(
                        doctor=doctor,
                        reason=ScoreReason.NEW_PATIENT,
                        related_patient=patient,
                        related_treatment=instance,
                    )
                except Exception:  # noqa: BLE001
                    logger.exception(
                        "ratings: failed to award NEW_PATIENT for treatment=%s",
                        instance.pk,
                    )


@receiver(post_save, sender=TreatmentPhoto, dispatch_uid="ratings.photo_uploaded")
def _on_photo_uploaded(sender, instance: TreatmentPhoto, created: bool, **kwargs):
    """Award PHOTO_UPLOADED to the treating doctor."""
    if not created:
        return
    treatment = getattr(instance, "treatment", None)
    if treatment is None:
        return
    doctor = getattr(treatment, "doctor", None)
    if doctor is None:
        return
    try:
        award_points(
            doctor=doctor,
            reason=ScoreReason.PHOTO_UPLOADED,
            related_patient=getattr(treatment, "patient", None),
            related_treatment=treatment,
        )
    except Exception:  # noqa: BLE001
        logger.exception(
            "ratings: failed to award PHOTO_UPLOADED for photo=%s", instance.pk,
        )


__all__ = [
    "_on_patient_created",
    "_on_treatment_saved",
    "_on_photo_uploaded",
]
