"""Read-side helpers for the ``ratings`` app.

Selectors never mutate — they only read. All aggregations are wrapped
so business rules (period parsing, ordering, ties) live in one place
and are shared between the leaderboard endpoint and the dashboard
report.
"""
from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime

from django.db.models import Avg, Count, IntegerField, Q, QuerySet, Sum, Value
from django.db.models.functions import Coalesce

from apps.doctors.models import DoctorProfile

from .models import Badge, DoctorBadge, ScoreLog, PatientReview  # noqa: F401 — re-exported

# YYYY-MM period matcher used by the leaderboard filter.
_PERIOD_RE = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])$")


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class LeaderboardEntry:
    """One row of the leaderboard response."""

    doctor_id: str
    first_name: str
    last_name: str
    specialization: str
    total_points: int
    entries: int
    rank: int
    average_rating: float = 5.0
    reviews_count: int = 0
    badges_count: int = 0


# ---------------------------------------------------------------------------
# Period helpers
# ---------------------------------------------------------------------------
def parse_period(raw: str | None) -> tuple[date, date] | None:
    """Return ``(start, end)`` day range for a ``YYYY-MM`` string.

    ``end`` is the first day of the *next* month so callers can filter
    with ``created_at__gte=start`` and ``created_at__lt=end`` — clean
    half-open interval.
    """
    if raw is None or raw == "":
        return None
    match = _PERIOD_RE.match(raw.strip())
    if not match:
        raise ValueError("Davr YYYY-MM formatida bo'lishi kerak (masalan '2026-07').")
    year, month = int(match.group(1)), int(match.group(2))
    start = date(year, month, 1)
    if month == 12:
        end = date(year + 1, 1, 1)
    else:
        end = date(year, month + 1, 1)
    return start, end


# ---------------------------------------------------------------------------
# ScoreLog queries
# ---------------------------------------------------------------------------
def score_logs_qs() -> QuerySet[ScoreLog]:
    """Base queryset — active logs, related doctor prefetched."""
    return (
        ScoreLog.objects.filter(is_active=True)
        .select_related("doctor", "doctor__user")
        .order_by("-created_at")
    )


def logs_for_doctor(doctor_id) -> QuerySet[ScoreLog]:
    return score_logs_qs().filter(doctor_id=doctor_id)


def total_points_for_doctor(
    doctor_id,
    *,
    period: str | None = None,
) -> int:
    """Sum of points for ``doctor_id`` — optionally scoped to a ``YYYY-MM``."""
    qs = ScoreLog.objects.filter(doctor_id=doctor_id, is_active=True)
    period_range = parse_period(period)
    if period_range is not None:
        start, end = period_range
        qs = qs.filter(created_at__date__gte=start, created_at__date__lt=end)
    result = qs.aggregate(total=Coalesce(Sum("points"), Value(0), output_field=IntegerField()))
    return int(result["total"] or 0)


# ---------------------------------------------------------------------------
# Leaderboard
# ---------------------------------------------------------------------------
def leaderboard(
    *,
    period: str | None = None,
    limit: int | None = 20,
) -> list[LeaderboardEntry]:
    """Return the leaderboard for a given period (or all-time).

    Doctors with zero (or negative) totals are still included when
    ``period`` is None so the frontend can render new-hire rows; when a
    period is specified we only include doctors that scored at least
    one row inside the period.
    """
    period_range = parse_period(period)

    if period_range is None:
        annotation = Sum(
            "score_log__points",
            filter=Q(score_log__is_active=True),
        )
        entries_annotation = Count(
            "score_log", filter=Q(score_log__is_active=True),
        )
        qs = (
            DoctorProfile.objects.filter(is_active=True)
            .select_related("user")
            .prefetch_related("patient_reviews", "badges")
            .annotate(
                total_points=Coalesce(
                    annotation, Value(0), output_field=IntegerField(),
                ),
                entries=Coalesce(
                    entries_annotation, Value(0), output_field=IntegerField(),
                ),
            )
            .order_by(
                "-total_points",
                "user__last_name",
                "user__first_name",
            )
        )
    else:
        start, end = period_range
        annotation = Sum(
            "score_log__points",
            filter=Q(
                score_log__is_active=True,
                score_log__created_at__date__gte=start,
                score_log__created_at__date__lt=end,
            ),
        )
        entries_annotation = Count(
            "score_log",
            filter=Q(
                score_log__is_active=True,
                score_log__created_at__date__gte=start,
                score_log__created_at__date__lt=end,
            ),
        )
        qs = (
            DoctorProfile.objects.filter(is_active=True)
            .select_related("user")
            .prefetch_related("patient_reviews", "badges")
            .annotate(
                total_points=Coalesce(
                    annotation, Value(0), output_field=IntegerField(),
                ),
                entries=Coalesce(
                    entries_annotation, Value(0), output_field=IntegerField(),
                ),
            )
            .filter(entries__gt=0)
            .order_by(
                "-total_points",
                "user__last_name",
                "user__first_name",
            )
        )

    if limit is not None:
        qs = qs[: int(limit)]

    result: list[LeaderboardEntry] = []
    for rank, profile in enumerate(qs, start=1):
        # Calculate rating
        reviews = profile.patient_reviews.filter(is_active=True)
        rev_count = reviews.count()
        avg_rat = 5.0
        if rev_count > 0:
            avg_res = reviews.aggregate(a=Avg("rating"))["a"]
            if avg_res is not None:
                avg_rat = round(float(avg_res), 1)

        b_count = profile.badges.filter(is_active=True).count()

        result.append(
            LeaderboardEntry(
                doctor_id=str(profile.pk),
                first_name=profile.user.first_name if profile.user_id else "",
                last_name=profile.user.last_name if profile.user_id else "",
                specialization=profile.specialization or "",
                total_points=int(getattr(profile, "total_points", 0) or 0),
                entries=int(getattr(profile, "entries", 0) or 0),
                rank=rank,
                average_rating=avg_rat,
                reviews_count=rev_count,
                badges_count=b_count,
            )
        )
    return result


