"""View-layer permission classes for the ``treatments`` app.

Rules (PROJECT_BRIEF § "RBAC" — treatments row):

* Read:
    - ``bosh_shifokor`` — always allowed.
    - ``doctor`` — allowed if ``treatment.doctor.user_id == user.id`` OR
      ``doctor_profile.can_view_other_doctors == True``.
    - ``administrator`` — allowed for safe methods only (they see the
      list to attach payments).
* Write (POST / PATCH / DELETE / photo upload):
    - ``bosh_shifokor`` — always allowed.
    - ``doctor`` — allowed only on treatments they own.
    - ``administrator`` — never.
"""
from __future__ import annotations

from typing import Any

from rest_framework.permissions import BasePermission
from rest_framework.request import Request

from apps.core.permissions import (
    ALL_ROLES,
    ROLE_ADMINISTRATOR,
    ROLE_BOSH_SHIFOKOR,
    ROLE_DOCTOR,
)

SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


class TreatmentPermission(BasePermission):
    """Combined view + object permission for the ``TreatmentViewSet``."""

    message = (
        "Faqat bosh shifokor yoki tegishli shifokor davolash yozuvini "
        "yaratishi, tahrirlashi va o'chirishi mumkin."
    )

    # ---- view level --------------------------------------------------------
    def has_permission(self, request: Request, view: Any) -> bool:  # noqa: D401
        user = getattr(request, "user", None)
        if user is None or not getattr(user, "is_authenticated", False):
            return False
        role = getattr(user, "role", None)
        if role not in ALL_ROLES:
            return False
        if request.method in SAFE_METHODS:
            return True
        # Writes: administrator excluded.
        return role in {ROLE_BOSH_SHIFOKOR, ROLE_DOCTOR}

    # ---- object level ------------------------------------------------------
    def has_object_permission(self, request: Request, view: Any, obj: Any) -> bool:
        user = request.user
        role = getattr(user, "role", None)

        if role == ROLE_BOSH_SHIFOKOR:
            return True

        # Resolve owner-doctor even when ``obj`` is a TreatmentPhoto.
        doctor = self._resolve_owner_doctor(obj)

        if role == ROLE_DOCTOR:
            if doctor is None:
                return False
            if doctor.user_id == user.id:
                return True
            if request.method in SAFE_METHODS:
                profile = getattr(user, "doctor_profile", None)
                return bool(getattr(profile, "can_view_other_doctors", False))
            return False

        if role == ROLE_ADMINISTRATOR:
            return request.method in SAFE_METHODS

        return False

    @staticmethod
    def _resolve_owner_doctor(obj: Any) -> Any:
        """Return the DoctorProfile owning ``obj`` (Treatment or TreatmentPhoto)."""
        if obj is None:
            return None
        # Treatment
        doctor = getattr(obj, "doctor", None)
        if doctor is not None:
            return doctor
        # TreatmentPhoto → treatment.doctor
        treatment = getattr(obj, "treatment", None)
        if treatment is not None:
            return getattr(treatment, "doctor", None)
        return None


__all__ = ["TreatmentPermission", "SAFE_METHODS"]
