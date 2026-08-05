"""Role-based access control primitives.

PROJECT_BRIEF.md § "RBAC" defines three roles:
    - ``bosh_shifokor``  — head doctor / clinic owner (full access)
    - ``doctor``         — treating doctor (patient/treatment scope)
    - ``administrator``  — reception (scheduling, payments)

The custom :class:`accounts.models.User` (added in T4) stores the role
as a string field. Until that model exists the permission classes still
work: they simply return ``False`` when no user or role is present,
which is the safe default for a locked-down API.

Each class also enforces authentication — an anonymous request is
rejected before role checks run.
"""
from __future__ import annotations

from typing import Any

from rest_framework.permissions import BasePermission
from rest_framework.request import Request

# ---------------------------------------------------------------------------
# Role identifiers (mirrored on User.Role in T4)
# ---------------------------------------------------------------------------
ROLE_BOSH_SHIFOKOR = "bosh_shifokor"
ROLE_DOCTOR = "doctor"
ROLE_ADMINISTRATOR = "administrator"

ALL_ROLES = frozenset({ROLE_BOSH_SHIFOKOR, ROLE_DOCTOR, ROLE_ADMINISTRATOR})


def _user_has_role(request: Request, role: str) -> bool:
    """Return True when the authenticated user has the given role."""
    user = getattr(request, "user", None)
    if user is None or not getattr(user, "is_authenticated", False):
        return False
    return getattr(user, "role", None) == role


class _RolePermission(BasePermission):
    """Base class for a single-role permission gate."""

    required_role: str = ""
    message = "You do not have permission to perform this action."

    def has_permission(self, request: Request, view: Any) -> bool:  # noqa: D401
        return _user_has_role(request, self.required_role)


class IsBoshShifokor(_RolePermission):
    """Grants access only to head-doctor (``bosh_shifokor``) accounts."""

    required_role = ROLE_BOSH_SHIFOKOR
    message = "Only the head doctor (bosh_shifokor) can perform this action."


class IsDoctor(_RolePermission):
    """Grants access only to doctor accounts."""

    required_role = ROLE_DOCTOR
    message = "Only doctors can perform this action."


class IsAdministrator(_RolePermission):
    """Grants access only to administrator (reception) accounts."""

    required_role = ROLE_ADMINISTRATOR
    message = "Only administrators (reception) can perform this action."


class IsBoshShifokorOrDoctor(BasePermission):
    """Convenience OR-combiner: head doctor **or** doctor."""

    message = "Only medical staff can perform this action."

    def has_permission(self, request: Request, view: Any) -> bool:
        return _user_has_role(request, ROLE_BOSH_SHIFOKOR) or _user_has_role(
            request, ROLE_DOCTOR
        )


class IsBoshShifokorOrAdministrator(BasePermission):
    """Convenience OR-combiner: head doctor **or** administrator."""

    message = "Only the head doctor or an administrator can perform this action."

    def has_permission(self, request: Request, view: Any) -> bool:
        return _user_has_role(request, ROLE_BOSH_SHIFOKOR) or _user_has_role(
            request, ROLE_ADMINISTRATOR
        )


class IsOwnerDoctorOrPermitted(BasePermission):
    """Object-level permission for doctor-scoped resources.

    Rules:
      * ``bosh_shifokor`` — always allowed.
      * ``doctor`` — allowed if the object belongs to them **or** their
        ``DoctorProfile.can_view_other_doctors`` flag is True.
      * ``administrator`` — allowed for read-only actions when the view
        opts in via ``allow_admin_read = True``.

    The object is resolved through one of a small set of well-known
    attribute names so the same permission works across appointments,
    treatments, patients, etc. Views can override
    :meth:`get_owner_doctor` on the view class if their model uses a
    non-standard relationship.
    """

    message = "You do not have permission to access this resource."

    _DOCTOR_ATTRS: tuple[str, ...] = ("doctor", "assigned_doctor", "owner_doctor")

    def has_permission(self, request: Request, view: Any) -> bool:
        # Must at least be authenticated with a known role.
        user = getattr(request, "user", None)
        if user is None or not getattr(user, "is_authenticated", False):
            return False
        return getattr(user, "role", None) in ALL_ROLES

    def has_object_permission(self, request: Request, view: Any, obj: Any) -> bool:
        user = request.user
        role = getattr(user, "role", None)

        if role == ROLE_BOSH_SHIFOKOR:
            return True

        if role == ROLE_ADMINISTRATOR:
            # Administrators can read appointments/patients but not doctor-only
            # clinical data. Views opt-in explicitly.
            if request.method in ("GET", "HEAD", "OPTIONS") and getattr(
                view, "allow_admin_read", False
            ):
                return True
            return False

        if role == ROLE_DOCTOR:
            owner = self._resolve_owner_doctor(view, obj)
            if owner is None:
                return False
            # Doctors may see other doctors' resources only if their
            # profile has can_view_other_doctors=True.
            if self._owner_is_user(owner, user):
                return True
            profile = getattr(user, "doctor_profile", None)
            return bool(getattr(profile, "can_view_other_doctors", False))

        return False

    # ---- helpers -----------------------------------------------------------

    def _resolve_owner_doctor(self, view: Any, obj: Any) -> Any:
        """Find the doctor that owns ``obj`` using view hook or defaults."""
        hook = getattr(view, "get_owner_doctor", None)
        if callable(hook):
            return hook(obj)
        for attr in self._DOCTOR_ATTRS:
            if hasattr(obj, attr):
                return getattr(obj, attr)
        return None

    @staticmethod
    def _owner_is_user(owner: Any, user: Any) -> bool:
        """Return True when ``owner`` (DoctorProfile) belongs to ``user``."""
        if owner is None:
            return False
        # DoctorProfile has a ``user`` OneToOne (see T8). Compare ids to
        # avoid triggering an extra query.
        owner_user_id = getattr(owner, "user_id", None)
        if owner_user_id is not None:
            return owner_user_id == getattr(user, "id", None)
        # Fall back to direct equality for tests / stub objects.
        return owner == user
