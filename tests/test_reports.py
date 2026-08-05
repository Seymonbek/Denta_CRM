"""Tests for the ``reports`` app (T19).

Covers PROJECT_BRIEF acceptance criterion #13 (aggregate selectors +
Redis cache) and the RBAC row (Umumiy moliyaviy hisobot — bosh_shifokor
only).

Test scope:

* Selectors: ``period_range``, revenue aggregation, top procedures,
  department breakdown, doctor productivity, appointment counts.
* Services: cache hit / miss, TTL, invalidation.
* Views: response schema, ``period`` parameter, RBAC (bosh_shifokor
  passes; doctor / administrator get 403), unauthenticated gets 401.
"""
from __future__ import annotations

from datetime import datetime, time, timedelta
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.departments.models import Department
from apps.doctors.models import CommissionBasis, DoctorProfile, ProcedureType
from apps.inventory.models import MaterialUnit
from apps.inventory.services import create_material
from apps.patients.services import create_patient
from apps.payments.services import record_payment
from apps.reports import selectors, services
from apps.scheduling.services import create_appointment
from apps.treatments.services import create_treatment

pytestmark = pytest.mark.django_db

User = get_user_model()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture(autouse=True)
def clear_report_cache():
    """Ensure each test starts with a cold cache."""
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def head_doctor():
    return User.objects.create_user(
        phone_number="+998900000001",
        password="StrongPass!123",
        first_name="Bosh",
        last_name="Shifokor",
        role=User.Role.BOSH_SHIFOKOR,
    )


@pytest.fixture
def administrator():
    return User.objects.create_user(
        phone_number="+998900000002",
        password="StrongPass!123",
        first_name="Adm",
        last_name="In",
        role=User.Role.ADMINISTRATOR,
    )


@pytest.fixture
def doctor_user():
    return User.objects.create_user(
        phone_number="+998900000003",
        password="StrongPass!123",
        first_name="Doc",
        last_name="Tor",
        role=User.Role.DOCTOR,
    )


@pytest.fixture
def department(head_doctor):
    return Department.objects.create(
        name="Terapiya", description="", created_by=head_doctor
    )


@pytest.fixture
def department_ortho(head_doctor):
    return Department.objects.create(
        name="Ortopediya", description="", created_by=head_doctor
    )


@pytest.fixture
def doctor(doctor_user, department):
    profile = DoctorProfile.objects.create(
        user=doctor_user,
        specialization="Terapevt",
        commission_basis=CommissionBasis.FROM_TOTAL,
        default_commission_rate=Decimal("30.00"),
    )
    profile.departments.add(department)
    return profile


@pytest.fixture
def procedure_type(department):
    return ProcedureType.objects.create(
        name="Plomba",
        department=department,
        default_duration_minutes=30,
        default_price=Decimal("100000.00"),
    )


@pytest.fixture
def procedure_type_extraction(department):
    return ProcedureType.objects.create(
        name="Chiqarish",
        department=department,
        default_duration_minutes=45,
        default_price=Decimal("150000.00"),
    )


@pytest.fixture
def patient(administrator):
    return create_patient(
        first_name="Ali",
        last_name="Valiyev",
        phone_number="+998901111111",
        created_by=administrator,
    )


def _make_appointment(patient, doctor, department, procedure_type, admin, hour_offset=0):
    tz = timezone.get_current_timezone()
    start = timezone.make_aware(
        datetime.combine(
            timezone.localdate() + timedelta(days=1),
            time(10 + hour_offset, 0),
        ),
        tz,
    )
    end = start + timedelta(minutes=30)
    return create_appointment(
        patient=patient,
        doctor=doctor,
        department=department,
        procedure_type=procedure_type,
        scheduled_start=start,
        scheduled_end=end,
        created_by=admin,
    )


@pytest.fixture
def api_client():
    return APIClient()


def _auth(client, user):
    client.force_authenticate(user=user)
    return client


# ===========================================================================
# 1. period_range
# ===========================================================================
class TestPeriodRange:
    def test_day_range_is_midnight_to_midnight(self):
        now = timezone.now()
        start, end = selectors.period_range("day", at=now)
        assert start < end
        assert (end - start) == timedelta(days=1)
        assert start.hour == 0 and start.minute == 0

    def test_week_range_starts_on_monday(self):
        now = timezone.now()
        start, end = selectors.period_range("week", at=now)
        assert start.weekday() == 0  # Monday
        assert (end - start) == timedelta(days=7)

    def test_month_range_covers_calendar_month(self):
        now = timezone.now()
        start, end = selectors.period_range("month", at=now)
        assert start.day == 1
        assert end.day == 1
        # end must be strictly after start
        assert end > start

    def test_invalid_period_raises(self):
        with pytest.raises(ValueError):
            selectors.period_range("year")  # type: ignore[arg-type]


