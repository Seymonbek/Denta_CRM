"""T129 — Idempotency-Key tests for POST /api/v1/payments/.

Scenarios covered:

* Same key + same body → cached response, no duplicate payment row.
* Same key + different body → 409 Conflict.
* No key header → normal create (backwards compatible).
* Different users with the same key are isolated.
* Non-2xx responses are NOT cached (retrying a validation failure
  should re-hit the endpoint, not persist the failure).
"""
from __future__ import annotations

from datetime import datetime, time, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.core.idempotency import IDEMPOTENCY_HEADER
from apps.departments.models import Department
from apps.doctors.models import CommissionBasis, DoctorProfile, ProcedureType
from apps.patients.services import create_patient
from apps.payments.models import Payment, PaymentMethod
from apps.scheduling.services import create_appointment
from apps.treatments.services import create_treatment

pytestmark = pytest.mark.django_db

User = get_user_model()

PAYMENTS_URL = "/api/v1/payments/"


# ---------------------------------------------------------------------------
# Fixtures — minimal environment to POST a payment
# ---------------------------------------------------------------------------
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
def patient(head_doctor):
    return create_patient(
        first_name="Ali",
        last_name="Valiyev",
        phone_number="+998901111111",
        created_by=head_doctor,
    )


@pytest.fixture
def treatment(doctor, patient, department, procedure_type, head_doctor):
    return create_treatment(
        doctor=doctor,
        patient=patient,
        department=department,
        procedure_type=procedure_type,
        diagnosis="Karies",
        description="Test",
        created_by=head_doctor,
    )


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture(autouse=True)
def _reset_cache():
    """Clear the idempotency cache between tests to avoid cross-talk."""
    cache.clear()
    yield
    cache.clear()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
def _body(treatment) -> dict:
    return {
        "treatment": str(treatment.pk),
        "amount": "50000.00",
        "method": PaymentMethod.CASH,
        "note": "Payment 1",
    }


def test_idempotent_replay_same_key_same_body(api_client, head_doctor, treatment):
    """Same key + same body → replayed response, single DB row."""
    api_client.force_authenticate(user=head_doctor)
    body = _body(treatment)

    r1 = api_client.post(
        PAYMENTS_URL, body, format="json", HTTP_IDEMPOTENCY_KEY="idem-abc-001"
    )
    assert r1.status_code == status.HTTP_201_CREATED, r1.content
    first_id = r1.data["id"]
    assert r1.headers.get(IDEMPOTENCY_HEADER) == "idem-abc-001"

    r2 = api_client.post(
        PAYMENTS_URL, body, format="json", HTTP_IDEMPOTENCY_KEY="idem-abc-001"
    )
    assert r2.status_code == status.HTTP_201_CREATED, r2.content
    assert r2.data["id"] == first_id, "replay must return the same resource"
    # Only ONE row was created.
    assert Payment.objects.filter(treatment=treatment).count() == 1


def test_idempotent_conflict_same_key_different_body(api_client, head_doctor, treatment):
    """Same key + different body → 409 Conflict."""
    api_client.force_authenticate(user=head_doctor)
    body_a = _body(treatment)
    body_b = {**body_a, "amount": "10000.00"}

    r1 = api_client.post(
        PAYMENTS_URL, body_a, format="json", HTTP_IDEMPOTENCY_KEY="idem-clash"
    )
    assert r1.status_code == status.HTTP_201_CREATED, r1.content

    r2 = api_client.post(
        PAYMENTS_URL, body_b, format="json", HTTP_IDEMPOTENCY_KEY="idem-clash"
    )
    assert r2.status_code == status.HTTP_409_CONFLICT, r2.content
    payload = r2.data
    assert "error" in payload
    assert payload["error"]["code"] == "IDEMPOTENCY_CONFLICT"


def test_idempotent_missing_key_falls_through(api_client, head_doctor, treatment):
    """No Idempotency-Key header → normal create every time."""
    api_client.force_authenticate(user=head_doctor)
    body = _body(treatment)

    r1 = api_client.post(PAYMENTS_URL, body, format="json")
    r2 = api_client.post(PAYMENTS_URL, body, format="json")
    assert r1.status_code == status.HTTP_201_CREATED
    assert r2.status_code == status.HTTP_201_CREATED
    assert r1.data["id"] != r2.data["id"], "no key → no dedup, two rows"
    # No idempotency header on the response.
    assert IDEMPOTENCY_HEADER not in r1.headers


def test_idempotent_isolation_across_users(api_client, head_doctor, administrator, treatment):
    """Same key sent by two users must NOT collide."""
    body = _body(treatment)

    # User A
    api_client.force_authenticate(user=head_doctor)
    r_a = api_client.post(
        PAYMENTS_URL, body, format="json", HTTP_IDEMPOTENCY_KEY="shared-key"
    )
    assert r_a.status_code == status.HTTP_201_CREATED

    # User B — different user, same key. Should create a NEW payment,
    # not return user A's cached response.
    api_client.force_authenticate(user=administrator)
    r_b = api_client.post(
        PAYMENTS_URL, body, format="json", HTTP_IDEMPOTENCY_KEY="shared-key"
    )
    assert r_b.status_code == status.HTTP_201_CREATED
    assert r_b.data["id"] != r_a.data["id"]


def test_idempotent_failed_response_not_cached(api_client, head_doctor, treatment):
    """A validation error (400) MUST NOT be cached — retry retries."""
    api_client.force_authenticate(user=head_doctor)
    bad_body = {"treatment": str(treatment.pk), "amount": "-5.00", "method": "cash"}

    r1 = api_client.post(
        PAYMENTS_URL, bad_body, format="json", HTTP_IDEMPOTENCY_KEY="bad-key"
    )
    assert r1.status_code >= 400

    # Same key + valid body must NOT be blocked by the earlier failure.
    r2 = api_client.post(
        PAYMENTS_URL, _body(treatment), format="json", HTTP_IDEMPOTENCY_KEY="bad-key"
    )
    assert r2.status_code == status.HTTP_201_CREATED, r2.content


def test_idempotent_malformed_key_ignored(api_client, head_doctor, treatment):
    """A key with control characters is silently ignored (falls through
    to normal create).
    """
    api_client.force_authenticate(user=head_doctor)
    body = _body(treatment)

    r1 = api_client.post(
        PAYMENTS_URL, body, format="json", HTTP_IDEMPOTENCY_KEY="evil\nkey"
    )
    r2 = api_client.post(
        PAYMENTS_URL, body, format="json", HTTP_IDEMPOTENCY_KEY="evil\nkey"
    )
    assert r1.status_code == status.HTTP_201_CREATED
    assert r2.status_code == status.HTTP_201_CREATED
    assert r1.data["id"] != r2.data["id"]
