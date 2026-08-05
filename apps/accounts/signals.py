"""Signal handlers for the ``accounts`` app."""
from __future__ import annotations

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.doctors.models import DoctorProfile
from .models import User

logger = logging.getLogger(__name__)


@receiver(post_save, sender=User, dispatch_uid="accounts.user.create_doctor_profile")
def _on_user_saved(sender, instance: User, created: bool, **kwargs):
    """Automatically create or sync DoctorProfile for users with doctor/bosh_shifokor roles."""
    if instance.role in (User.Role.DOCTOR, User.Role.BOSH_SHIFOKOR):
        try:
            profile, profile_created = DoctorProfile.objects.get_or_create(user=instance)
            if profile.is_active != instance.is_active:
                profile.is_active = instance.is_active
                profile.save(update_fields=["is_active", "updated_at"])
        except Exception:  # noqa: BLE001
            logger.exception(
                "accounts: failed to sync DoctorProfile for user %s",
                instance.pk,
            )


__all__ = ["_on_user_saved"]
