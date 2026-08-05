"""Read-side query helpers for the departments app.

Selectors return querysets; views/services never build queries inline so
that filtering/ordering rules stay centralised and testable.
"""
from __future__ import annotations

from django.db.models import QuerySet

from .models import Department


def active_departments() -> QuerySet[Department]:
    """Return all active departments, ordered by name."""
    return Department.objects.filter(is_active=True).order_by("name")


def all_departments() -> QuerySet[Department]:
    """Return every department (active + inactive) — admin views only."""
    return Department.objects.all().order_by("name")


def department_by_id(department_id: str) -> Department | None:
    """Return a single department by id or ``None`` if not found."""
    return Department.objects.filter(pk=department_id).first()
