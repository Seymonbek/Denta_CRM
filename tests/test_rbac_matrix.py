"""Consolidated RBAC negative-matrix test (plan task 112 / criterion #4).

The PROJECT_BRIEF § "RBAC" table specifies which roles may perform which
write actions. Most cells are already covered by per-app tests, but the
plan calls for a single parametrised sweep so a reviewer can verify the
whole matrix against a single file.

Each row in :data:`_RBAC_MATRIX` is a triple ``(cell_id, denied_role,
call)`` where ``call`` is a function that fires the request and returns
the ``rest_framework.response.Response`` object. Every call must return
:pyclass:`rest_framework.status.HTTP_403_FORBIDDEN` for the denied role,
proving the endpoint rejects the caller *before* accepting business
data.

Cross-references to the pre-existing per-app tests are provided in the
matrix docstrings so we don't duplicate assertions that already exist.

Coverage in this file
---------------------
* POST /api/v1/departments/         — denied: doctor, administrator
    (also verified by tests/test_departments.py:test_create_forbidden_*)
* POST /api/v1/doctors/             — denied: doctor, administrator
    (also verified by tests/test_doctors.py:test_create_doctor_forbidden_*)
* POST /api/v1/treatments/          — denied: administrator
    (also verified by tests/test_treatments.py — the administrator can
    only reach it via a specialised "read appointment then attach
    payment" route; direct writes are always 403)
* GET  /api/v1/reports/dashboard/   — denied: doctor, administrator
    (also verified by tests/test_reports.py:TestDashboardView.test_*)
"""
from __future__ import annotations

from datetime import datetime, time, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db

User = get_user_model()


# ---------------------------------------------------------------------------
# Users — one per role so the parametric matrix can pick any of them.
# ---------------------------------------------------------------------------
@pytest.fixture
def head_doctor() -> User:
    return User.objects.create_user(
        phone_number="+998900000901",
        password="RbacPass!123",
        first_name="Bosh",
        last_name="Shifokor",
        role=User.Role.BOSH_SHIFOKOR,
    )


@pytest.fixture
def doctor_user() -> User:
    return User.objects.create_user(
        phone_number="+998900000902",
        password="RbacPass!123",
        first_name="Doc",
        last_name="Tor",
        role=User.Role.DOCTOR,
    )


@pytest.fixture
def administrator_user() -> User:
    return User.objects.create_user(
        phone_number="+998900000903",
        password="RbacPass!123",
        first_name="Adm",
        last_name="In",
        role=User.Role.ADMINISTRATOR,
    )


# ---------------------------------------------------------------------------
# Business-object fixtures used by the treatment write test.
# ---------------------------------------------------------------------------
@pytest.fixture
def department(head_doctor):
    from apps.departments.services import create_department

    return create_department(
        name="Terapiya (RBAC)",
        description="RBAC matrix test",
        created_by=head_doctor,
    )


@pytest.fixture
def doctor_profile(head_doctor, department):
    """A ``DoctorProfile`` linked to a real doctor user (for the treatment
    body). We use :func:`apps.doctors.services.create_doctor_profile`
    directly with a freshly-created User to avoid coupling this file to
    any nested-serializer plumbing."""
    from apps.doctors.services import create_doctor_profile

    owner_user = User.objects.create_user(
        phone_number="+998900000904",
        password="OwnerPass!123",
        first_name="Owner",
        last_name="Doctor",
        role=User.Role.DOCTOR,
    )
    return create_doctor_profile(
        user=owner_user,
        department_ids=[str(department.pk)],
        specialization="Terapevt",
        commission_basis="from_total",
        default_commission_rate=Decimal("30.00"),
    )


@pytest.fixture
def patient(head_doctor):
    from apps.patients.services import create_patient

    return create_patient(
        first_name="Ali",
        last_name="Valiyev",
        phone_number="+998901112233",
        gender="male",
        created_by=head_doctor,
    )


