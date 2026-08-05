"""Tests for the ``scheduling`` app (T10).

Covers PROJECT_BRIEF acceptance criteria:

* #4 RBAC — bosh_shifokor & administrator write; doctor read own +
  narrow status update.
* #5 Double-booking protection — enforced at the service layer
  (application-level; the postgres exclusion constraint is a defence
  in depth, not exercised on SQLite in tests).
* #6 CRUD — list, create, retrieve, update, cancel endpoints.
* Standard error envelope + pagination envelope.
* Filters — ``?doctor=&status=&date_from=&date_to=``.
* Cross-app: available-slots on the doctors app subtracts appointments
  once the scheduling app is installed.
"""
from __future__ import annotations

from datetime import datetime, time, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.departments.models import Department
from apps.doctors.models import (
    CommissionBasis,
    DoctorProfile,
    ProcedureType,
    TimeOff,
    WorkingHours,
)
from apps.patients.services import create_patient
from apps.scheduling.models import Appointment, AppointmentStatus
from apps.scheduling.selectors import (
    appointments_due_for_reminder_1day,
    appointments_due_for_reminder_2hour,
    appointments_in_range,
    booked_ranges_for_doctor_on_day,
    has_overlap,
)
from apps.scheduling.services import (
    cancel_appointment,
    create_appointment,
    mark_reminder_sent,
    update_appointment,
)

pytestmark = pytest.mark.django_db

User = get_user_model()

LIST_URL = "/api/v1/appointments/"


# ===========================================================================
# Fixtures
# ===========================================================================
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
def other_doctor_user():
    return User.objects.create_user(
        phone_number="+998900000004",
        password="StrongPass!123",
        first_name="Other",
        last_name="Doc",
        role=User.Role.DOCTOR,
    )


