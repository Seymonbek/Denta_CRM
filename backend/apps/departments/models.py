"""Models for the ``departments`` app.

A :class:`Department` is a clinical unit inside the clinic (e.g. Terapiya,
Ortopediya, Xirurgiya). Doctors are assigned to one or more departments
via an M2M in the ``doctors`` app (T8) and every appointment / treatment
carries a FK to the department it belongs to.

Design notes:

* We inherit from :class:`apps.core.models.BaseModel` for a UUID pk,
  created_at, updated_at, and ``is_active`` (soft-delete flag).
* ``created_by`` is a FK to ``settings.AUTH_USER_MODEL`` with
  ``on_delete=PROTECT`` — deleting a user must not orphan / delete the
  history of who created a department (an admin can reassign first).
* ``name`` is globally unique (case-insensitive) so the UI can safely
  use the name as a display key. Uniqueness is enforced at the DB level
  via a functional index.
* Uses :mod:`simple_history` per PROJECT_BRIEF § Constraints (audit log
  requirement — although Constraints list Treatment/Payment/Material,
  applying it to Department is cheap and gives us an admin history
  view "for free").
"""
from __future__ import annotations

from django.conf import settings
from django.db import models
from django.db.models.functions import Lower
from django.utils.translation import gettext_lazy as _
from simple_history.models import HistoricalRecords

from apps.core.models import BaseModel


class Department(BaseModel):
    """Clinical bo'lim inside the clinic."""

    name = models.CharField(
        _("Nomi"),
        max_length=100,
        help_text=_("Bo'lim nomi, masalan: Terapiya, Ortopediya, Xirurgiya."),
    )
    description = models.TextField(
        _("Tavsif"),
        blank=True,
        default="",
        help_text=_("Ixtiyoriy — bo'lim xizmatlari haqida qisqacha izoh."),
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="departments_created",
        related_query_name="department_created",
        verbose_name=_("Yaratgan foydalanuvchi"),
        null=True,
        blank=True,
    )

    # Audit log — see PROJECT_BRIEF § Constraints.
    history = HistoricalRecords(inherit=True, table_name="departments_department_history")

    class Meta:
        verbose_name = _("Bo'lim")
        verbose_name_plural = _("Bo'limlar")
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                Lower("name"),
                name="departments_department_name_ci_unique",
                condition=models.Q(is_active=True),
            ),
        ]
        indexes = [
            models.Index(fields=["is_active"], name="departments_active_idx"),
        ]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return self.name


__all__ = ["Department"]
