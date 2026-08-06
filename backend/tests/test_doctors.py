"""Tests for the ``doctors`` app (T8).

Covers PROJECT_BRIEF acceptance criteria:
    * #4 RBAC — bosh_shifokor writes; doctors edit only own schedule; admin read-only.
    * #6 CRUD — /doctors/ and /procedure-types/ endpoints.
    * doctors/{id}/available-slots/ — computed from WorkingHours minus TimeOff.
    * doctors/{id}/working-hours/ and /time-off/ nested endpoints.
"""
from __future__ import annotations

from datetime import date, time
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from apps.departments.services import create_department
from apps.doctors.models import (
    CommissionBasis,
    DoctorProfile,
    ProcedureType,
    TimeOff,
    WorkingHours,
)
from apps.doctors.services import (
    compute_available_slots,
    create_doctor_profile,
    create_procedure_type,
    create_time_off,
    create_working_hours,
    update_doctor_profile,
)

pytestmark = pytest.mark.django_db

User = get_user_model()


# ---------------------------------------------------------------------------
# Fixtures
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
def doctor_user():
    return User.objects.create_user(
        phone_number="+998900000002",
        password="StrongPass!123",
        first_name="Doc",
        last_name="Tor",
        role=User.Role.DOCTOR,
    )


@pytest.fixture
def other_doctor_user():
    return User.objects.create_user(
        phone_number="+998900000004",
        password="StrongPass!123",
        first_name="Other",
        last_name="Doc",
        role=User.Role.DOCTOR,
    )


@pytest.fixture
def administrator():
    return User.objects.create_user(
        phone_number="+998900000003",
        password="StrongPass!123",
        first_name="Adm",
        last_name="In",
        role=User.Role.ADMINISTRATOR,
    )


@pytest.fixture
def department(head_doctor):
    return create_department(name="Terapiya", created_by=head_doctor)


@pytest.fixture
def other_department(head_doctor):
    return create_department(name="Ortopediya", created_by=head_doctor)


@pytest.fixture
def doctor_profile(doctor_user, department):
    return create_doctor_profile(
        user=doctor_user,
        department_ids=[str(department.id)],
        specialization="Terapevt",
        commission_basis=CommissionBasis.FROM_TOTAL,
        default_commission_rate=Decimal("40.00"),
    )


@pytest.fixture
def other_doctor_profile(other_doctor_user, department):
    return create_doctor_profile(
        user=other_doctor_user,
        department_ids=[str(department.id)],
        specialization="Ortopediya",
    )


@pytest.fixture
def api_client():
    return APIClient()


def _auth(client: APIClient, user) -> APIClient:
    client.force_authenticate(user=user)
    return client


# ===========================================================================
# Service layer
# ===========================================================================
def test_create_doctor_profile_service(doctor_user, department):
    profile = create_doctor_profile(
        user=doctor_user,
        department_ids=[str(department.id)],
        specialization="Terapevt",
        default_commission_rate=Decimal("35.00"),
    )
    assert profile.pk is not None
    assert profile.user_id == doctor_user.pk
    assert profile.specialization == "Terapevt"
    assert profile.default_commission_rate == Decimal("35.00")
    assert list(profile.departments.values_list("pk", flat=True)) == [department.pk]


def test_create_doctor_profile_rejects_non_medical_user(administrator, department):
    from django.core.exceptions import ValidationError

    with pytest.raises(ValidationError):
        create_doctor_profile(
            user=administrator,
            department_ids=[str(department.id)],
        )


def test_create_doctor_profile_rejects_duplicate(doctor_user, department):
    from django.core.exceptions import ValidationError

    create_doctor_profile(user=doctor_user, department_ids=[str(department.id)])
    with pytest.raises(ValidationError):
        create_doctor_profile(user=doctor_user)


def test_update_doctor_profile_partial(doctor_profile):
    updated = update_doctor_profile(
        doctor_profile,
        specialization="Endodontist",
        default_commission_rate=Decimal("50.00"),
    )
    assert updated.specialization == "Endodontist"
    assert updated.default_commission_rate == Decimal("50.00")


def test_working_hours_service(doctor_profile):
    wh = create_working_hours(
        doctor=doctor_profile, weekday=0, start_time="09:00", end_time="13:00"
    )
    assert wh.pk is not None
    assert wh.start_time == time(9, 0)
    assert wh.end_time == time(13, 0)


def test_working_hours_rejects_overlap(doctor_profile):
    from django.core.exceptions import ValidationError

    create_working_hours(
        doctor=doctor_profile, weekday=0, start_time="09:00", end_time="13:00"
    )
    with pytest.raises(ValidationError):
        create_working_hours(
            doctor=doctor_profile, weekday=0, start_time="12:00", end_time="15:00"
        )


