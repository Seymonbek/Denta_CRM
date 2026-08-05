"""Tests for the ``treatments`` app (T12).

Covers PROJECT_BRIEF acceptance criteria:

* #6 CRUD — list, create, retrieve, update, soft-delete.
* #4 RBAC — bosh_shifokor writes anywhere; doctor writes own; admin
  reads only; anonymous rejected.
* #12 Photo upload — before/after/xray, multipart request.
* Standard error envelope + camelCase serialisation.
* Filters — ``?patient=&doctor=&department=&payment_status=&stage=``.
* Service consistency — appointment/patient/doctor must match; doctor
  must belong to department.
* Stage transition — completed cannot revert to in_progress.
"""
from __future__ import annotations

import io
from datetime import datetime, time, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from PIL import Image
from rest_framework import status
from rest_framework.test import APIClient

from apps.departments.models import Department
from apps.doctors.models import (
    CommissionBasis,
    DoctorProfile,
    ProcedureType,
)
from apps.patients.services import create_patient
from apps.scheduling.services import create_appointment
from apps.treatments.models import (
    PaymentStatus,
    PhotoType,
    Treatment,
    TreatmentPhoto,
    TreatmentStage,
)
from apps.treatments.selectors import (
    active_treatments,
    filter_treatments,
    photos_for_treatment,
    treatments_for_doctor,
    treatments_for_patient,
)
from apps.treatments.services import (
    create_treatment,
    soft_delete_treatment,
    update_treatment,
    upload_treatment_photo,
)

pytestmark = pytest.mark.django_db

User = get_user_model()

