"""Permission classes for the ``prescriptions`` app.

Rules (PROJECT_BRIEF § "RBAC"):

* Templates (list/read/write):
    - ``bosh_shifokor`` — full CRUD.
    - ``doctor`` — full CRUD, own templates only for delete/update.
    - ``administrator`` — read-only.
* Prescriptions (issued retseptlar):
    - ``bosh_shifokor`` — full access.
    - ``doctor`` — own treatments only (unless can_view_other_doctors).
    - ``administrator`` — read-only.
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


class PrescriptionTemplatePermission(BasePermission):
    """Permission for the ``PrescriptionTemplateViewSet``."""

    message = (
        "Faqat bosh shifokor va shifokor retsept shablonlarini "
        "yaratishi/tahrirlashi mumkin."
    )

    def has_permission(self, request: Request, view: Any) -> bool:
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

    def has_object_permission(self, request: Request, view: Any, obj: Any) -> bool:
        user = request.user
        role = getattr(user, "role", None)

        if role == ROLE_BOSH_SHIFOKOR:
            return True

        if request.method in SAFE_METHODS:
            return role in ALL_ROLES

        # Writes: doctor may modify only own templates.
        if role == ROLE_DOCTOR:
            return getattr(obj, "created_by_id", None) == getattr(user, "id", None)

        return False


class PrescriptionPermission(BasePermission):
    """Permission for the ``PrescriptionViewSet`` and the create-on-treatment action."""

    message = (
        "Faqat bosh shifokor yoki tegishli shifokor retsept berishi mumkin."
    )

    def has_permission(self, request: Request, view: Any) -> bool:
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

    def has_object_permission(self, request: Request, view: Any, obj: Any) -> bool:
        user = request.user
        role = getattr(user, "role", None)

        if role == ROLE_BOSH_SHIFOKOR:
            return True

        doctor = self._resolve_owner_doctor(obj)

        if role == ROLE_DOCTOR:
            if doctor is None:
                return False
            if getattr(doctor, "user_id", None) == getattr(user, "id", None):
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
        """Return the DoctorProfile owning ``obj`` (Prescription or Treatment)."""
        if obj is None:
            return None
        # Direct Treatment
        doctor = getattr(obj, "doctor", None)
        if doctor is not None and hasattr(doctor, "user_id"):
            return doctor
        # Prescription → treatment.doctor
        treatment = getattr(obj, "treatment", None)
        if treatment is not None:
            return getattr(treatment, "doctor", None)
        return None


__all__ = [
    "PrescriptionTemplatePermission",
    "PrescriptionPermission",
    "SAFE_METHODS",
]
