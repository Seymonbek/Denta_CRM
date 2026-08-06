"""Tests for the ``ratings`` app (T18 — Faza 4).

Covers PROJECT_BRIEF acceptance criteria:

* :class:`ScoreLog` — award points via services & signals.
* Leaderboard — sums, ordering, period filter.
* Badges — award, list per doctor, unique-per-period.
* RBAC — only bosh_shifokor + doctor can read the leaderboard;
  administrator is 403; doctor cannot see another doctor's badges
  unless ``can_view_other_doctors`` is set.
"""
from __future__ import annotations

from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.departments.models import Department
from apps.doctors.models import CommissionBasis, DoctorProfile
from apps.patients.services import create_patient
from apps.ratings.models import (
    Badge,
    DoctorBadge,
    ScoreLog,
    ScoreReason,
)
from apps.ratings.selectors import (
    leaderboard,
    parse_period,
    total_points_for_doctor,
)
from apps.ratings.services import (
    TOP_DOCTOR_MONTH_SLUG,
    award_badge,
    award_points,
    compute_and_award_period_badges,
)

pytestmark = pytest.mark.django_db

User = get_user_model()

LEADERBOARD_URL = "/api/v1/ratings/leaderboard/"


# ===========================================================================
# Fixtures
# ===========================================================================
@pytest.fixture
def head_doctor():
    return User.objects.create_user(
        phone_number="+998900000101",
        password="StrongPass!123",
        first_name="Bosh",
        last_name="Shifokor",
        role=User.Role.BOSH_SHIFOKOR,
    )


@pytest.fixture
def administrator():
    return User.objects.create_user(
        phone_number="+998900000102",
        password="StrongPass!123",
        first_name="Adm",
        last_name="In",
        role=User.Role.ADMINISTRATOR,
    )


@pytest.fixture
def doctor_a_user():
    return User.objects.create_user(
        phone_number="+998900000103",
        password="StrongPass!123",
        first_name="Aziz",
        last_name="Alimov",
        role=User.Role.DOCTOR,
    )


@pytest.fixture
def doctor_b_user():
    return User.objects.create_user(
        phone_number="+998900000104",
        password="StrongPass!123",
        first_name="Botir",
        last_name="Botirov",
        role=User.Role.DOCTOR,
    )


@pytest.fixture
def department(head_doctor):
    return Department.objects.create(
        name="Terapiya",
        description="",
        created_by=head_doctor,
    )


@pytest.fixture
def doctor_a(doctor_a_user, department):
    profile = DoctorProfile.objects.create(
        user=doctor_a_user,
        specialization="Terapevt",
        commission_basis=CommissionBasis.FROM_TOTAL,
        default_commission_rate=Decimal("30.00"),
    )
    profile.departments.add(department)
    return profile


@pytest.fixture
def doctor_b(doctor_b_user, department):
    profile = DoctorProfile.objects.create(
        user=doctor_b_user,
        specialization="Ortoped",
        commission_basis=CommissionBasis.FROM_TOTAL,
        default_commission_rate=Decimal("25.00"),
    )
    profile.departments.add(department)
    return profile


@pytest.fixture
def api_client():
    return APIClient()


def _auth(client: APIClient, user) -> APIClient:
    client.force_authenticate(user=user)
    return client


# ===========================================================================
# 1. Period parsing
# ===========================================================================
class TestParsePeriod:
    def test_none_returns_none(self):
        assert parse_period(None) is None
        assert parse_period("") is None

    def test_valid_period_returns_half_open_range(self):
        start, end = parse_period("2026-07")
        assert start.year == 2026 and start.month == 7 and start.day == 1
        assert end.year == 2026 and end.month == 8 and end.day == 1

    def test_year_end_rolls_over(self):
        start, end = parse_period("2026-12")
        assert end.year == 2027 and end.month == 1 and end.day == 1

    @pytest.mark.parametrize(
        "raw",
        ["2026-7", "2026-13", "2026", "2026-00", "abc", "07-2026"],
    )
    def test_invalid_raises(self, raw):
        with pytest.raises(ValueError):
            parse_period(raw)


# ===========================================================================
# 2. Award points via service
# ===========================================================================
class TestAwardPoints:
    def test_default_points_by_reason(self, doctor_a):
        log = award_points(doctor=doctor_a, reason=ScoreReason.NEW_PATIENT)
        assert log.points == 5
        assert log.reason == ScoreReason.NEW_PATIENT

    def test_explicit_points_override_default(self, doctor_a):
        log = award_points(
            doctor=doctor_a, reason=ScoreReason.PHOTO_UPLOADED, points=7,
        )
        assert log.points == 7

    def test_adjustment_requires_points(self, doctor_a):
        with pytest.raises(ValueError):
            award_points(doctor=doctor_a, reason=ScoreReason.ADJUSTMENT)

    def test_adjustment_accepts_negative_points(self, doctor_a):
        log = award_points(
            doctor=doctor_a, reason=ScoreReason.ADJUSTMENT, points=-3,
        )
        assert log.points == -3

    def test_unknown_reason_raises(self, doctor_a):
        with pytest.raises(ValueError):
            award_points(doctor=doctor_a, reason="not-a-reason")

    def test_total_points_sums_ledger(self, doctor_a):
        award_points(doctor=doctor_a, reason=ScoreReason.NEW_PATIENT)  # +5
        award_points(doctor=doctor_a, reason=ScoreReason.TREATMENT_COMPLETED)  # +10
        award_points(
            doctor=doctor_a, reason=ScoreReason.ADJUSTMENT, points=-2,
        )
        assert total_points_for_doctor(doctor_a.pk) == 13


