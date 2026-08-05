"""View-layer permission for the ``odontogram`` app.

Rules mirror the treatments app (PROJECT_BRIEF § "RBAC"):

* Read: anyone with access to the parent :class:`Treatment` may read
  its tooth records.
* Write: ``bosh_shifokor`` always; ``doctor`` only on their own
  treatments; ``administrator`` never.
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


class ToothRecordPermission(BasePermission):
    """Combined view + object permission for tooth records."""

    message = (
        "Faqat bosh shifokor yoki tegishli shifokor tish yozuvini yaratishi/"
        "tahrirlashi mumkin."
    )

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

    def has_object_permission(self, request: Request, view: Any, obj: Any) -> bool:
        user = request.user
        role = getattr(user, "role", None)

        if role == ROLE_BOSH_SHIFOKOR:
            return True

        # obj may be a ToothRecord or a Treatment (for parent-scoped checks).
        treatment = getattr(obj, "treatment", None) or obj
        doctor = getattr(treatment, "doctor", None)

        if role == ROLE_DOCTOR:
            if doctor is None:
                return False
            if getattr(doctor, "user_id", None) == user.id:
                return True
            if request.method in SAFE_METHODS:
                profile = getattr(user, "doctor_profile", None)
                return bool(getattr(profile, "can_view_other_doctors", False))
            return False

        if role == ROLE_ADMINISTRATOR:
            return request.method in SAFE_METHODS

        return False


__all__ = ["ToothRecordPermission", "SAFE_METHODS"]