# ===========================================================================
# 2. Aggregate selectors
# ===========================================================================
class TestAggregateSelectors:
    def test_revenue_between_sums_payments(
        self,
        patient,
        doctor,
        department,
        procedure_type,
        administrator,
        doctor_user,
    ):
        appt = _make_appointment(
            patient, doctor, department, procedure_type, administrator
        )
        treatment = create_treatment(
            appointment=appt,
            patient=patient,
            doctor=doctor,
            department=department,
            procedure_type=procedure_type,
            price=Decimal("100000.00"),
            created_by=doctor_user,
        )
        record_payment(
            treatment=treatment,
            amount=Decimal("40000.00"),
            method="cash",
            received_by=administrator,
        )
        record_payment(
            treatment=treatment,
            amount=Decimal("60000.00"),
            method="card",
            received_by=administrator,
        )
        start, end = selectors.period_range("day")
        total = selectors.revenue_between(start, end)
        assert total == Decimal("100000.00")

    def test_top_procedures_orders_by_count(
        self,
        patient,
        doctor,
        department,
        procedure_type,
        procedure_type_extraction,
        administrator,
        doctor_user,
    ):
        # 2 x Plomba
        for hour in (10, 11):
            appt = _make_appointment(
                patient, doctor, department, procedure_type,
                administrator, hour_offset=hour - 10,
            )
            create_treatment(
                appointment=appt,
                patient=patient,
                doctor=doctor,
                department=department,
                procedure_type=procedure_type,
                price=Decimal("100000.00"),
                created_by=doctor_user,
            )
        # 1 x Chiqarish
        appt3 = _make_appointment(
            patient, doctor, department, procedure_type_extraction,
            administrator, hour_offset=3,
        )
        create_treatment(
            appointment=appt3,
            patient=patient,
            doctor=doctor,
            department=department,
            procedure_type=procedure_type_extraction,
            price=Decimal("150000.00"),
            created_by=doctor_user,
        )
        start, end = selectors.period_range("day")
        top = selectors.top_procedures(start, end)
        # Ordered by count desc: Plomba (2) then Chiqarish (1).
        assert top[0]["name"] == "Plomba"
        assert top[0]["count"] == 2
        assert top[1]["name"] == "Chiqarish"
        assert top[1]["count"] == 1

    def test_department_breakdown(
        self,
        patient,
        doctor,
        department,
        procedure_type,
        administrator,
        doctor_user,
    ):
        appt = _make_appointment(
            patient, doctor, department, procedure_type, administrator,
        )
        create_treatment(
            appointment=appt,
            patient=patient,
            doctor=doctor,
            department=department,
            procedure_type=procedure_type,
            price=Decimal("100000.00"),
            created_by=doctor_user,
        )
        start, end = selectors.period_range("day")
        rows = selectors.department_breakdown(start, end)
        assert len(rows) == 1
        assert rows[0]["name"] == "Terapiya"
        assert rows[0]["treatments"] == 1
        assert Decimal(rows[0]["revenue"]) == Decimal("100000.00")

    def test_appointment_counts_by_status(
        self, patient, doctor, department, procedure_type, administrator,
    ):
        appt = _make_appointment(
            patient, doctor, department, procedure_type, administrator,
        )
        # ``_make_appointment`` schedules for *tomorrow* 10:00. When today is
        # Sunday, tomorrow is the *next* ISO Monday and would fall outside the
        # current week ``[Mon 00:00, next-Mon 00:00)``. To keep this a pure
        # aggregate-selector test — independent of the runner's weekday — we
        # anchor ``period_range`` on the appointment's own timestamp so the
        # returned week is guaranteed to contain it.
        start, end = selectors.period_range("week", at=appt.scheduled_start)
        counts = selectors.appointment_counts(start, end)
        assert counts["total"] >= 1
        assert counts["scheduled"] >= 1

    def test_low_stock_count(self, head_doctor):
        create_material(
            name="Low material",
            unit=MaterialUnit.PIECE,
            quantity_in_stock=Decimal("1.000"),
            minimum_threshold=Decimal("10.000"),
        )
        create_material(
            name="High material",
            unit=MaterialUnit.PIECE,
            quantity_in_stock=Decimal("50.000"),
            minimum_threshold=Decimal("10.000"),
        )
        assert selectors.low_stock_count() == 1