# ===========================================================================
# 3. Signal-based awarding
# ===========================================================================
class TestSignalAwarding:
    def test_new_patient_by_doctor_awards_points(self, doctor_a_user, doctor_a):
        create_patient(
            first_name="Ali",
            last_name="Test",
            phone_number="+998907000000",
            created_by=doctor_a_user,
        )
        logs = ScoreLog.objects.filter(doctor=doctor_a, reason=ScoreReason.NEW_PATIENT)
        assert logs.count() == 1
        assert logs.first().points == 5

    def test_new_patient_by_admin_awards_nothing(self, administrator, doctor_a):
        create_patient(
            first_name="Bek",
            last_name="Test",
            phone_number="+998907000001",
            created_by=administrator,
        )
        assert ScoreLog.objects.filter(doctor=doctor_a).count() == 0


# ===========================================================================
# 4. Leaderboard aggregation
# ===========================================================================
class TestLeaderboard:
    def test_orders_by_total_points_desc(self, doctor_a, doctor_b):
        award_points(doctor=doctor_a, reason=ScoreReason.NEW_PATIENT)  # 5
        award_points(doctor=doctor_b, reason=ScoreReason.TREATMENT_COMPLETED)  # 10
        board = leaderboard()
        assert len(board) == 2
        assert board[0].doctor_id == str(doctor_b.pk)
        assert board[0].total_points == 10
        assert board[0].rank == 1
        assert board[1].doctor_id == str(doctor_a.pk)
        assert board[1].rank == 2

    def test_period_filter_excludes_out_of_range(self, doctor_a, doctor_b):
        # Award to doctor_a in a very old period (adjust via update to bypass auto_now_add).
        log = award_points(doctor=doctor_a, reason=ScoreReason.TREATMENT_COMPLETED)
        old_ts = timezone.now().replace(year=2020, month=1, day=15)
        ScoreLog.objects.filter(pk=log.pk).update(created_at=old_ts)
        # Award to doctor_b now.
        award_points(doctor=doctor_b, reason=ScoreReason.NEW_PATIENT)
        current_period = timezone.now().strftime("%Y-%m")
        board = leaderboard(period=current_period)
        doctor_ids = [entry.doctor_id for entry in board]
        assert str(doctor_b.pk) in doctor_ids
        assert str(doctor_a.pk) not in doctor_ids

    def test_all_time_includes_zero_score_doctors(self, doctor_a, doctor_b):
        board = leaderboard()
        # Both should appear even without any score log.
        assert {entry.doctor_id for entry in board} == {
            str(doctor_a.pk),
            str(doctor_b.pk),
        }

    def test_ties_are_broken_by_lastname(self, doctor_a, doctor_b):
        award_points(doctor=doctor_a, reason=ScoreReason.PHOTO_UPLOADED, points=10)
        award_points(doctor=doctor_b, reason=ScoreReason.PHOTO_UPLOADED, points=10)
        board = leaderboard()
        # Alimov < Botirov alphabetically.
        assert board[0].last_name == "Alimov"
        assert board[1].last_name == "Botirov"


# ===========================================================================
# 5. Badges
# ===========================================================================
class TestBadges:
    def test_award_badge_creates_row(self, doctor_a):
        badge = Badge.objects.create(
            slug="test_badge", name="Test badge", description="",
        )
        awarded = award_badge(doctor=doctor_a, badge=badge, period="2026-07")
        assert awarded.doctor_id == doctor_a.pk
        assert awarded.badge_id == badge.pk
        assert awarded.period == "2026-07"

    def test_award_badge_is_idempotent(self, doctor_a):
        badge = Badge.objects.create(slug="x", name="X")
        award_badge(doctor=doctor_a, badge=badge, period="2026-07", total_points=42)
        award_badge(doctor=doctor_a, badge=badge, period="2026-07", total_points=50)
        rows = DoctorBadge.objects.filter(
            doctor=doctor_a, badge=badge, period="2026-07",
        )
        assert rows.count() == 1
        assert rows.first().total_points == 50

    def test_compute_period_badges_awards_top_doctor(self, doctor_a, doctor_b):
        # Force records into current month
        award_points(doctor=doctor_a, reason=ScoreReason.NEW_PATIENT)  # +5
        award_points(doctor=doctor_b, reason=ScoreReason.TREATMENT_COMPLETED)  # +10
        period = timezone.now().strftime("%Y-%m")
        result = compute_and_award_period_badges(period=period, top_n=1)
        assert len(result) == 1
        assert result[0].doctor_id == doctor_b.pk
        assert DoctorBadge.objects.filter(
            badge__slug=TOP_DOCTOR_MONTH_SLUG, period=period,
        ).count() == 1


