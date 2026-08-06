"""View-layer permission classes for the ``inventory`` app.

Rules (PROJECT_BRIEF § "RBAC" — Inventory row):

* ``bosh_shifokor`` — full CRUD on materials, may restock, may view all
  logs.
* ``doctor`` — read-only on materials; may create :class:`MaterialUsage`
  rows nested inside a treatment. Doctors never call the material
  endpoints for writes.
* ``administrator`` — read-only on materials (they need the list to
  drop into forms).
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


class MaterialPermission(BasePermission):
    """Material CRUD gate — write is bosh_shifokor only."""

    message = "Faqat bosh shifokor materiallarni boshqarishga ruxsatga ega."

    def has_permission(self, request: Request, view: Any) -> bool:  # noqa: D401
        user = getattr(request, "user", None)
        if user is None or not getattr(user, "is_authenticated", False):
            return False
        role = getattr(user, "role", None)
        if role not in ALL_ROLES:
            return False
        if request.method in SAFE_METHODS:
            return True
        return role == ROLE_BOSH_SHIFOKOR

    def has_object_permission(self, request: Request, view: Any, obj: Any) -> bool:
        return self.has_permission(request, view)


class MaterialUsagePermission(BasePermission):
    """MaterialUsage — bosh_shifokor & doctor may create; admin never."""

    message = "Bu amalni bajarish uchun ruxsat yo'q."

    def has_permission(self, request: Request, view: Any) -> bool:  # noqa: D401
        user = getattr(request, "user", None)
        if user is None or not getattr(user, "is_authenticated", False):
            return False
        role = getattr(user, "role", None)
        if role not in ALL_ROLES:
            return False
        if request.method in SAFE_METHODS:
            return True
        return role in {ROLE_BOSH_SHIFOKOR, ROLE_DOCTOR}

    def has_object_permission(self, request: Request, view: Any, obj: Any) -> bool:
        user = request.user
        role = getattr(user, "role", None)

        if role == ROLE_BOSH_SHIFOKOR:
            return True

        if role == ROLE_ADMINISTRATOR:
            return request.method in SAFE_METHODS

        if role == ROLE_DOCTOR:
            treatment = getattr(obj, "treatment", None)
            doctor = getattr(treatment, "doctor", None)
            if doctor is None:
                return request.method in SAFE_METHODS
            if doctor.user_id == user.id:
                return True
            if request.method in SAFE_METHODS:
                profile = getattr(user, "doctor_profile", None)
                return bool(getattr(profile, "can_view_other_doctors", False))
            return False

        return False


__all__ = ["MaterialPermission", "MaterialUsagePermission"]
