"""View-layer permission classes for the departments app.

Only :class:`apps.core.permissions.IsBoshShifokor` may **write**
departments; every authenticated user with a known role may **read**
them so that dropdowns in doctor/appointment forms can populate.
"""
from __future__ import annotations

from typing import Any

from rest_framework.permissions import BasePermission
from rest_framework.request import Request

from apps.core.permissions import ALL_ROLES, ROLE_BOSH_SHIFOKOR

# Read-only HTTP methods that authenticated users of any role can use.
SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


class DepartmentPermission(BasePermission):
    """Read: any authenticated role. Write: only bosh_shifokor."""

    message = (
        "Faqat bosh shifokor bo'limlarni yaratish, tahrirlash yoki "
        "o'chirishga ruxsatga ega."
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
        return role == ROLE_BOSH_SHIFOKOR

    def has_object_permission(self, request: Request, view: Any, obj: Any) -> bool:
        return self.has_permission(request, view)


__all__ = ["DepartmentPermission"]
