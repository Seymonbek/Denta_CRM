"""Write-side business logic for the departments app.

Views delegate every write to a function in this module so that business
rules (validation, audit fields, side-effects) live in one place, are
transactional, and are trivially unit-testable without HTTP.
"""
from __future__ import annotations

from typing import Any

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models.functions import Lower

from .models import Department

User = get_user_model()


def _normalise_name(name: str) -> str:
    """Trim whitespace; reject empty names."""
    if name is None:
        raise ValidationError({"name": ["Bo'lim nomi majburiy."]})
    cleaned = " ".join(str(name).split())
    if not cleaned:
        raise ValidationError({"name": ["Bo'lim nomi majburiy."]})
    return cleaned


def _assert_unique_name(name: str, *, exclude_id: Any = None) -> None:
    """Case-insensitive uniqueness check among active departments."""
    qs = Department.objects.annotate(name_ci=Lower("name")).filter(
        name_ci=name.lower(), is_active=True
    )
    if exclude_id is not None:
        qs = qs.exclude(pk=exclude_id)
    if qs.exists():
        raise ValidationError(
            {"name": [f"'{name}' nomli bo'lim allaqachon mavjud."]}
        )


@transaction.atomic
def create_department(
    *,
    name: str,
    description: str = "",
    created_by: Any = None,
) -> Department:
    """Create a new active department.

    Args:
        name: The department name (must be unique, case-insensitive).
        description: Optional description text.
        created_by: The ``User`` who is creating the department (usually
            ``request.user`` — a ``bosh_shifokor``).

    Raises:
        ValidationError: if ``name`` is empty or already used.
    """
    name = _normalise_name(name)
    _assert_unique_name(name)

    try:
        department = Department.objects.create(
            name=name,
            description=(description or "").strip(),
            created_by=created_by if isinstance(created_by, User) else None,
            is_active=True,
        )
    except IntegrityError as exc:
        raise ValidationError(
            {"name": ["Bo'lim allaqachon mavjud (DB constraint)."]}
        ) from exc
    return department


@transaction.atomic
def update_department(
    department: Department,
    *,
    name: str | None = None,
    description: str | None = None,
    is_active: bool | None = None,
) -> Department:
    """Update the given department in place.

    Only fields whose kwarg is not ``None`` are updated. This lets DRF
    PATCH pass through partial updates cleanly.
    """
    update_fields: list[str] = []

    if name is not None:
        name = _normalise_name(name)
        _assert_unique_name(name, exclude_id=department.pk)
        department.name = name
        update_fields.append("name")

    if description is not None:
        department.description = (description or "").strip()
        update_fields.append("description")

    if is_active is not None:
        department.is_active = bool(is_active)
        update_fields.append("is_active")

    if update_fields:
        # updated_at is auto-managed; simple_history captures the diff.
        department.save(update_fields=update_fields + ["updated_at"])

    return department


@transaction.atomic
def soft_delete_department(department: Department) -> Department:
    """Soft-delete: flip ``is_active`` to False rather than removing rows.

    Hard deletes are refused because doctors, appointments, and treatments
    may reference the department and PROJECT_BRIEF requires audit trails.
    """
    if department.is_active:
        department.is_active = False
        department.save(update_fields=["is_active", "updated_at"])
    return department


__all__ = [
    "create_department",
    "update_department",
    "soft_delete_department",
]