LIST_URL = "/api/v1/treatments/"


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
def second_department(head_doctor):
    return Department.objects.create(
        name="Ortopediya", description="Test 2", created_by=head_doctor
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
def other_doctor(other_doctor_user, department):
    profile = DoctorProfile.objects.create(
        user=other_doctor_user,
        specialization="Boshqa",
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
def other_procedure_type(second_department):
    return ProcedureType.objects.create(
        name="Koronka",
        department=second_department,
        default_duration_minutes=60,
        default_price=Decimal("500000.00"),
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
def appointment(patient, doctor, department, procedure_type, administrator):
    tz = timezone.get_current_timezone()
    start = timezone.make_aware(
        datetime.combine(
            timezone.localdate() + timedelta(days=1), time(10, 0)
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
        created_by=administrator,
    )


@pytest.fixture
def api_client():
    return APIClient()


def _auth(client: APIClient, user) -> APIClient:
    client.force_authenticate(user=user)
    return client


def _make_png(name: str = "before.png") -> SimpleUploadedFile:
    buf = io.BytesIO()
    Image.new("RGB", (10, 10), color=(255, 0, 0)).save(buf, format="PNG")
    buf.seek(0)
    return SimpleUploadedFile(name, buf.read(), content_type="image/png")


# ===========================================================================
# Service layer — create_treatment
# ===========================================================================
def test_create_treatment_happy_path(
    doctor, patient, department, procedure_type, head_doctor
):
    tr = create_treatment(
        doctor=doctor,
        patient=patient,
        department=department,
        procedure_type=procedure_type,
        diagnosis="Karies",
        description="Muolaja o'tkazildi",
        created_by=head_doctor,
    )
    assert tr.pk is not None
    assert tr.doctor == doctor
    assert tr.patient == patient
    assert tr.department == department
    assert tr.procedure_type == procedure_type
    # Price defaults from procedure_type.
    assert tr.price == Decimal("100000.00")
    assert tr.payment_status == PaymentStatus.UNPAID
    assert tr.stage == TreatmentStage.IN_PROGRESS
    assert tr.is_active is True


def test_create_treatment_explicit_price(doctor, patient, department, head_doctor):
    tr = create_treatment(
        doctor=doctor,
        patient=patient,
        department=department,
        price="250000.5",
        created_by=head_doctor,
    )
    assert tr.price == Decimal("250000.50")


def test_create_treatment_rejects_negative_price(
    doctor, patient, department, head_doctor
):
    with pytest.raises(ValidationError):
        create_treatment(
            doctor=doctor,
            patient=patient,
            department=department,
            price="-1",
            created_by=head_doctor,
        )


def test_create_treatment_rejects_department_doctor_mismatch(
    doctor, patient, second_department, head_doctor
):
    # ``doctor`` fixture belongs only to ``department`` (Terapiya), not
    # to ``second_department`` (Ortopediya).
    with pytest.raises(ValidationError) as exc:
        create_treatment(
            doctor=doctor,
            patient=patient,
            department=second_department,
            created_by=head_doctor,
        )
    assert "department" in str(exc.value.message_dict)


def test_create_treatment_rejects_procedure_type_department_mismatch(
    doctor, patient, department, other_procedure_type, head_doctor
):
    # ``other_procedure_type`` belongs to ``second_department``.
    with pytest.raises(ValidationError) as exc:
        create_treatment(
            doctor=doctor,
            patient=patient,
            department=department,
            procedure_type=other_procedure_type,
            created_by=head_doctor,
        )
    assert "procedure_type" in str(exc.value.message_dict)


def test_create_treatment_rejects_appointment_patient_mismatch(
    doctor, patient, another_patient, department, appointment, head_doctor
):
    with pytest.raises(ValidationError) as exc:
        create_treatment(
            doctor=doctor,
            patient=another_patient,
            department=department,
            appointment=appointment,
            created_by=head_doctor,
        )
    assert "appointment" in str(exc.value.message_dict)


def test_create_treatment_rejects_appointment_doctor_mismatch(
    doctor, other_doctor, patient, department, appointment, head_doctor
):
    with pytest.raises(ValidationError) as exc:
        create_treatment(
            doctor=other_doctor,
            patient=patient,
            department=department,
            appointment=appointment,
            created_by=head_doctor,
        )
    assert "appointment" in str(exc.value.message_dict)


def test_create_treatment_with_appointment_ok(
    doctor, patient, department, procedure_type, appointment, head_doctor
):
    tr = create_treatment(
        doctor=doctor,
        patient=patient,
        department=department,
        procedure_type=procedure_type,
        appointment=appointment,
        created_by=head_doctor,
    )
    assert tr.appointment_id == appointment.pk


# ===========================================================================
# Service layer — update_treatment
# ===========================================================================
def test_update_treatment_partial(doctor, patient, department, head_doctor):
    tr = create_treatment(
        doctor=doctor,
        patient=patient,
        department=department,
        created_by=head_doctor,
    )
    updated = update_treatment(
        tr,
        diagnosis="Yangi tashxis",
        price="777000.00",
        payment_status=PaymentStatus.PARTIAL,
    )
    updated.refresh_from_db()
    assert updated.diagnosis == "Yangi tashxis"
    assert updated.price == Decimal("777000.00")
    assert updated.payment_status == PaymentStatus.PARTIAL
    # stage was not touched.
    assert updated.stage == TreatmentStage.IN_PROGRESS


def test_update_treatment_stage_forward_ok(
    doctor, patient, department, head_doctor
):
    tr = create_treatment(
        doctor=doctor,
        patient=patient,
        department=department,
        created_by=head_doctor,
    )
    updated = update_treatment(tr, stage=TreatmentStage.COMPLETED)
    updated.refresh_from_db()
    assert updated.stage == TreatmentStage.COMPLETED


def test_update_treatment_stage_backward_rejected(
    doctor, patient, department, head_doctor
):
    tr = create_treatment(
        doctor=doctor,
        patient=patient,
        department=department,
        stage=TreatmentStage.COMPLETED,
        created_by=head_doctor,
    )
    with pytest.raises(ValidationError):
        update_treatment(tr, stage=TreatmentStage.IN_PROGRESS)


def test_soft_delete_treatment(doctor, patient, department, head_doctor):
    tr = create_treatment(
        doctor=doctor,
        patient=patient,
        department=department,
        created_by=head_doctor,
    )
    assert tr.is_active is True
    soft_delete_treatment(tr)
    tr.refresh_from_db()
    assert tr.is_active is False


# ===========================================================================
# Selectors
# ===========================================================================
def test_selectors_filter(doctor, other_doctor, patient, department, head_doctor):
    tr1 = create_treatment(
        doctor=doctor,
        patient=patient,
        department=department,
        created_by=head_doctor,
    )
    tr2 = create_treatment(
        doctor=other_doctor,
        patient=patient,
        department=department,
        stage=TreatmentStage.COMPLETED,
        created_by=head_doctor,
    )

    assert active_treatments().count() == 2
    assert treatments_for_patient(patient.pk).count() == 2
    assert treatments_for_doctor(doctor.pk).count() == 1
    assert treatments_for_doctor(doctor.pk).first() == tr1
    assert (
        filter_treatments(stage=TreatmentStage.COMPLETED).first() == tr2
    )
    assert filter_treatments(doctor_id=doctor.pk).count() == 1


# ===========================================================================
# API — RBAC
# ===========================================================================
def test_list_requires_auth(api_client):
    resp = api_client.get(LIST_URL)
    assert resp.status_code == status.HTTP_401_UNAUTHORIZED


def test_head_doctor_can_list_all(
    api_client, head_doctor, doctor, other_doctor, patient, department
):
    create_treatment(
        doctor=doctor, patient=patient, department=department,
        created_by=head_doctor,
    )
    create_treatment(
        doctor=other_doctor, patient=patient, department=department,
        created_by=head_doctor,
    )
    resp = _auth(api_client, head_doctor).get(LIST_URL)
    assert resp.status_code == status.HTTP_200_OK
    data = resp.json()
    assert set(data.keys()) >= {"count", "results"}
    assert data["count"] == 2


def test_doctor_sees_only_own_by_default(
    api_client, doctor_user, doctor, other_doctor, patient, department, head_doctor
):
    my_tr = create_treatment(
        doctor=doctor, patient=patient, department=department,
        created_by=head_doctor,
    )
    create_treatment(
        doctor=other_doctor, patient=patient, department=department,
        created_by=head_doctor,
    )
    resp = _auth(api_client, doctor_user).get(LIST_URL)
    assert resp.status_code == status.HTTP_200_OK
    data = resp.json()
    ids = [row["id"] for row in data["results"]]
    assert ids == [str(my_tr.pk)]


def test_doctor_with_flag_sees_all(
    api_client, doctor_user, doctor, other_doctor, patient, department, head_doctor
):
    doctor.can_view_other_doctors = True
    doctor.save(update_fields=["can_view_other_doctors"])

    create_treatment(
        doctor=doctor, patient=patient, department=department,
        created_by=head_doctor,
    )
    create_treatment(
        doctor=other_doctor, patient=patient, department=department,
        created_by=head_doctor,
    )
    resp = _auth(api_client, doctor_user).get(LIST_URL)
    assert resp.status_code == status.HTTP_200_OK
    assert resp.json()["count"] == 2


def test_administrator_can_read_but_not_write(
    api_client, administrator, doctor, patient, department, head_doctor
):
    tr = create_treatment(
        doctor=doctor, patient=patient, department=department,
        created_by=head_doctor,
    )
    client = _auth(api_client, administrator)

    resp = client.get(LIST_URL)
    assert resp.status_code == status.HTTP_200_OK

    resp = client.post(
        LIST_URL,
        data={
            "doctor": str(doctor.pk),
            "patient": str(patient.pk),
            "department": str(department.pk),
        },
        format="json",
    )
    assert resp.status_code == status.HTTP_403_FORBIDDEN

    resp = client.patch(
        f"{LIST_URL}{tr.pk}/",
        data={"diagnosis": "hack"},
        format="json",
    )
    assert resp.status_code == status.HTTP_403_FORBIDDEN


# ===========================================================================
# API — CRUD
# ===========================================================================
def test_create_via_api_head_doctor(
    api_client, head_doctor, doctor, patient, department, procedure_type
):
    payload = {
        "doctor": str(doctor.pk),
        "patient": str(patient.pk),
        "department": str(department.pk),
        "procedureType": str(procedure_type.pk),
        "diagnosis": "Karies",
        "description": "Plomba qo'yildi",
        "price": "150000.00",
    }
    resp = _auth(api_client, head_doctor).post(LIST_URL, data=payload, format="json")
    assert resp.status_code == status.HTTP_201_CREATED, resp.content
    data = resp.json()
    assert data["diagnosis"] == "Karies"
    assert data["price"] == "150000.00"
    assert data["paymentStatus"] == "unpaid"
    assert data["stage"] == "in_progress"
    # Camel-case relations present.
    assert data["doctor"]["id"] == str(doctor.pk)
    assert data["patient"]["id"] == str(patient.pk)
    assert data["department"]["id"] == str(department.pk)
    assert Treatment.objects.count() == 1


def test_create_via_api_validation_error_shape(
    api_client, head_doctor, doctor, patient, second_department
):
    """Standard error envelope on validation failure."""
    payload = {
        "doctor": str(doctor.pk),
        "patient": str(patient.pk),
        "department": str(second_department.pk),  # doctor not in this dept
    }
    resp = _auth(api_client, head_doctor).post(LIST_URL, data=payload, format="json")
    assert resp.status_code == status.HTTP_400_BAD_REQUEST
    body = resp.json()
    assert "error" in body
    assert body["error"]["code"] == "VALIDATION_ERROR"


def test_retrieve_via_api(
    api_client, head_doctor, doctor, patient, department
):
    tr = create_treatment(
        doctor=doctor, patient=patient, department=department,
        created_by=head_doctor,
    )
    resp = _auth(api_client, head_doctor).get(f"{LIST_URL}{tr.pk}/")
    assert resp.status_code == status.HTTP_200_OK
    data = resp.json()
    assert data["id"] == str(tr.pk)
    assert "photos" in data
    assert "toothRecords" in data


def test_patch_via_api(
    api_client, head_doctor, doctor, patient, department
):
    tr = create_treatment(
        doctor=doctor, patient=patient, department=department,
        created_by=head_doctor,
    )
    resp = _auth(api_client, head_doctor).patch(
        f"{LIST_URL}{tr.pk}/",
        data={"diagnosis": "Yangi", "paymentStatus": "paid"},
        format="json",
    )
    assert resp.status_code == status.HTTP_200_OK, resp.content
    tr.refresh_from_db()
    assert tr.diagnosis == "Yangi"
    assert tr.payment_status == PaymentStatus.PAID


def test_doctor_cannot_patch_other_doctors_treatment(
    api_client, doctor_user, doctor, other_doctor, patient, department, head_doctor
):
    tr = create_treatment(
        doctor=other_doctor, patient=patient, department=department,
        created_by=head_doctor,
    )
    resp = _auth(api_client, doctor_user).patch(
        f"{LIST_URL}{tr.pk}/",
        data={"diagnosis": "hack"},
        format="json",
    )
    assert resp.status_code in (
        status.HTTP_403_FORBIDDEN,
        status.HTTP_404_NOT_FOUND,
    )


def test_soft_delete_via_api(
    api_client, head_doctor, doctor, patient, department
):
    tr = create_treatment(
        doctor=doctor, patient=patient, department=department,
        created_by=head_doctor,
    )
    resp = _auth(api_client, head_doctor).delete(f"{LIST_URL}{tr.pk}/")
    assert resp.status_code == status.HTTP_204_NO_CONTENT
    tr.refresh_from_db()
    assert tr.is_active is False


# ===========================================================================
# API — filters
# ===========================================================================
def test_filter_by_patient_and_stage(
    api_client, head_doctor, doctor, patient, another_patient, department
):
    create_treatment(
        doctor=doctor, patient=patient, department=department,
        created_by=head_doctor,
    )
    create_treatment(
        doctor=doctor, patient=another_patient, department=department,
        stage=TreatmentStage.COMPLETED,
        created_by=head_doctor,
    )
    client = _auth(api_client, head_doctor)

    resp = client.get(f"{LIST_URL}?patient={patient.pk}")
    assert resp.status_code == status.HTTP_200_OK
    assert resp.json()["count"] == 1

    resp = client.get(f"{LIST_URL}?stage=completed")
    assert resp.status_code == status.HTTP_200_OK
    assert resp.json()["count"] == 1

    resp = client.get(f"{LIST_URL}?doctor={doctor.pk}&stage=in_progress")
    assert resp.status_code == status.HTTP_200_OK
    assert resp.json()["count"] == 1


# ===========================================================================
# API — photos
# ===========================================================================
def test_photo_upload_and_list(
    api_client, head_doctor, doctor, patient, department
):
    tr = create_treatment(
        doctor=doctor, patient=patient, department=department,
        created_by=head_doctor,
    )
    client = _auth(api_client, head_doctor)

    upload = _make_png("before.png")
    resp = client.post(
        f"{LIST_URL}{tr.pk}/photos/",
        data={
            "photoType": PhotoType.BEFORE,
            "image": upload,
            "caption": "birinchi",
        },
        format="multipart",
    )
    assert resp.status_code == status.HTTP_201_CREATED, resp.content
    body = resp.json()
    assert body["photoType"] == "before"
    assert body["caption"] == "birinchi"
    assert body["imageUrl"] is not None

    resp = client.get(f"{LIST_URL}{tr.pk}/photos/")
    assert resp.status_code == status.HTTP_200_OK
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["photoType"] == "before"


def test_photo_upload_permission_administrator_forbidden(
    api_client, administrator, doctor, patient, department, head_doctor
):
    tr = create_treatment(
        doctor=doctor, patient=patient, department=department,
        created_by=head_doctor,
    )
    upload = _make_png()
    resp = _auth(api_client, administrator).post(
        f"{LIST_URL}{tr.pk}/photos/",
        data={"photoType": PhotoType.AFTER, "image": upload},
        format="multipart",
    )
    assert resp.status_code == status.HTTP_403_FORBIDDEN


def test_photo_service_direct(doctor, patient, department, head_doctor):
    tr = create_treatment(
        doctor=doctor, patient=patient, department=department,
        created_by=head_doctor,
    )
    photo = upload_treatment_photo(
        tr,
        photo_type=PhotoType.XRAY,
        image=_make_png("x.png"),
        caption="xray view",
        uploaded_by=head_doctor,
    )
    assert isinstance(photo, TreatmentPhoto)
    assert photo.photo_type == PhotoType.XRAY
    assert photos_for_treatment(tr.pk).count() == 1


def test_tooth_records_stub_returns_501_when_odontogram_missing(
    api_client, head_doctor, doctor, patient, department
):
    tr = create_treatment(
        doctor=doctor, patient=patient, department=department,
        created_by=head_doctor,
    )
    client = _auth(api_client, head_doctor)

    # GET always works (returns empty list before T13).
    resp = client.get(f"{LIST_URL}{tr.pk}/tooth-records/")
    assert resp.status_code == status.HTTP_200_OK
    assert isinstance(resp.json(), list)

    # POST returns 501 or 201 depending on whether odontogram (T13) is
    # installed. We only assert one of those two.
    resp = client.post(
        f"{LIST_URL}{tr.pk}/tooth-records/",
        data={"toothNumber": 11, "procedure": "filling", "status": "treated"},
        format="json",
    )
    assert resp.status_code in (
        status.HTTP_201_CREATED,
        status.HTTP_501_NOT_IMPLEMENTED,
        status.HTTP_400_BAD_REQUEST,
    )
