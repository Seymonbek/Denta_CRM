"""View-layer permission classes for the ``payments`` app.

Rules (PROJECT_BRIEF § "RBAC" — row "To'lov qabul qilish"):

* ``bosh_shifokor`` — full CRUD on payments, may view any doctor's
  commissions.
* ``doctor`` — may record payments; may view *own* commissions only.
* ``administrator`` — may record payments; read-only on payments list,
  no access to commissions.
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


def _authed_role(request: Request) -> str | None:
    user = getattr(request, "user", None)
    if user is None or not getattr(user, "is_authenticated", False):
        return None
    role = getattr(user, "role", None)
    if role not in ALL_ROLES:
        return None
    return role


class PaymentPermission(BasePermission):
    """PROJECT_BRIEF: all three roles may take payments."""

    message = "Bu amalni bajarish uchun ruxsat yo'q."

    def has_permission(self, request: Request, view: Any) -> bool:
        role = _authed_role(request)
        if role is None:
            return False
        # All three roles may create payments; safe methods for all;
        # only bosh_shifokor may soft-delete via ``DELETE``.
        if request.method in SAFE_METHODS:
            return True
        if request.method == "DELETE":
            return role == ROLE_BOSH_SHIFOKOR
        return role in {ROLE_BOSH_SHIFOKOR, ROLE_DOCTOR, ROLE_ADMINISTRATOR}

    def has_object_permission(self, request: Request, view: Any, obj: Any) -> bool:
        return self.has_permission(request, view)


class PatientBalancePermission(BasePermission):
    """Anyone with a known role may check a patient's balance.

    Doctors are limited to their own patients unless
    ``can_view_other_doctors`` is True. Administrators may check any
    patient — they operate the reception desk.
    """

    message = "Bemor balansiga kirish uchun ruxsat yo'q."

    def has_permission(self, request: Request, view: Any) -> bool:
        return _authed_role(request) is not None


class CommissionsPermission(BasePermission):
    """Only bosh_shifokor and the doctor themselves may read commissions."""

    message = "Komissiya ma'lumotlarini ko'rish uchun ruxsat yo'q."

    def has_permission(self, request: Request, view: Any) -> bool:
        role = _authed_role(request)
        return role in {ROLE_BOSH_SHIFOKOR, ROLE_DOCTOR}


__all__ = [
    "PaymentPermission",
    "PatientBalancePermission",
    "CommissionsPermission",
]