def test_working_hours_rejects_bad_range(doctor_profile):
    from django.core.exceptions import ValidationError

    with pytest.raises(ValidationError):
        create_working_hours(
            doctor=doctor_profile, weekday=0, start_time="15:00", end_time="09:00"
        )


def test_time_off_service(doctor_profile):
    entry = create_time_off(
        doctor=doctor_profile,
        date_start="2026-08-01",
        date_end="2026-08-05",
        reason="Ta'til",
    )
    assert entry.pk is not None
    assert entry.date_start == date(2026, 8, 1)
    assert entry.date_end == date(2026, 8, 5)


def test_time_off_rejects_overlap(doctor_profile):
    from django.core.exceptions import ValidationError

    create_time_off(
        doctor=doctor_profile, date_start="2026-08-01", date_end="2026-08-05"
    )
    with pytest.raises(ValidationError):
        create_time_off(
            doctor=doctor_profile, date_start="2026-08-04", date_end="2026-08-10"
        )


def test_time_off_rejects_reverse_range(doctor_profile):
    from django.core.exceptions import ValidationError

    with pytest.raises(ValidationError):
        create_time_off(
            doctor=doctor_profile, date_start="2026-08-10", date_end="2026-08-01"
        )


def test_procedure_type_service(department):
    pt = create_procedure_type(
        name="  Plombalash  ",
        department=department,
        default_duration_minutes=45,
        default_price=Decimal("200000.00"),
        commission_rate_override=Decimal("25.00"),
    )
    assert pt.name == "Plombalash"
    assert pt.default_duration_minutes == 45
    assert pt.commission_rate_override == Decimal("25.00")


def test_procedure_type_rejects_duplicate_in_department(department):
    from django.core.exceptions import ValidationError

    create_procedure_type(name="Plombalash", department=department)
    with pytest.raises(ValidationError):
        create_procedure_type(name="plombalash", department=department)


# ===========================================================================
# Available slots
# ===========================================================================
def test_available_slots_from_working_hours(doctor_profile):
    # Monday 2026-07-06
    day = date(2026, 7, 6)
    assert day.weekday() == 0
    create_working_hours(
        doctor=doctor_profile, weekday=0, start_time="09:00", end_time="11:00"
    )
    slots = compute_available_slots(doctor_profile, day=day, slot_minutes=30)
    assert len(slots) == 4
    assert slots[0]["start"].endswith("09:00:00")
    assert slots[-1]["end"].endswith("11:00:00")


def test_available_slots_skips_time_off(doctor_profile):
    day = date(2026, 7, 6)
    create_working_hours(
        doctor=doctor_profile, weekday=0, start_time="09:00", end_time="11:00"
    )
    create_time_off(
        doctor=doctor_profile, date_start=day, date_end=day, reason="Ta'til"
    )
    slots = compute_available_slots(doctor_profile, day=day, slot_minutes=30)
    assert slots == []


def test_available_slots_multiple_shifts(doctor_profile):
    day = date(2026, 7, 6)
    create_working_hours(
        doctor=doctor_profile, weekday=0, start_time="09:00", end_time="10:00"
    )
    create_working_hours(
        doctor=doctor_profile, weekday=0, start_time="15:00", end_time="16:00"
    )
    slots = compute_available_slots(doctor_profile, day=day, slot_minutes=30)
    # 2 slots per hour × 2 shifts = 4
    assert len(slots) == 4


# ===========================================================================
# HTTP: /doctors/ list + create RBAC
# ===========================================================================
DOCTORS_URL = "/api/v1/doctors/"
PROCEDURES_URL = "/api/v1/procedure-types/"


def test_list_doctors_requires_authentication(api_client, doctor_profile):
    response = api_client.get(DOCTORS_URL)
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


def test_list_doctors_pagination_envelope(api_client, head_doctor, doctor_profile):
    _auth(api_client, head_doctor)
    response = api_client.get(DOCTORS_URL)
    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert set(body.keys()) == {"count", "next", "previous", "results"}
    assert body["count"] == 1
    entry = body["results"][0]
    assert entry["user"]["phoneNumber"] == "+998900000002"
    assert entry["defaultCommissionRate"] == "40.00"
    assert entry["departments"][0]["name"] == "Terapiya"


