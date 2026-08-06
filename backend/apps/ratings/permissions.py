"""Permission classes for the ``ratings`` app.

PROJECT_BRIEF § "RBAC":
    * bosh_shifokor: always allowed.
    * doctor:        allowed to read the leaderboard and their own
                     badges. Reading another doctor's badges requires
                     ``can_view_other_doctors=True``.
    * administrator: not allowed to read the leaderboard by default —
                     the leaderboard is a clinical metric.
"""
from __future__ import annotations

from typing import Any

from rest_framework.permissions import BasePermission
from rest_framework.request import Request

from apps.core.permissions import ROLE_BOSH_SHIFOKOR, ROLE_DOCTOR


class LeaderboardPermission(BasePermission):
    """Read-only leaderboard access for medical staff."""

    message = "Faqat bosh shifokor va shifokorlar reytingni ko'ra oladi."

    def has_permission(self, request: Request, view: Any) -> bool:
        user = getattr(request, "user", None)
        if user is None or not getattr(user, "is_authenticated", False):
            return False
        return getattr(user, "role", None) in {ROLE_BOSH_SHIFOKOR, ROLE_DOCTOR}


class DoctorBadgesPermission(BasePermission):
    """Doctor badges are visible to bosh_shifokor and (their own) doctor."""

    message = "Ushbu shifokorning nishonlarini ko'rish uchun ruxsatingiz yo'q."

    def has_permission(self, request: Request, view: Any) -> bool:
        user = getattr(request, "user", None)
        if user is None or not getattr(user, "is_authenticated", False):
            return False
        role = getattr(user, "role", None)
        if role == ROLE_BOSH_SHIFOKOR:
            return True
        return role == ROLE_DOCTOR


__all__ = ["LeaderboardPermission", "DoctorBadgesPermission"]