@pytest.fixture
def department(head_doctor):
    return Department.objects.create(
        name="Terapiya", description="Test", created_by=head_doctor
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
    # 09:00–18:00 every weekday.
    for weekday in range(7):
        WorkingHours.objects.create(
            doctor=profile,
            weekday=weekday,
            start_time=time(9, 0),
            end_time=time(18, 0),
        )
    return profile


@pytest.fixture
def other_doctor(other_doctor_user, department):
    profile = DoctorProfile.objects.create(
        user=other_doctor_user,
        specialization="Boshqa",
        commission_basis=CommissionBasis.FROM_TOTAL,
        default_commission_rate=Decimal("30.00"),
    )
    profile.departments.add(department)
    for weekday in range(7):
        WorkingHours.objects.create(
            doctor=profile,
            weekday=weekday,
            start_time=time(9, 0),
            end_time=time(18, 0),
        )
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
def patient(administrator):
    return create_patient(
        first_name="Ali",
        last_name="Valiyev",
        phone_number="+998901111111",
        created_by=administrator,
    )


@pytest.fixture
def another_patient(administrator):
    return create_patient(
        first_name="Bek",
        last_name="Karimov",
        phone_number="+998902222222",
        created_by=administrator,
    )


@pytest.fixture
def api_client():
    return APIClient()


def _auth(client: APIClient, user) -> APIClient:
    client.force_authenticate(user=user)
    return client


def _future_slot(*, days_ahead: int = 1, hour: int = 10, minutes: int = 30):
    """Return an aware (start, end) datetime tuple in Asia/Tashkent."""
    tz = timezone.get_current_timezone()
    start_date = (timezone.localdate() + timedelta(days=days_ahead))
    start = timezone.make_aware(
        datetime.combine(start_date, time(hour, 0)), tz
    )
    end = start + timedelta(minutes=minutes)
    return start, end


# ===========================================================================
# Service layer — happy path
# ===========================================================================
def test_create_appointment_happy_path(
    patient, doctor, department, procedure_type, administrator
):
    start, end = _future_slot(hour=10)
    appt = create_appointment(
        patient=patient,
        doctor=doctor,
        department=department,
        procedure_type=procedure_type,
        scheduled_start=start,
        scheduled_end=end,
        created_by=administrator,
    )
    assert appt.pk is not None
    assert appt.status == AppointmentStatus.SCHEDULED
    assert appt.scheduled_start == start
    assert appt.scheduled_end == end
    assert appt.duration_minutes == 30
    assert appt.is_blocking is True


def test_create_appointment_rejects_end_before_start(
    patient, doctor, department, administrator
):
    start, end = _future_slot()
    with pytest.raises(ValidationError):
        create_appointment(
            patient=patient,
            doctor=doctor,
            department=department,
            scheduled_start=end,  # swapped
            scheduled_end=start,
            created_by=administrator,
        )


def test_create_appointment_rejects_zero_duration(
    patient, doctor, department, administrator
):
    tz = timezone.get_current_timezone()
    start = timezone.make_aware(
        datetime.combine(
            timezone.localdate() + timedelta(days=1), time(10, 0)
        ),
        tz,
    )
    with pytest.raises(ValidationError):
        create_appointment(
            patient=patient,
            doctor=doctor,
            department=department,
            scheduled_start=start,
            scheduled_end=start,
            created_by=administrator,
        )


def test_create_appointment_rejects_procedure_from_other_department(
    patient, doctor, department, head_doctor, administrator
):
    other_department = Department.objects.create(
        name="Ortopediya", created_by=head_doctor
    )
    stray_procedure = ProcedureType.objects.create(
        name="Boshqa muolaja",
        department=other_department,
        default_duration_minutes=30,
    )
    start, end = _future_slot(hour=11)
    with pytest.raises(ValidationError):
        create_appointment(
            patient=patient,
            doctor=doctor,
            department=department,
            procedure_type=stray_procedure,
            scheduled_start=start,
            scheduled_end=end,
            created_by=administrator,
        )


def test_create_appointment_rejects_when_doctor_on_time_off(
    patient, doctor, department, administrator
):
    start, end = _future_slot(hour=10)
    TimeOff.objects.create(
        doctor=doctor,
        date_start=start.date(),
        date_end=start.date(),
        reason="Vacation",
    )
    with pytest.raises(ValidationError):
        create_appointment(
            patient=patient,
            doctor=doctor,
            department=department,
            scheduled_start=start,
            scheduled_end=end,
            created_by=administrator,
        )


# ===========================================================================
# Double-booking protection (application layer)
# ===========================================================================
def test_create_appointment_rejects_overlap_for_same_doctor(
    patient, another_patient, doctor, department, administrator
):
    start, end = _future_slot(hour=10, minutes=60)
    create_appointment(
        patient=patient,
        doctor=doctor,
        department=department,
        scheduled_start=start,
        scheduled_end=end,
        created_by=administrator,
    )
    # Fully-overlapping slot for a different patient:
    with pytest.raises(ValidationError):
        create_appointment(
            patient=another_patient,
            doctor=doctor,
            department=department,
            scheduled_start=start + timedelta(minutes=15),
            scheduled_end=end + timedelta(minutes=15),
            created_by=administrator,
        )


def test_create_appointment_allows_back_to_back_slots(
    patient, another_patient, doctor, department, administrator
):
    start, end = _future_slot(hour=10, minutes=30)
    create_appointment(
        patient=patient,
        doctor=doctor,
        department=department,
        scheduled_start=start,
        scheduled_end=end,
        created_by=administrator,
    )
    # end→end+30 is adjacent, not overlapping.
    appt2 = create_appointment(
        patient=another_patient,
        doctor=doctor,
        department=department,
        scheduled_start=end,
        scheduled_end=end + timedelta(minutes=30),
        created_by=administrator,
    )
    assert appt2.pk is not None


def test_create_appointment_allows_overlap_for_different_doctors(
    patient, another_patient, doctor, other_doctor, department, administrator
):
    start, end = _future_slot(hour=10)
    create_appointment(
        patient=patient,
        doctor=doctor,
        department=department,
        scheduled_start=start,
        scheduled_end=end,
        created_by=administrator,
    )
    # A different doctor can take the same slot.
    appt = create_appointment(
        patient=another_patient,
        doctor=other_doctor,
        department=department,
        scheduled_start=start,
        scheduled_end=end,
        created_by=administrator,
    )
    assert appt.pk is not None


def test_cancelled_appointment_frees_slot(
    patient, another_patient, doctor, department, administrator
):
    start, end = _future_slot(hour=10)
    first = create_appointment(
        patient=patient,
        doctor=doctor,
        department=department,
        scheduled_start=start,
        scheduled_end=end,
        created_by=administrator,
    )
    cancel_appointment(first, reason="patient requested")
    first.refresh_from_db()
    assert first.status == AppointmentStatus.CANCELLED
    # Slot is now free.
    replacement = create_appointment(
        patient=another_patient,
        doctor=doctor,
        department=department,
        scheduled_start=start,
        scheduled_end=end,
        created_by=administrator,
    )
    assert replacement.pk is not None


def test_patient_double_booking_rejected(
    patient, doctor, other_doctor, department, administrator
):
    start, end = _future_slot(hour=10)
    create_appointment(
        patient=patient,
        doctor=doctor,
        department=department,
        scheduled_start=start,
        scheduled_end=end,
        created_by=administrator,
    )
    # Same patient, another doctor, same time — reject.
    with pytest.raises(ValidationError):
        create_appointment(
            patient=patient,
            doctor=other_doctor,
            department=department,
            scheduled_start=start,
            scheduled_end=end,
            created_by=administrator,
        )


# ===========================================================================
# Update / status transitions
# ===========================================================================
def test_update_appointment_status_progresses(
    patient, doctor, department, administrator
):
    start, end = _future_slot(hour=10)
    appt = create_appointment(
        patient=patient,
        doctor=doctor,
        department=department,
        scheduled_start=start,
        scheduled_end=end,
        created_by=administrator,
    )
    update_appointment(appt, status=AppointmentStatus.CONFIRMED)
    appt.refresh_from_db()
    assert appt.status == AppointmentStatus.CONFIRMED

    update_appointment(appt, status=AppointmentStatus.IN_PROGRESS)
    appt.refresh_from_db()
    assert appt.status == AppointmentStatus.IN_PROGRESS

    update_appointment(appt, status=AppointmentStatus.COMPLETED)
    appt.refresh_from_db()
    assert appt.status == AppointmentStatus.COMPLETED


def test_update_appointment_rejects_invalid_transition(
    patient, doctor, department, administrator
):
    start, end = _future_slot(hour=10)
    appt = create_appointment(
        patient=patient,
        doctor=doctor,
        department=department,
        scheduled_start=start,
        scheduled_end=end,
        created_by=administrator,
    )
    update_appointment(appt, status=AppointmentStatus.COMPLETED)
    # Cannot un-complete.
    with pytest.raises(ValidationError):
        update_appointment(appt, status=AppointmentStatus.SCHEDULED)


def test_reschedule_appointment_resets_reminders(
    patient, doctor, department, administrator
):
    start, end = _future_slot(hour=10)
    appt = create_appointment(
        patient=patient,
        doctor=doctor,
        department=department,
        scheduled_start=start,
        scheduled_end=end,
        created_by=administrator,
    )
    mark_reminder_sent(appt, kind="1d")
    appt.refresh_from_db()
    assert appt.reminder_1d_sent is True

    new_start = start + timedelta(hours=2)
    new_end = end + timedelta(hours=2)
    update_appointment(
        appt, scheduled_start=new_start, scheduled_end=new_end
    )
    appt.refresh_from_db()
    assert appt.reminder_1d_sent is False


# ===========================================================================
# Selectors
# ===========================================================================
def test_booked_ranges_for_doctor_only_returns_blocking_statuses(
    patient, another_patient, doctor, department, administrator
):
    start, end = _future_slot(hour=10)
    a = create_appointment(
        patient=patient,
        doctor=doctor,
        department=department,
        scheduled_start=start,
        scheduled_end=end,
        created_by=administrator,
    )
    other_start = start + timedelta(hours=2)
    other_end = end + timedelta(hours=2)
    b = create_appointment(
        patient=another_patient,
        doctor=doctor,
        department=department,
        scheduled_start=other_start,
        scheduled_end=other_end,
        created_by=administrator,
    )
    cancel_appointment(b)

    ranges = booked_ranges_for_doctor_on_day(doctor, start.date())
    assert len(ranges) == 1
    assert ranges[0][0] == a.scheduled_start


def test_appointments_in_range_filters_dates(
    patient, doctor, department, administrator
):
    today = timezone.localdate()
    tz = timezone.get_current_timezone()
    for i, hour in enumerate([10, 12]):
        d = today + timedelta(days=i + 1)
        start = timezone.make_aware(datetime.combine(d, time(hour, 0)), tz)
        end = start + timedelta(minutes=30)
        create_appointment(
            patient=patient,
            doctor=doctor,
            department=department,
            scheduled_start=start,
            scheduled_end=end,
            created_by=administrator,
        )
    tomorrow = today + timedelta(days=1)
    qs = appointments_in_range(date_from=tomorrow, date_to=tomorrow)
    assert qs.count() == 1


def test_has_overlap_selector(patient, doctor, department, administrator):
    start, end = _future_slot(hour=10)
    create_appointment(
        patient=patient,
        doctor=doctor,
        department=department,
        scheduled_start=start,
        scheduled_end=end,
        created_by=administrator,
    )
    assert has_overlap(
        doctor=doctor,
        scheduled_start=start + timedelta(minutes=15),
        scheduled_end=end + timedelta(minutes=15),
    )
    assert not has_overlap(
        doctor=doctor,
        scheduled_start=end,
        scheduled_end=end + timedelta(minutes=30),
    )


# ===========================================================================
# Reminder selectors
# ===========================================================================
def test_reminder_1day_window(patient, doctor, department, administrator):
    now = timezone.now()
    start = now + timedelta(hours=24)
    end = start + timedelta(minutes=30)
    create_appointment(
        patient=patient,
        doctor=doctor,
        department=department,
        scheduled_start=start,
        scheduled_end=end,
        created_by=administrator,
    )
    due = appointments_due_for_reminder_1day(now=now)
    assert due.count() == 1

    # Once flagged, does not appear again.
    for appt in due:
        mark_reminder_sent(appt, kind="1d")
    assert appointments_due_for_reminder_1day(now=now).count() == 0


def test_reminder_2hour_window(patient, doctor, department, administrator):
    now = timezone.now()
    start = now + timedelta(hours=2)
    end = start + timedelta(minutes=30)
    create_appointment(
        patient=patient,
        doctor=doctor,
        department=department,
        scheduled_start=start,
        scheduled_end=end,
        created_by=administrator,
    )
    due = appointments_due_for_reminder_2hour(now=now)
    assert due.count() == 1


# ===========================================================================
# HTTP: authentication + envelope
# ===========================================================================
def test_list_requires_authentication(api_client):
    response = api_client.get(LIST_URL)
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.json()["error"]["code"] in {
        "NOT_AUTHENTICATED",
        "AUTHENTICATION_FAILED",
    }


def test_list_returns_pagination_envelope(
    api_client, administrator, patient, doctor, department
):
    start, end = _future_slot(hour=10)
    create_appointment(
        patient=patient,
        doctor=doctor,
        department=department,
        scheduled_start=start,
        scheduled_end=end,
        created_by=administrator,
    )
    _auth(api_client, administrator)
    response = api_client.get(LIST_URL)
    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert set(body.keys()) == {"count", "next", "previous", "results"}
    assert body["count"] == 1
    row = body["results"][0]
    assert {"id", "patientId", "doctorId", "departmentId",
            "scheduledStart", "scheduledEnd", "status"}.issubset(row.keys())


# ===========================================================================
# HTTP: create
# ===========================================================================
def test_create_via_api_administrator(
    api_client, administrator, patient, doctor, department, procedure_type
):
    _auth(api_client, administrator)
    start, end = _future_slot(hour=11)
    response = api_client.post(
        LIST_URL,
        {
            "patientId": str(patient.pk),
            "doctorId": str(doctor.pk),
            "departmentId": str(department.pk),
            "procedureTypeId": str(procedure_type.pk),
            "scheduledStart": start.isoformat(),
            "scheduledEnd": end.isoformat(),
            "notes": "Boshlanish tekshiruvi",
        },
        format="json",
    )
    assert response.status_code == status.HTTP_201_CREATED, response.json()
    body = response.json()
    assert body["patientId"] == str(patient.pk)
    assert body["doctorId"] == str(doctor.pk)
    assert body["status"] == "scheduled"
    # Sanity check: DB row exists.
    assert Appointment.objects.filter(pk=body["id"]).exists()


def test_create_via_api_head_doctor(
    api_client, head_doctor, patient, doctor, department
):
    _auth(api_client, head_doctor)
    start, end = _future_slot(hour=12)
    response = api_client.post(
        LIST_URL,
        {
            "patientId": str(patient.pk),
            "doctorId": str(doctor.pk),
            "departmentId": str(department.pk),
            "scheduledStart": start.isoformat(),
            "scheduledEnd": end.isoformat(),
        },
        format="json",
    )
    assert response.status_code == status.HTTP_201_CREATED, response.json()


def test_create_rejects_doctor_role(
    api_client, doctor_user, patient, doctor, department
):
    _auth(api_client, doctor_user)
    start, end = _future_slot(hour=10)
    response = api_client.post(
        LIST_URL,
        {
            "patientId": str(patient.pk),
            "doctorId": str(doctor.pk),
            "departmentId": str(department.pk),
            "scheduledStart": start.isoformat(),
            "scheduledEnd": end.isoformat(),
        },
        format="json",
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.json()["error"]["code"] == "PERMISSION_DENIED"


def test_create_rejects_overlap_via_api(
    api_client, administrator, patient, another_patient, doctor, department
):
    start, end = _future_slot(hour=10)
    create_appointment(
        patient=patient,
        doctor=doctor,
        department=department,
        scheduled_start=start,
        scheduled_end=end,
        created_by=administrator,
    )
    _auth(api_client, administrator)
    response = api_client.post(
        LIST_URL,
        {
            "patientId": str(another_patient.pk),
            "doctorId": str(doctor.pk),
            "departmentId": str(department.pk),
            "scheduledStart": (start + timedelta(minutes=10)).isoformat(),
            "scheduledEnd": (end + timedelta(minutes=10)).isoformat(),
        },
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


# ===========================================================================
# HTTP: list filters
# ===========================================================================
def test_list_filter_by_doctor_and_status(
    api_client, administrator, patient, another_patient,
    doctor, other_doctor, department,
):
    start, end = _future_slot(hour=10)
    a = create_appointment(
        patient=patient,
        doctor=doctor,
        department=department,
        scheduled_start=start,
        scheduled_end=end,
        created_by=administrator,
    )
    create_appointment(
        patient=another_patient,
        doctor=other_doctor,
        department=department,
        scheduled_start=start,
        scheduled_end=end,
        created_by=administrator,
    )

    _auth(api_client, administrator)
    response = api_client.get(f"{LIST_URL}?doctor={doctor.pk}")
    body = response.json()
    assert body["count"] == 1
    assert body["results"][0]["id"] == str(a.pk)

    # Status filter — nothing has status='completed' yet.
    response = api_client.get(f"{LIST_URL}?status=completed")
    assert response.json()["count"] == 0


def test_list_filter_by_date_range(
    api_client, administrator, patient, doctor, department
):
    tz = timezone.get_current_timezone()
    today = timezone.localdate()
    d1 = today + timedelta(days=1)
    d2 = today + timedelta(days=5)
    for d in (d1, d2):
        start = timezone.make_aware(datetime.combine(d, time(10, 0)), tz)
        end = start + timedelta(minutes=30)
        create_appointment(
            patient=patient,
            doctor=doctor,
            department=department,
            scheduled_start=start,
            scheduled_end=end,
            created_by=administrator,
        )

    _auth(api_client, administrator)
    response = api_client.get(
        f"{LIST_URL}?date_from={d1.isoformat()}&date_to={d1.isoformat()}"
    )
    assert response.json()["count"] == 1


# ===========================================================================
# HTTP: retrieve / update / cancel
# ===========================================================================
def test_retrieve_update_cancel_flow(
    api_client, administrator, patient, doctor, department
):
    start, end = _future_slot(hour=10)
    appt = create_appointment(
        patient=patient,
        doctor=doctor,
        department=department,
        scheduled_start=start,
        scheduled_end=end,
        created_by=administrator,
    )
    detail_url = f"{LIST_URL}{appt.pk}/"
    _auth(api_client, administrator)

    # Retrieve
    response = api_client.get(detail_url)
    assert response.status_code == status.HTTP_200_OK

    # Patch: status → confirmed
    response = api_client.patch(
        detail_url, {"status": "confirmed"}, format="json"
    )
    assert response.status_code == status.HTTP_200_OK, response.json()
    assert response.json()["status"] == "confirmed"

    # Cancel action
    response = api_client.post(f"{detail_url}cancel/", {}, format="json")
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["status"] == "cancelled"


def test_doctor_can_patch_status_of_own_appointment(
    api_client, administrator, doctor_user, doctor, patient, department
):
    start, end = _future_slot(hour=10)
    appt = create_appointment(
        patient=patient,
        doctor=doctor,
        department=department,
        scheduled_start=start,
        scheduled_end=end,
        created_by=administrator,
    )
    _auth(api_client, doctor_user)
    response = api_client.patch(
        f"{LIST_URL}{appt.pk}/", {"status": "in_progress"}, format="json"
    )
    # scheduled → in_progress is a legal transition.
    assert response.status_code == status.HTTP_200_OK, response.json()
    assert response.json()["status"] == "in_progress"


def test_doctor_cannot_patch_other_doctor_appointment(
    api_client, administrator, doctor_user, other_doctor, patient, department
):
    start, end = _future_slot(hour=10)
    appt = create_appointment(
        patient=patient,
        doctor=other_doctor,  # not doctor_user's profile
        department=department,
        scheduled_start=start,
        scheduled_end=end,
        created_by=administrator,
    )
    _auth(api_client, doctor_user)
    response = api_client.patch(
        f"{LIST_URL}{appt.pk}/", {"status": "in_progress"}, format="json"
    )
    # 403 or 404 — doctor_user has no visibility on other doctor by default.
    assert response.status_code in {
        status.HTTP_403_FORBIDDEN,
        status.HTTP_404_NOT_FOUND,
    }


def test_doctor_cannot_reschedule(
    api_client, administrator, doctor_user, doctor, patient, department
):
    start, end = _future_slot(hour=10)
    appt = create_appointment(
        patient=patient,
        doctor=doctor,
        department=department,
        scheduled_start=start,
        scheduled_end=end,
        created_by=administrator,
    )
    _auth(api_client, doctor_user)
    new_start = start + timedelta(hours=1)
    new_end = end + timedelta(hours=1)
    response = api_client.patch(
        f"{LIST_URL}{appt.pk}/",
        {
            "scheduledStart": new_start.isoformat(),
            "scheduledEnd": new_end.isoformat(),
        },
        format="json",
    )
    # scheduledStart is not in the doctor's allow-list.
    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_delete_soft_cancels(
    api_client, administrator, patient, doctor, department
):
    start, end = _future_slot(hour=10)
    appt = create_appointment(
        patient=patient,
        doctor=doctor,
        department=department,
        scheduled_start=start,
        scheduled_end=end,
        created_by=administrator,
    )
    _auth(api_client, administrator)
    response = api_client.delete(f"{LIST_URL}{appt.pk}/")
    assert response.status_code == status.HTTP_204_NO_CONTENT
    appt.refresh_from_db()
    assert appt.status == AppointmentStatus.CANCELLED
    assert appt.is_active is False


# ===========================================================================
# Cross-app: available-slots subtracts booked appointments
# ===========================================================================
def test_available_slots_excludes_booked_slot(
    api_client, administrator, patient, doctor, department
):
    # Book 10:00–10:30
    tz = timezone.get_current_timezone()
    day = timezone.localdate() + timedelta(days=1)
    start = timezone.make_aware(datetime.combine(day, time(10, 0)), tz)
    end = start + timedelta(minutes=30)
    create_appointment(
        patient=patient,
        doctor=doctor,
        department=department,
        scheduled_start=start,
        scheduled_end=end,
        created_by=administrator,
    )

    _auth(api_client, administrator)
    response = api_client.get(
        f"/api/v1/doctors/{doctor.pk}/available-slots/?date={day.isoformat()}"
    )
    assert response.status_code == status.HTTP_200_OK, response.json()
    slots = response.json()["slots"]
    # 09:00–18:00 by 30-minute slots = 18 slots. One is now booked.
    assert len(slots) == 17
    # None of them should equal the booked window.
    booked_iso = start.isoformat()
    assert all(s["start"] != booked_iso for s in slots)


def test_patient_history_now_includes_appointments(
    api_client, administrator, patient, doctor, department
):
    start, end = _future_slot(hour=10)
    create_appointment(
        patient=patient,
        doctor=doctor,
        department=department,
        scheduled_start=start,
        scheduled_end=end,
        created_by=administrator,
    )
    _auth(api_client, administrator)
    response = api_client.get(f"/api/v1/patients/{patient.pk}/history/")
    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    # T123: history endpoint now returns the standard pagination
    # envelope; iterate over ``.results``.
    types = {e["type"] for e in body["results"]}
    assert "appointment" in types