@pytest.fixture
def appointment(head_doctor, doctor_profile, department, patient):
    """Booked appointment we can attach a treatment to."""
    from apps.scheduling.services import create_appointment

    start = timezone.make_aware(
        datetime.combine(
            timezone.localdate() + timedelta(days=1), time(10, 0)
        ),
        timezone.get_current_timezone(),
    )
    return create_appointment(
        patient=patient,
        doctor=doctor_profile,
        department=department,
        scheduled_start=start,
        scheduled_end=start + timedelta(minutes=30),
        notes="RBAC matrix appointment",
        created_by=head_doctor,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _client_for(user) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    return client


# ---------------------------------------------------------------------------
# Matrix
# ---------------------------------------------------------------------------
# Each row: (cell_id, denied_role, request_builder). The request_builder
# takes no arguments and returns a callable (client -> response) so the
# path/body is computed lazily against fixtures.
#
# ``denied_role`` is one of the three role literals, matching
# ``User.Role`` values.
RBAC_CELLS = [
    # -- POST /departments/ -------------------------------------------------
    ("POST /departments/", "doctor"),
    ("POST /departments/", "administrator"),
    # -- POST /doctors/ -----------------------------------------------------
    ("POST /doctors/", "doctor"),
    ("POST /doctors/", "administrator"),
    # -- POST /treatments/ --------------------------------------------------
    ("POST /treatments/", "administrator"),
    # -- GET  /reports/dashboard/ -------------------------------------------
    ("GET /reports/dashboard/", "doctor"),
    ("GET /reports/dashboard/", "administrator"),
]


@pytest.mark.parametrize("cell_id, denied_role", RBAC_CELLS)
def test_rbac_matrix_denies_role(
    cell_id: str,
    denied_role: str,
    request,
) -> None:
    """Assert 403 for every explicit RBAC-denial cell in the brief.

    We resolve fixtures lazily via ``request.getfixturevalue`` because
    not every matrix cell needs the full business chain (departments &
    doctors are simple; treatments needs an appointment; reports needs
    nothing).
    """
    # 1. Pick the calling user matching the denied role.
    role_to_fixture = {
        "doctor": "doctor_user",
        "administrator": "administrator_user",
    }
    user = request.getfixturevalue(role_to_fixture[denied_role])
    client = _client_for(user)

    # 2. Build the request per cell.
    if cell_id == "POST /departments/":
        response = client.post(
            "/api/v1/departments/",
            data={"name": "Attempt", "description": "Should be denied."},
            format="json",
        )
    elif cell_id == "POST /doctors/":
        response = client.post(
            "/api/v1/doctors/",
            data={
                "user": {
                    "phoneNumber": "+998900000999",
                    "firstName": "Nope",
                    "lastName": "Nope",
                    "role": "doctor",
                    "password": "NopePass!123",
                },
                "departmentIds": [],
                "specialization": "Nope",
                "commissionBasis": "from_total",
                "defaultCommissionRate": "10.00",
            },
            format="json",
        )
    elif cell_id == "POST /treatments/":
        # Materialise the chain: department → doctor_profile → patient
        # → appointment. The administrator MUST be denied even with a
        # completely valid body.
        appointment = request.getfixturevalue("appointment")
        response = client.post(
            "/api/v1/treatments/",
            data={
                "appointmentId": str(appointment.pk),
                "patientId": str(appointment.patient_id),
                "doctorId": str(appointment.doctor_id),
                "departmentId": str(appointment.department_id),
                "diagnosis": "Karies",
                "description": "Attempt by administrator",
                "price": "100000.00",
                "stage": "in_progress",
            },
            format="json",
        )
    elif cell_id == "GET /reports/dashboard/":
        response = client.get("/api/v1/reports/dashboard/")
    else:
        pytest.fail(f"Unknown RBAC cell {cell_id!r}")

    assert response.status_code == status.HTTP_403_FORBIDDEN, (
        f"Cell {cell_id!r} for role {denied_role!r} returned "
        f"{response.status_code} instead of 403. Body: {response.content!r}"
    )


# ---------------------------------------------------------------------------
# Positive sanity — the allowed role reaches success (or 201/200/400)
# ---------------------------------------------------------------------------
def test_rbac_matrix_head_doctor_reaches_business_layer(
    head_doctor,
    department,
    doctor_profile,
    appointment,
) -> None:
    """The head doctor is NOT rejected at the permission layer for every
    cell in :data:`RBAC_CELLS`. This is the positive counterpart to the
    denial matrix — if a regression accidentally denies ``bosh_shifokor``
    we would catch it here.

    We only assert the status code is *not* 401/403; the specific happy
    path (201 / 200) is exercised by per-app tests.
    """
    client = _client_for(head_doctor)
    forbidden = {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN}

    # POST /departments/ — 201 or 400 (dup) but never 403.
    r = client.post(
        "/api/v1/departments/",
        data={"name": "Head-Positive-Dept", "description": "ok"},
        format="json",
    )
    assert r.status_code not in forbidden, r.content

    # POST /doctors/ — 201 or 400 (dup phone) but never 403.
    r = client.post(
        "/api/v1/doctors/",
        data={
            "user": {
                "phoneNumber": "+998900001001",
                "firstName": "Head",
                "lastName": "Positive",
                "role": "doctor",
                "password": "HeadPos!123",
            },
            "departmentIds": [str(department.pk)],
            "specialization": "Terapevt",
            "commissionBasis": "from_total",
            "defaultCommissionRate": "20.00",
        },
        format="json",
    )
    assert r.status_code not in forbidden, r.content

    # POST /treatments/ — head doctor is always allowed.
    r = client.post(
        "/api/v1/treatments/",
        data={
            "appointmentId": str(appointment.pk),
            "patientId": str(appointment.patient_id),
            "doctorId": str(appointment.doctor_id),
            "departmentId": str(appointment.department_id),
            "diagnosis": "Karies",
            "description": "Positive path",
            "price": "100000.00",
            "stage": "in_progress",
        },
        format="json",
    )
    assert r.status_code not in forbidden, r.content

    # GET /reports/dashboard/ — head doctor is always allowed.
    r = client.get("/api/v1/reports/dashboard/")
    assert r.status_code not in forbidden, r.content