def seed_default_badges_if_empty() -> None:
    defaults = [
        ("top_doctor", "Oltin Stomatolog", "Oy davomida eng yuqori ball to'plagan chempion shifokor", "crown"),
        ("patient_favorite", "Bemorlar Sevimlisi", "Bemorlardan eng ko'p 5 yulduzli baho olgan shifokor", "heart"),
        ("punctual_doc", "O'z Vaqtida Qabul", "Barcha qabullarni o'z vaqtida boshlagan intizomli mutaxassis", "clock"),
        ("implant_master", "Muolajalar Ustasi", "Klinikada 100 dan ortiq muvaffaqiyatli muolajalarni amalga oshirgan shifokor", "award"),
        ("streak_pro", "Faollik Chempioni", "Uzluksiz kunlik faollik va qabullar zanjirini saqlagan shifokor", "zap"),
    ]
    for slug, name, desc, icon in defaults:
        Badge.objects.get_or_create(slug=slug, defaults={"name": name, "description": desc, "icon": icon})


def rating_stats(period: str | None = None) -> dict[str, Any]:
    """Return clinic-wide gamification and ratings KPIs."""
    board = leaderboard(period=period, limit=1)
    top_doc = board[0] if board else None

    avg_rating_res = PatientReview.objects.filter(is_active=True).aggregate(avg=Avg("rating"))
    avg_rating = round(float(avg_rating_res["avg"] or 5.0), 1)
    total_reviews = PatientReview.objects.filter(is_active=True).count()
    total_badges = DoctorBadge.objects.filter(is_active=True).count()
    total_points = ScoreLog.objects.filter(is_active=True).aggregate(s=Sum("points"))["s"] or 0

    return {
        "topDoctorName": f"{top_doc.first_name} {top_doc.last_name}".strip() if top_doc else "Mavjud emas",
        "topDoctorSpecialization": top_doc.specialization if top_doc else "",
        "topDoctorPoints": top_doc.total_points if top_doc else 0,
        "averageClinicRating": avg_rating,
        "totalReviewsCount": total_reviews,
        "totalBadgesCount": total_badges,
        "totalPointsEarned": int(total_points),
    }


# ---------------------------------------------------------------------------
# Badges
# ---------------------------------------------------------------------------
def all_badges() -> QuerySet[Badge]:
    seed_default_badges_if_empty()
    return Badge.objects.filter(is_active=True).order_by("name")



def badges_for_doctor(doctor_id) -> QuerySet[DoctorBadge]:
    return (
        DoctorBadge.objects.filter(doctor_id=doctor_id, is_active=True)
        .select_related("badge", "doctor", "doctor__user")
        .order_by("-awarded_at")
    )


def get_or_create_badge(slug: str, defaults: dict | None = None) -> Badge:
    badge, _created = Badge.objects.get_or_create(
        slug=slug, defaults=defaults or {"name": slug, "description": "", "icon": ""},
    )
    return badge


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------
def iter_active_doctors() -> Iterable[DoctorProfile]:
    return DoctorProfile.objects.filter(is_active=True).select_related("user")


def naive_datetime_of(day: date) -> datetime:  # pragma: no cover - trivial
    return datetime.combine(day, datetime.min.time())


__all__ = [
    "LeaderboardEntry",
    "parse_period",
    "score_logs_qs",
    "logs_for_doctor",
    "total_points_for_doctor",
    "leaderboard",
    "all_badges",
    "badges_for_doctor",
    "get_or_create_badge",
    "iter_active_doctors",
    "seed_default_badges_if_empty",
    "rating_stats",
]