# ===========================================================================
# 3. Composite payloads
# ===========================================================================
class TestDashboardPayload:
    def test_dashboard_shape(
        self,
        patient,
        doctor,
        department,
        procedure_type,
        administrator,
        doctor_user,
    ):
        appt = _make_appointment(
            patient, doctor, department, procedure_type, administrator,
        )
        treatment = create_treatment(
            appointment=appt,
            patient=patient,
            doctor=doctor,
            department=department,
            procedure_type=procedure_type,
            price=Decimal("100000.00"),
            created_by=doctor_user,
        )
        record_payment(
            treatment=treatment,
            amount=Decimal("100000.00"),
            method="cash",
            received_by=administrator,
        )
        payload = selectors.dashboard_payload("day")
        assert payload["period"] == "day"
        assert set(payload["kpi"].keys()) == {
            "revenue",
            "appointmentsTotal",
            "appointmentsCompleted",
            "newPatients",
            "lowStockCount",
        }
        assert Decimal(payload["kpi"]["revenue"]) == Decimal("100000.00")
        assert payload["kpi"]["newPatients"] >= 1
        assert isinstance(payload["revenueByDay"], list)
        assert isinstance(payload["topProcedures"], list)
        assert isinstance(payload["topDoctors"], list)


# ===========================================================================
# 4. Cache behaviour
# ===========================================================================
class TestReportCache:
    def test_dashboard_cached_after_first_call(self):
        first = services.get_dashboard("day")
        # Patch the selector so the second call would obviously differ
        # if it were recomputed — proving the cache handled it.
        with patch(
            "apps.reports.services.dashboard_payload",
            side_effect=AssertionError("should not be recomputed"),
        ):
            second = services.get_dashboard("day")
        assert first == second

    def test_invalidate_all_forces_recompute(self):
        # Prime the cache — the returned value is not used here; we only
        # want the cache warmed before invalidation.
        services.get_dashboard("day")
        services.invalidate_all()
        # After invalidation, a subsequent call must recompute (the
        # patch would raise if the cache still held the value).
        recomputed_flag: dict[str, bool] = {"called": False}
        real_fn = selectors.dashboard_payload

        def _spy(period):
            recomputed_flag["called"] = True
            return real_fn(period)

        with patch("apps.reports.services.dashboard_payload", side_effect=_spy):
            services.get_dashboard("day")
        assert recomputed_flag["called"] is True

    def test_invalid_period_rejected_at_service(self):
        with pytest.raises(ValueError):
            services.get_dashboard("year")


# ===========================================================================
# 5. HTTP + RBAC
# ===========================================================================
class TestReportsAPI:
    def test_unauthenticated_401(self, api_client):
        response = api_client.get("/api/v1/reports/dashboard/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_head_doctor_can_read_dashboard(self, api_client, head_doctor):
        _auth(api_client, head_doctor)
        response = api_client.get("/api/v1/reports/dashboard/?period=day")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["period"] == "day"
        assert "kpi" in response.data

    def test_doctor_forbidden(self, api_client, doctor_user):
        _auth(api_client, doctor_user)
        response = api_client.get("/api/v1/reports/dashboard/")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_administrator_forbidden(self, api_client, administrator):
        _auth(api_client, administrator)
        response = api_client.get("/api/v1/reports/revenue/")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_invalid_period_returns_400(self, api_client, head_doctor):
        _auth(api_client, head_doctor)
        response = api_client.get("/api/v1/reports/dashboard/?period=year")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "error" in response.data
        assert response.data["error"]["code"] == "VALIDATION_ERROR"

    def test_revenue_endpoint_ok(self, api_client, head_doctor):
        _auth(api_client, head_doctor)
        response = api_client.get("/api/v1/reports/revenue/?period=week")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["period"] == "week"
        assert "total" in response.data
        assert isinstance(response.data["byDay"], list)
        assert isinstance(response.data["byMethod"], list)

    def test_procedures_endpoint_with_limit(self, api_client, head_doctor):
        _auth(api_client, head_doctor)
        response = api_client.get(
            "/api/v1/reports/procedures/?period=month&limit=3"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["period"] == "month"
        assert isinstance(response.data["results"], list)
        assert len(response.data["results"]) <= 3

    def test_procedures_limit_out_of_range_rejected(self, api_client, head_doctor):
        _auth(api_client, head_doctor)
        response = api_client.get(
            "/api/v1/reports/procedures/?period=day&limit=999"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_departments_endpoint(self, api_client, head_doctor):
        _auth(api_client, head_doctor)
        response = api_client.get("/api/v1/reports/departments/?period=day")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["period"] == "day"
        assert isinstance(response.data["results"], list)


# ===========================================================================
# 6. Cache prime helper
# ===========================================================================
class TestPrimeCache:
    def test_prime_dashboard_covers_all_periods(self):
        payloads = services.prime_dashboard_cache()
        assert set(payloads.keys()) == {"day", "week", "month"}
        for period, payload in payloads.items():
            assert payload["period"] == period
