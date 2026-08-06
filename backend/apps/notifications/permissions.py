"""View-layer permission classes for the ``notifications`` app.

* Anyone authenticated may read their own visible slice — filtering is
  enforced in :meth:`NotificationViewSet.get_queryset` via
  :func:`selectors.visible_to`. The permission class only guards the
  request-level authentication and blocks writes from the API — writes
  are internal (services) only.
"""
from __future__ import annotations

from typing import Any

from rest_framework.permissions import BasePermission
from rest_framework.request import Request

SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


class NotificationPermission(BasePermission):
    """Read-only API — writes go through the services layer."""

    message = "Notifications is a read-only API."

    def has_permission(self, request: Request, view: Any) -> bool:
        user = getattr(request, "user", None)
        if user is None or not getattr(user, "is_authenticated", False):
            return False
        return request.method in SAFE_METHODS


__all__ = ["NotificationPermission"]