# ===========================================================================
# 6. Leaderboard API + RBAC
# ===========================================================================
class TestLeaderboardApi:
    def test_head_doctor_can_read(self, api_client, head_doctor, doctor_a):
        award_points(doctor=doctor_a, reason=ScoreReason.NEW_PATIENT)
        _auth(api_client, head_doctor)
        response = api_client.get(LEADERBOARD_URL)
        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, list)
        assert response.data[0]["doctorId"] == str(doctor_a.pk)
        assert response.data[0]["totalPoints"] == 5
        assert response.data[0]["rank"] == 1

    def test_doctor_can_read(self, api_client, doctor_a_user, doctor_a):
        _auth(api_client, doctor_a_user)
        response = api_client.get(LEADERBOARD_URL)
        assert response.status_code == status.HTTP_200_OK

    def test_administrator_cannot_read(self, api_client, administrator):
        _auth(api_client, administrator)
        response = api_client.get(LEADERBOARD_URL)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_anonymous_gets_401(self, api_client):
        response = api_client.get(LEADERBOARD_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_invalid_period_returns_400_envelope(
        self, api_client, head_doctor,
    ):
        _auth(api_client, head_doctor)
        response = api_client.get(LEADERBOARD_URL + "?period=bad")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        # Standard error envelope from apps/core/exceptions.py.
        payload = response.data
        assert "error" in payload
        assert payload["error"]["code"]

    def test_limit_query_param_caps_results(
        self, api_client, head_doctor, doctor_a, doctor_b,
    ):
        award_points(doctor=doctor_a, reason=ScoreReason.NEW_PATIENT)
        award_points(doctor=doctor_b, reason=ScoreReason.TREATMENT_COMPLETED)
        _auth(api_client, head_doctor)
        response = api_client.get(LEADERBOARD_URL + "?limit=1")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1


# ===========================================================================
# 7. Doctor badges API + RBAC
# ===========================================================================
class TestDoctorBadgesApi:
    def _url(self, doctor_id):
        return f"/api/v1/doctors/{doctor_id}/badges/"

    def test_head_doctor_sees_any_doctors_badges(
        self, api_client, head_doctor, doctor_a,
    ):
        badge = Badge.objects.create(slug="hero", name="Hero")
        award_badge(doctor=doctor_a, badge=badge, period="2026-07", total_points=99)
        _auth(api_client, head_doctor)
        response = api_client.get(self._url(doctor_a.pk))
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]["period"] == "2026-07"
        assert response.data[0]["totalPoints"] == 99
        assert response.data[0]["badge"]["slug"] == "hero"

    def test_doctor_can_see_their_own_badges(
        self, api_client, doctor_a_user, doctor_a,
    ):
        badge = Badge.objects.create(slug="self", name="Self")
        award_badge(doctor=doctor_a, badge=badge, period="2026-07")
        _auth(api_client, doctor_a_user)
        response = api_client.get(self._url(doctor_a.pk))
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1

    def test_doctor_cannot_see_other_doctors_badges_by_default(
        self, api_client, doctor_a_user, doctor_a, doctor_b,
    ):
        badge = Badge.objects.create(slug="other", name="Other")
        award_badge(doctor=doctor_b, badge=badge, period="2026-07")
        _auth(api_client, doctor_a_user)
        response = api_client.get(self._url(doctor_b.pk))
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_doctor_with_can_view_flag_sees_other_badges(
        self, api_client, doctor_a_user, doctor_a, doctor_b,
    ):
        doctor_a.can_view_other_doctors = True
        doctor_a.save(update_fields=["can_view_other_doctors"])
        badge = Badge.objects.create(slug="visible", name="V")
        award_badge(doctor=doctor_b, badge=badge, period="2026-07")
        _auth(api_client, doctor_a_user)
        response = api_client.get(self._url(doctor_b.pk))
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1

    def test_administrator_cannot_read_badges(
        self, api_client, administrator, doctor_a,
    ):
        _auth(api_client, administrator)
        response = api_client.get(self._url(doctor_a.pk))
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_missing_doctor_returns_404(self, api_client, head_doctor):
        import uuid
        _auth(api_client, head_doctor)
        response = api_client.get(self._url(uuid.uuid4()))
        assert response.status_code == status.HTTP_404_NOT_FOUND