def test_create_doctor_by_bosh_shifokor(
    api_client, head_doctor, department
):
    _auth(api_client, head_doctor)
    payload = {
        "user": {
            "phoneNumber": "+998900000099",
            "firstName": "Yangi",
            "lastName": "Shifokor",
            "password": "StrongPass!123",
            "role": User.Role.DOCTOR,
        },
        "departmentIds": [str(department.id)],
        "specialization": "Xirurg",
        "commissionBasis": CommissionBasis.FROM_NET,
        "defaultCommissionRate": "45.00",
    }
    response = api_client.post(DOCTORS_URL, data=payload, format="json")
    assert response.status_code == status.HTTP_201_CREATED, response.content
    body = response.json()
    assert body["specialization"] == "Xirurg"
    assert body["commissionBasis"] == CommissionBasis.FROM_NET
    assert User.objects.filter(phone_number="+998900000099").exists()
    assert DoctorProfile.objects.filter(user__phone_number="+998900000099").exists()


def test_create_doctor_forbidden_for_doctor(api_client, doctor_user, department):
    _auth(api_client, doctor_user)
    response = api_client.post(
        DOCTORS_URL,
        data={
            "user": {
                "phoneNumber": "+998900000091",
                "firstName": "X",
                "lastName": "Y",
                "password": "StrongPass!123",
                "role": User.Role.DOCTOR,
            },
            "departmentIds": [str(department.id)],
        },
        format="json",
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_create_doctor_forbidden_for_administrator(
    api_client, administrator, department
):
    _auth(api_client, administrator)
    response = api_client.post(DOCTORS_URL, data={}, format="json")
    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_retrieve_doctor_by_administrator(api_client, administrator, doctor_profile):
    _auth(api_client, administrator)
    response = api_client.get(f"{DOCTORS_URL}{doctor_profile.id}/")
    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert body["id"] == str(doctor_profile.id)


def test_patch_doctor_as_bosh_shifokor(api_client, head_doctor, doctor_profile):
    _auth(api_client, head_doctor)
    response = api_client.patch(
        f"{DOCTORS_URL}{doctor_profile.id}/",
        data={"specialization": "Endodontist"},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["specialization"] == "Endodontist"


def test_delete_doctor_soft_deletes(api_client, head_doctor, doctor_profile):
    _auth(api_client, head_doctor)
    response = api_client.delete(f"{DOCTORS_URL}{doctor_profile.id}/")
    assert response.status_code == status.HTTP_204_NO_CONTENT
    doctor_profile.refresh_from_db()
    assert doctor_profile.is_active is False


# ===========================================================================
# HTTP: nested /working-hours/
# ===========================================================================
def test_list_working_hours(api_client, head_doctor, doctor_profile):
    create_working_hours(
        doctor=doctor_profile, weekday=0, start_time="09:00", end_time="13:00"
    )
    _auth(api_client, head_doctor)
    response = api_client.get(f"{DOCTORS_URL}{doctor_profile.id}/working-hours/")
    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert isinstance(body, list)
    assert len(body) == 1
    assert body[0]["startTime"] == "09:00"


def test_create_working_hours_by_owner(api_client, doctor_user, doctor_profile):
    _auth(api_client, doctor_user)
    response = api_client.post(
        f"{DOCTORS_URL}{doctor_profile.id}/working-hours/",
        data={"weekday": 1, "start_time": "10:00", "end_time": "14:00"},
        format="json",
    )
    assert response.status_code == status.HTTP_201_CREATED, response.content
    assert WorkingHours.objects.filter(doctor=doctor_profile, weekday=1).exists()


def test_create_working_hours_forbidden_for_other_doctor(
    api_client, other_doctor_user, doctor_profile
):
    _auth(api_client, other_doctor_user)
    response = api_client.post(
        f"{DOCTORS_URL}{doctor_profile.id}/working-hours/",
        data={"weekday": 1, "start_time": "10:00", "end_time": "14:00"},
        format="json",
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_create_working_hours_forbidden_for_administrator(
    api_client, administrator, doctor_profile
):
    _auth(api_client, administrator)
    response = api_client.post(
        f"{DOCTORS_URL}{doctor_profile.id}/working-hours/",
        data={"weekday": 1, "start_time": "10:00", "end_time": "14:00"},
        format="json",
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_delete_working_hours(api_client, head_doctor, doctor_profile):
    wh = create_working_hours(
        doctor=doctor_profile, weekday=0, start_time="09:00", end_time="13:00"
    )
    _auth(api_client, head_doctor)
    response = api_client.delete(
        f"{DOCTORS_URL}{doctor_profile.id}/working-hours/{wh.id}/"
    )
    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert not WorkingHours.objects.filter(pk=wh.pk).exists()


# ===========================================================================
# HTTP: /time-off/
# ===========================================================================
def test_time_off_crud(api_client, head_doctor, doctor_profile):
    _auth(api_client, head_doctor)
    response = api_client.post(
        f"{DOCTORS_URL}{doctor_profile.id}/time-off/",
        data={
            "dateStart": "2026-08-01",
            "dateEnd": "2026-08-05",
            "reason": "Ta'til",
        },
        format="json",
    )
    assert response.status_code == status.HTTP_201_CREATED, response.content
    entry_id = response.json()["id"]

    listing = api_client.get(f"{DOCTORS_URL}{doctor_profile.id}/time-off/")
    assert listing.status_code == status.HTTP_200_OK
    assert len(listing.json()) == 1

    delete = api_client.delete(
        f"{DOCTORS_URL}{doctor_profile.id}/time-off/{entry_id}/"
    )
    assert delete.status_code == status.HTTP_204_NO_CONTENT
    assert not TimeOff.objects.filter(pk=entry_id).exists()


# ===========================================================================
# HTTP: /available-slots/
# ===========================================================================
def test_available_slots_endpoint(api_client, head_doctor, doctor_profile):
    create_working_hours(
        doctor=doctor_profile, weekday=0, start_time="09:00", end_time="11:00"
    )
    _auth(api_client, head_doctor)
    response = api_client.get(
        f"{DOCTORS_URL}{doctor_profile.id}/available-slots/?date=2026-07-06"
    )
    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert body["date"] == "2026-07-06"
    assert body["doctorId"] == str(doctor_profile.id)
    assert len(body["slots"]) == 4


def test_available_slots_requires_date(api_client, head_doctor, doctor_profile):
    _auth(api_client, head_doctor)
    response = api_client.get(f"{DOCTORS_URL}{doctor_profile.id}/available-slots/")
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"


def test_available_slots_rejects_bad_date(api_client, head_doctor, doctor_profile):
    _auth(api_client, head_doctor)
    response = api_client.get(
        f"{DOCTORS_URL}{doctor_profile.id}/available-slots/?date=not-a-date"
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST


def test_available_slots_empty_on_time_off_day(
    api_client, head_doctor, doctor_profile
):
    create_working_hours(
        doctor=doctor_profile, weekday=0, start_time="09:00", end_time="11:00"
    )
    create_time_off(
        doctor=doctor_profile,
        date_start=date(2026, 7, 6),
        date_end=date(2026, 7, 6),
    )
    _auth(api_client, head_doctor)
    response = api_client.get(
        f"{DOCTORS_URL}{doctor_profile.id}/available-slots/?date=2026-07-06"
    )
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["slots"] == []


# ===========================================================================
# HTTP: /procedure-types/
# ===========================================================================
def test_procedure_types_crud(api_client, head_doctor, department):
    _auth(api_client, head_doctor)

    # Create
    response = api_client.post(
        PROCEDURES_URL,
        data={
            "name": "Plombalash",
            "departmentId": str(department.id),
            "defaultDurationMinutes": 45,
            "defaultPrice": "200000.00",
            "commissionRateOverride": "25.00",
        },
        format="json",
    )
    assert response.status_code == status.HTTP_201_CREATED, response.content
    body = response.json()
    assert body["name"] == "Plombalash"
    assert body["defaultDurationMinutes"] == 45
    assert body["defaultPrice"] == "200000.00"
    assert body["commissionRateOverride"] == "25.00"
    pt_id = body["id"]

    # List with department filter
    listing = api_client.get(f"{PROCEDURES_URL}?department={department.id}")
    assert listing.status_code == status.HTTP_200_OK
    assert listing.json()["count"] == 1

    # PATCH
    patch = api_client.patch(
        f"{PROCEDURES_URL}{pt_id}/",
        data={"defaultPrice": "220000.00"},
        format="json",
    )
    assert patch.status_code == status.HTTP_200_OK
    assert patch.json()["defaultPrice"] == "220000.00"

    # Soft delete
    delete = api_client.delete(f"{PROCEDURES_URL}{pt_id}/")
    assert delete.status_code == status.HTTP_204_NO_CONTENT
    assert ProcedureType.objects.filter(pk=pt_id, is_active=False).exists()


def test_procedure_types_readable_by_all_roles(
    api_client, head_doctor, doctor_user, administrator, department
):
    create_procedure_type(name="Plombalash", department=department)
    for user in (head_doctor, doctor_user, administrator):
        api_client.force_authenticate(user=user)
        response = api_client.get(PROCEDURES_URL)
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["count"] == 1


def test_procedure_types_write_forbidden_for_doctor(
    api_client, doctor_user, department
):
    _auth(api_client, doctor_user)
    response = api_client.post(
        PROCEDURES_URL,
        data={"name": "Nope", "departmentId": str(department.id)},
        format="json",
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_procedure_types_write_forbidden_for_administrator(
    api_client, administrator, department
):
    _auth(api_client, administrator)
    response = api_client.post(
        PROCEDURES_URL,
        data={"name": "Nope", "departmentId": str(department.id)},
        format="json",
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN
