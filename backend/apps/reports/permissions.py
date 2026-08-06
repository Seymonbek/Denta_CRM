"""View-layer permission classes for the ``reports`` app.

Only ``bosh_shifokor`` may read aggregated reports (PROJECT_BRIEF §
"RBAC" — 'Umumiy moliyaviy hisobot' row + § "Reports" endpoints tagged
'bosh_shifokor only').
"""
from __future__ import annotations

from typing import Any

from rest_framework.permissions import BasePermission
from rest_framework.request import Request

from apps.core.permissions import ROLE_BOSH_SHIFOKOR


class IsHeadDoctor(BasePermission):
    """Only the head doctor may read the reports endpoints."""

    message = "Faqat bosh shifokor hisobotlarga kirishi mumkin."

    def has_permission(self, request: Request, view: Any) -> bool:  # noqa: D401
        user = getattr(request, "user", None)
        if user is None or not getattr(user, "is_authenticated", False):
            return False
        return getattr(user, "role", None) == ROLE_BOSH_SHIFOKOR


__all__ = ["IsHeadDoctor"]
