"""View-layer permission classes for the ``patients`` app.

Rules (PROJECT_BRIEF § "RBAC"):

* Read: any authenticated user with a known role. Doctors need to look
  up their assigned patients; administrators run reception; the head
  doctor sees everything.
* Write (create / update / soft-delete): only ``bosh_shifokor`` and
  ``administrator``. Doctors themselves never touch the patient
  registry — they get patient data through the appointment/treatment
  views once T10+ arrive.
"""
from __future__ import annotations

from typing import Any

from rest_framework.permissions import BasePermission
from rest_framework.request import Request

from apps.core.permissions import (
    ALL_ROLES,
    ROLE_ADMINISTRATOR,
    ROLE_BOSH_SHIFOKOR,
)

SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})

# Roles allowed to mutate patient rows.
_WRITE_ROLES = frozenset({ROLE_BOSH_SHIFOKOR, ROLE_ADMINISTRATOR})


class PatientPermission(BasePermission):
    """Read: any authenticated role. Write: bosh_shifokor / administrator."""

    message = (
        "Faqat bosh shifokor yoki administrator bemor yozuvlarini "
        "yaratishi, tahrirlashi yoki o'chirishi mumkin."
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
        return role in _WRITE_ROLES

    def has_object_permission(self, request: Request, view: Any, obj: Any) -> bool:
        return self.has_permission(request, view)


__all__ = ["PatientPermission", "SAFE_METHODS"]
