"""Read-side query helpers for the ``patients`` app.

Selectors return querysets; services and views never hand-roll ORM
filters so pagination / search / ordering rules stay centralised and
unit-testable.
"""
from __future__ import annotations

from typing import Any

from django.db.models import Q, QuerySet

from apps.accounts.models import normalise_phone_number

from .models import Patient


def active_patients() -> QuerySet[Patient]:
    """All non-deleted patients.

    T122: ``created_by`` is dereferenced by the list serializer's
    ``_camel_user`` helper for every row, so ``select_related`` collapses
    the classic N+1 into a single JOIN.
    """
    return Patient.objects.select_related("created_by").filter(is_active=True)


def all_patients() -> QuerySet[Patient]:
    """Every patient — soft-deleted included (bosh_shifokor only).

    Same ``select_related("created_by")`` as :func:`active_patients` —
    both list variants pass through the same DRF serializer.
    """
    return Patient.objects.select_related("created_by").all()


def patient_by_id(patient_id: Any) -> Patient | None:
    """Fetch a single patient by primary key or ``None``."""
    return Patient.objects.filter(pk=patient_id).first()


def search_patients(
    query: str | None,
    *,
    include_inactive: bool = False,
) -> QuerySet[Patient]:
    """Return patients matching ``query`` (name or phone, case-insensitive).

    * Empty / whitespace query → base queryset (respecting ``include_inactive``).
    * Contains only digits and optional '+' → phone-number substring
      match against the canonical, normalised phone.
    * Otherwise → case-insensitive substring on first_name / last_name /
      full ``"first last"`` combination / phone.
    """
    qs = all_patients() if include_inactive else active_patients()
    q = (query or "").strip()
    if not q:
        return qs.order_by("last_name", "first_name")

    # If it looks like a phone (only digits and optional leading +) try
    # a normalised match first — otherwise fall through to name search.
    phone_like = q.replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    if phone_like and (phone_like[0] == "+" or phone_like.isdigit()):
        try:
            normalised = normalise_phone_number(phone_like)
        except Exception:  # noqa: BLE001 - validation errors → fall back
            normalised = None
        if normalised:
            qs_phone = qs.filter(phone_number__icontains=normalised.lstrip("+"))
            if qs_phone.exists():
                return qs_phone.order_by("last_name", "first_name")

    tokens = [t for t in q.split() if t]
    condition = Q()
    for token in tokens:
        condition &= (
            Q(first_name__icontains=token)
            | Q(last_name__icontains=token)
            | Q(phone_number__icontains=token)
            | Q(notes__icontains=token)
        )
    return qs.filter(condition).order_by("last_name", "first_name")


__all__ = [
    "active_patients",
    "all_patients",
    "patient_by_id",
    "search_patients",
]
