"""Write-side services for the ``ratings`` app.

Everything that mutates ratings state goes through here so:

* signals can call a single well-tested function instead of duplicating
  ORM boilerplate;
* the leaderboard cron / management command has a stable API;
* tests can call the same function the signals do without spinning up
  the whole HTTP stack.
"""
from __future__ import annotations

import logging
from datetime import date

from django.db import transaction

from apps.doctors.models import DoctorProfile

from .models import (
    DEFAULT_POINTS_PER_REASON,
    Badge,
    DoctorBadge,
    ScoreLog,
    ScoreReason,
)
from .selectors import (
    get_or_create_badge,
    leaderboard,
    parse_period,
    total_points_for_doctor,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Award / adjust points
# ---------------------------------------------------------------------------
@transaction.atomic
def award_points(
    *,
    doctor: DoctorProfile,
    reason: str,
    points: int | None = None,
    related_patient=None,
    related_treatment=None,
    note: str = "",
) -> ScoreLog:
    """Append a :class:`ScoreLog` row and return it.

    ``points`` defaults to the value in
    :data:`DEFAULT_POINTS_PER_REASON` when ``None``. ``ADJUSTMENT`` rows
    require an explicit ``points`` value.
    """
    if reason not in ScoreReason.values:
        raise ValueError(f"Unknown score reason: {reason!r}")

    if points is None:
        if reason == ScoreReason.ADJUSTMENT:
            raise ValueError(
                "ADJUSTMENT rows must specify ``points`` explicitly.",
            )
        points = DEFAULT_POINTS_PER_REASON.get(reason, 0)

    if not isinstance(points, int):
        raise TypeError("points must be an integer")

    log = ScoreLog.objects.create(
        doctor=doctor,
        reason=reason,
        points=points,
        related_patient=related_patient,
        related_treatment=related_treatment,
        note=note or "",
    )
    logger.info(
        "ratings: awarded %+d pts to doctor %s (reason=%s)",
        points,
        doctor.pk,
        reason,
    )
    return log


def award_points_by_user(
    *,
    user,
    reason: str,
    points: int | None = None,
    related_patient=None,
    related_treatment=None,
) -> ScoreLog | None:
    """Convenience wrapper for signal handlers that only have ``user``.

    Returns ``None`` when the user has no doctor profile (e.g. admins,
    reception clerks) so signals can call this unconditionally without
    an ``if``.
    """
    profile = getattr(user, "doctor_profile", None)
    if profile is None:
        return None
    return award_points(
        doctor=profile,
        reason=reason,
        points=points,
        related_patient=related_patient,
        related_treatment=related_treatment,
    )


# ---------------------------------------------------------------------------
# Badges
# ---------------------------------------------------------------------------
@transaction.atomic
def award_badge(
    *,
    doctor: DoctorProfile,
    badge: Badge,
    period: str,
    total_points: int | None = None,
) -> DoctorBadge:
    """Idempotently award ``badge`` to ``doctor`` for ``period``."""
    if total_points is None:
        total_points = total_points_for_doctor(doctor.pk, period=period)
    obj, created = DoctorBadge.objects.get_or_create(
        doctor=doctor,
        badge=badge,
        period=period,
        defaults={"total_points": int(total_points)},
    )
    if not created and obj.total_points != int(total_points):
        obj.total_points = int(total_points)
        obj.save(update_fields=["total_points", "updated_at"])
    return obj


# Well-known badge slugs so services can reference them without magic strings.
TOP_DOCTOR_MONTH_SLUG = "top_doctor_month"
MOST_PATIENTS_MONTH_SLUG = "most_patients_month"


@transaction.atomic
def compute_and_award_period_badges(
    *,
    period: str,
    top_n: int = 1,
) -> list[DoctorBadge]:
    """Award the "top doctor" badge to the top ``top_n`` doctors of a period.

    ``period`` is a ``YYYY-MM`` string. Idempotent — running twice
    doesn't create duplicates because of the
    ``(doctor, badge, period)`` uniqueness constraint.
    """
    parsed = parse_period(period)
    if parsed is None:
        raise ValueError("Period is required (format YYYY-MM).")
    board = leaderboard(period=period, limit=max(int(top_n), 1))
    if not board:
        return []

    top_doctor_badge = get_or_create_badge(
        TOP_DOCTOR_MONTH_SLUG,
        defaults={
            "name": "Oylik yetakchi shifokor",
            "description": "Ushbu oyda eng ko'p ball to'plagan shifokor.",
            "icon": "trophy",
        },
    )

    awarded: list[DoctorBadge] = []
    for entry in board[: top_n]:
        profile = DoctorProfile.objects.filter(pk=entry.doctor_id).first()
        if profile is None:
            continue
        awarded.append(
            award_badge(
                doctor=profile,
                badge=top_doctor_badge,
                period=period,
                total_points=entry.total_points,
            )
        )
    return awarded


# ---------------------------------------------------------------------------
# Activity streak (bonus points for N consecutive active days)
# ---------------------------------------------------------------------------
def _distinct_activity_dates_for(
    doctor: DoctorProfile,
    *,
    lookback_days: int,
) -> list[date]:
    """Return the distinct dates on which ``doctor`` logged any activity."""
    from django.utils import timezone

    since = timezone.now().date() - timezone.timedelta(days=lookback_days) \
        if hasattr(timezone, "timedelta") else None
    if since is None:  # pragma: no cover - timezone.timedelta always exists
        from datetime import timedelta
        since = timezone.now().date() - timedelta(days=lookback_days)

    qs = ScoreLog.objects.filter(
        doctor=doctor,
        is_active=True,
        created_at__date__gte=since,
    ).exclude(reason=ScoreReason.ACTIVITY_STREAK)
    dates = qs.values_list("created_at__date", flat=True).distinct().order_by("-created_at__date")
    return list(dates)


def check_and_award_streak(
    *,
    doctor: DoctorProfile,
    required_days: int = 5,
) -> ScoreLog | None:
    """Award a streak bonus if the doctor was active on N consecutive days.

    Called from :func:`apps.ratings.tasks.check_streaks` by Celery Beat.
    Idempotent per calendar day — never emits more than one streak row
    for the same trailing day.
    """
    from datetime import timedelta

    from django.utils import timezone

    today = timezone.now().date()
    active_days = _distinct_activity_dates_for(doctor, lookback_days=required_days + 2)
    if len(active_days) < required_days:
        return None

    # Need required_days consecutive from ``today - required_days + 1`` … today.
    required = {today - timedelta(days=i) for i in range(required_days)}
    if not required.issubset(set(active_days)):
        return None

    # Idempotency — one streak per day.
    if ScoreLog.objects.filter(
        doctor=doctor,
        reason=ScoreReason.ACTIVITY_STREAK,
        created_at__date=today,
    ).exists():
        return None

    return award_points(
        doctor=doctor,
        reason=ScoreReason.ACTIVITY_STREAK,
        note=f"{required_days} kunlik faollik ketma-ketligi",
    )


__all__ = [
    "award_points",
    "award_points_by_user",
    "award_badge",
    "compute_and_award_period_badges",
    "check_and_award_streak",
    "TOP_DOCTOR_MONTH_SLUG",
    "MOST_PATIENTS_MONTH_SLUG",
]
