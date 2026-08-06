"""View-layer permission classes for the ``scheduling`` app.

Rules (PROJECT_BRIEF § RBAC):

* Read: any authenticated user. Doctors only see appointments where
  they are the doctor, unless their profile has
  ``can_view_other_doctors=True`` (then they see all).
* Create / update / cancel: ``bosh_shifokor`` and ``administrator``
  ("Bemor ro'yxatga olish/navbat" row in the RBAC table).
* Doctors cannot create/modify appointments themselves — they only
  update **status** transitions on their own appointments (e.g. mark
  ``in_progress`` when the patient sits down). We surface that via
  a narrower per-object rule in :meth:`AppointmentPermission.has_object_permission`.
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

_CREATE_ROLES = frozenset({ROLE_BOSH_SHIFOKOR, ROLE_ADMINISTRATOR})


class AppointmentPermission(BasePermission):
    """Read: any authenticated role. Write: bosh_shifokor / administrator.

    Doctors get a narrow write path — they can PATCH the ``status`` of
    their own appointments (their view of ``/appointments/{id}/``). All
    other writes (create, reschedule, cancel) are limited to the head
    doctor and administrators.
    """

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
        # Creation is only for bosh_shifokor / administrator.
        if request.method == "POST":
            return role in _CREATE_ROLES
        # PATCH / PUT / DELETE — allow the entry to proceed and let
        # has_object_permission do the fine-grained check.
        return role in _CREATE_ROLES or role == ROLE_DOCTOR

    def has_object_permission(
        self, request: Request, view: Any, obj: Any
    ) -> bool:
        user = request.user
        role = getattr(user, "role", None)

        if request.method in SAFE_METHODS:
            return _can_read(user, obj, role=role)

        if role == ROLE_BOSH_SHIFOKOR or role == ROLE_ADMINISTRATOR:
            return True

        if role == ROLE_DOCTOR:
            if not _owns_appointment(user, obj):
                return False
            # Doctor can PATCH — but only status/notes updates. We
            # signal that by inspecting request.data at view time.
            if request.method == "PATCH":
                allowed_keys = {"status", "notes"}
                payload_keys = set((request.data or {}).keys())
                return payload_keys.issubset(allowed_keys) and payload_keys
            return False
        return False


def _can_read(user: Any, obj: Any, *, role: str | None) -> bool:
    if role in (ROLE_BOSH_SHIFOKOR, ROLE_ADMINISTRATOR):
        return True
    if role == ROLE_DOCTOR:
        if _owns_appointment(user, obj):
            return True
        profile = getattr(user, "doctor_profile", None)
        return bool(getattr(profile, "can_view_other_doctors", False))
    return False


def _owns_appointment(user: Any, obj: Any) -> bool:
    doctor = getattr(obj, "doctor", None)
    if doctor is None:
        return False
    return getattr(doctor, "user_id", None) == getattr(user, "id", None)


__all__ = ["AppointmentPermission", "SAFE_METHODS"]
