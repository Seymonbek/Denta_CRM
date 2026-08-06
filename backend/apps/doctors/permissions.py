"""View-layer permission classes for the ``doctors`` app.

Rules (PROJECT_BRIEF § RBAC):

* ``bosh_shifokor`` — full CRUD on doctors, procedure types, working
  hours, and time-off for anyone.
* ``doctor`` — read all active doctors (needed for appointment forms);
  write only their own working hours + time off; cannot create /
  delete other doctors.
* ``administrator`` — read-only on doctors and procedure types (needed
  to build appointment forms); no writes.
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


def _authenticated_with_role(request: Request) -> bool:
    user = getattr(request, "user", None)
    if user is None or not getattr(user, "is_authenticated", False):
        return False
    return getattr(user, "role", None) in ALL_ROLES


class DoctorProfilePermission(BasePermission):
    """DoctorProfile CRUD permissions."""

    message = "Faqat bosh shifokor shifokor profilini yaratish yoki tahrirlashi mumkin."

    def has_permission(self, request: Request, view: Any) -> bool:
        if not _authenticated_with_role(request):
            return False
        if request.method in SAFE_METHODS:
            return True
        return getattr(request.user, "role", None) == ROLE_BOSH_SHIFOKOR

    def has_object_permission(self, request: Request, view: Any, obj: Any) -> bool:
        if not _authenticated_with_role(request):
            return False
        role = getattr(request.user, "role", None)
        if request.method in SAFE_METHODS:
            return True
        if role == ROLE_BOSH_SHIFOKOR:
            return True
        # A doctor may PATCH only their own profile (e.g. bio update).
        if role == ROLE_DOCTOR and request.method == "PATCH":
            return getattr(obj, "user_id", None) == getattr(request.user, "id", None)
        return False


class WorkingHoursPermission(BasePermission):
    """WorkingHours: bosh_shifokor or the doctor who owns the schedule."""

    message = "Ish jadvalini faqat bosh shifokor yoki tegishli shifokor tahrirlaydi."

    def has_permission(self, request: Request, view: Any) -> bool:
        if not _authenticated_with_role(request):
            return False
        if request.method in SAFE_METHODS:
            return True
        role = getattr(request.user, "role", None)
        return role in {ROLE_BOSH_SHIFOKOR, ROLE_DOCTOR}

    def has_object_permission(self, request: Request, view: Any, obj: Any) -> bool:
        if not _authenticated_with_role(request):
            return False
        role = getattr(request.user, "role", None)
        if request.method in SAFE_METHODS:
            return True
        if role == ROLE_BOSH_SHIFOKOR:
            return True
        if role == ROLE_DOCTOR:
            # ``obj`` may be a DoctorProfile (nested-action route) or a
            # WorkingHours / TimeOff row (once inside services). Resolve
            # both to the same owner user id.
            owner_user_id = _resolve_schedule_owner_user_id(obj)
            return owner_user_id == getattr(request.user, "id", None)
        return False


class TimeOffPermission(WorkingHoursPermission):
    """Same rule as WorkingHours."""

    message = "Dam olish yozuvlarini faqat bosh shifokor yoki tegishli shifokor boshqaradi."


def _resolve_schedule_owner_user_id(obj: Any) -> Any:
    """Return the user_id that owns a DoctorProfile / WorkingHours / TimeOff."""
    if obj is None:
        return None
    # DoctorProfile.user_id
    user_id = getattr(obj, "user_id", None)
    if user_id is not None:
        return user_id
    # WorkingHours.doctor.user_id / TimeOff.doctor.user_id
    doctor = getattr(obj, "doctor", None)
    if doctor is not None:
        return getattr(doctor, "user_id", None)
    return None


class ProcedureTypePermission(BasePermission):
    """ProcedureType: read = all roles; write = bosh_shifokor."""

    message = "Muolaja turlarini faqat bosh shifokor tahrirlaydi."

    def has_permission(self, request: Request, view: Any) -> bool:
        if not _authenticated_with_role(request):
            return False
        if request.method in SAFE_METHODS:
            return True
        return getattr(request.user, "role", None) == ROLE_BOSH_SHIFOKOR

    def has_object_permission(self, request: Request, view: Any, obj: Any) -> bool:
        return self.has_permission(request, view)


__all__ = [
    "DoctorProfilePermission",
    "WorkingHoursPermission",
    "TimeOffPermission",
    "ProcedureTypePermission",
    "SAFE_METHODS",
    "ROLE_ADMINISTRATOR",  # re-exported for convenience
]
