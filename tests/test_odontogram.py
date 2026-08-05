"""Tests for the ``odontogram`` app (T13).

Covers PROJECT_BRIEF acceptance criteria:

* #7 Odontogram — tooth_number validation (FDI: 11–48), links to
  treatment.
* #4 RBAC — bosh_shifokor writes anywhere; doctor writes own; admin
  reads only; anonymous rejected.
* Nested endpoint ``/treatments/{id}/tooth-records/`` for list/create.
* Standalone endpoint ``/tooth-records/{id}/`` for edit/delete.
* Patient-level snapshot at ``/patients/{id}/odontogram/``.
* Uniqueness of ``(treatment, tooth_number)``.
* Invalid FDI numbers (10, 19, 29, 50, 0, -1) rejected.
* camelCase serialisation on the API surface.
"""
from __future__ import annotations

from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from rest_framework import status
from rest_framework.test import APIClient

from apps.departments.models import Department
from apps.doctors.models import (
    CommissionBasis,
    DoctorProfile,
    ProcedureType,
)
from apps.odontogram.models import (
    FDI_VALID_NUMBERS,
    ToothProcedure,
    ToothRecord,
    ToothStatus,
)
from apps.odontogram.selectors import (
    latest_records_by_tooth,
    records_for_patient,
    records_for_treatment,
)
from apps.odontogram.services import (
    create_tooth_record,
    soft_delete_tooth_record,
    update_tooth_record,
)
from apps.patients.services import create_patient
from apps.treatments.services import create_treatment

pytestmark = pytest.mark.django_db

User = get_user_model()


# ===========================================================================
# Fixtures
# ===========================================================================
@pytest.fixture
def head_doctor():
    return User.objects.create_user(
        phone_number="+998900010001",
        password="StrongPass!123",
        first_name="Bosh",
        last_name="Shifokor",
        role=User.Role.BOSH_SHIFOKOR,
    )


@pytest.fixture
def administrator():
    return User.objects.create_user(
        phone_number="+998900010002",
        password="StrongPass!123",
        first_name="Adm",
        last_name="In",
        role=User.Role.ADMINISTRATOR,
    )


@pytest.fixture
def doctor_user():
    return User.objects.create_user(
        phone_number="+998900010003",
        password="StrongPass!123",
        first_name="Doc",
        last_name="Tor",
        role=User.Role.DOCTOR,
    )


@pytest.fixture
def other_doctor_user():
    return User.objects.create_user(
        phone_number="+998900010004",
        password="StrongPass!123",
        first_name="Other",
        last_name="Doc",
        role=User.Role.DOCTOR,
    )


@pytest.fixture
def department(head_doctor):
    return Department.objects.create(
        name="Terapiya", description="Test dept", created_by=head_doctor
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
def patient(administrator):
    return create_patient(
        first_name="Ali",
        last_name="Valiyev",
        phone_number="+998910000001",
        created_by=administrator,
    )


@pytest.fixture
def treatment(patient, doctor, department, procedure_type, head_doctor):
    return create_treatment(
        doctor=doctor,
        patient=patient,
        department=department,
        procedure_type=procedure_type,
        diagnosis="Karies",
        description="15-tishda karies",
        price=Decimal("120000.00"),
        created_by=head_doctor,
    )


@pytest.fixture
def other_treatment(patient, other_doctor, department, procedure_type, head_doctor):
    return create_treatment(
        doctor=other_doctor,
        patient=patient,
        department=department,
        procedure_type=procedure_type,
        diagnosis="Karies 2",
        price=Decimal("100000.00"),
        created_by=head_doctor,
    )


def _auth_client(user) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    return client


# ===========================================================================
# Model / FDI constant tests
# ===========================================================================
class TestFDIConstants:
    def test_exactly_32_valid_teeth(self):
        assert len(FDI_VALID_NUMBERS) == 32

    def test_all_quadrants_present(self):
        for quadrant_base in (10, 20, 30, 40):
            for position in range(1, 9):
                assert quadrant_base + position in FDI_VALID_NUMBERS

    def test_invalid_numbers_excluded(self):
        for invalid in (10, 19, 20, 29, 30, 39, 40, 49, 0, 50, 100):
            assert invalid not in FDI_VALID_NUMBERS


# ===========================================================================
# Service tests
# ===========================================================================
class TestCreateToothRecord:
    def test_create_valid(self, treatment):
        rec = create_tooth_record(
            treatment=treatment,
            tooth_number=15,
            procedure=ToothProcedure.FILLING,
            status_value=ToothStatus.TREATED,
            notes="Chuqur karies",
        )
        assert rec.pk is not None
        assert rec.tooth_number == 15
        assert rec.procedure == ToothProcedure.FILLING
        assert rec.status == ToothStatus.TREATED
        assert rec.notes == "Chuqur karies"

    def test_default_status_is_planned(self, treatment):
        rec = create_tooth_record(
            treatment=treatment,
            tooth_number=21,
            procedure=ToothProcedure.CROWN,
        )
        assert rec.status == ToothStatus.PLANNED

    @pytest.mark.parametrize("tooth", [10, 19, 20, 29, 30, 39, 40, 49, 50, 0, -1, 100])
    def test_invalid_tooth_number_rejected(self, treatment, tooth):
        with pytest.raises(ValidationError):
            create_tooth_record(
                treatment=treatment,
                tooth_number=tooth,
                procedure=ToothProcedure.FILLING,
            )

    def test_invalid_procedure_rejected(self, treatment):
        with pytest.raises(ValidationError):
            create_tooth_record(
                treatment=treatment,
                tooth_number=11,
                procedure="laser-therapy",
            )

    def test_invalid_status_rejected(self, treatment):
        with pytest.raises(ValidationError):
            create_tooth_record(
                treatment=treatment,
                tooth_number=11,
                procedure=ToothProcedure.FILLING,
                status_value="broken",
            )

    def test_duplicate_tooth_on_treatment_rejected(self, treatment):
        create_tooth_record(
            treatment=treatment,
            tooth_number=15,
            procedure=ToothProcedure.FILLING,
        )
        with pytest.raises(ValidationError):
            create_tooth_record(
                treatment=treatment,
                tooth_number=15,
                procedure=ToothProcedure.CROWN,
            )

    def test_same_tooth_on_different_treatments_allowed(self, treatment, other_treatment):
        create_tooth_record(
            treatment=treatment,
            tooth_number=15,
            procedure=ToothProcedure.FILLING,
        )
        rec = create_tooth_record(
            treatment=other_treatment,
            tooth_number=15,
            procedure=ToothProcedure.CROWN,
        )
        assert rec.pk is not None

    def test_treatment_soft_deleted_rejected(self, treatment):
        treatment.is_active = False
        treatment.save(update_fields=["is_active"])
        with pytest.raises(ValidationError):
            create_tooth_record(
                treatment=treatment,
                tooth_number=15,
                procedure=ToothProcedure.FILLING,
            )

    def test_missing_tooth_number_rejected(self, treatment):
        with pytest.raises(ValidationError):
            create_tooth_record(
                treatment=treatment,
                tooth_number=None,
                procedure=ToothProcedure.FILLING,
            )

    def test_notes_length_limit(self, treatment):
        with pytest.raises(ValidationError):
            create_tooth_record(
                treatment=treatment,
                tooth_number=15,
                procedure=ToothProcedure.FILLING,
                notes="X" * 5001,
            )


class TestUpdateToothRecord:
    def test_partial_update(self, treatment):
        rec = create_tooth_record(
            treatment=treatment,
            tooth_number=15,
            procedure=ToothProcedure.FILLING,
        )
        updated = update_tooth_record(rec, status_value=ToothStatus.TREATED)
        assert updated.status == ToothStatus.TREATED
        assert updated.procedure == ToothProcedure.FILLING

    def test_invalid_update_rejected(self, treatment):
        rec = create_tooth_record(
            treatment=treatment,
            tooth_number=15,
            procedure=ToothProcedure.FILLING,
        )
        with pytest.raises(ValidationError):
            update_tooth_record(rec, tooth_number=99)


class TestSoftDelete:
    def test_soft_delete_sets_flag(self, treatment):
        rec = create_tooth_record(
            treatment=treatment,
            tooth_number=15,
            procedure=ToothProcedure.FILLING,
        )
        soft_delete_tooth_record(rec)
        rec.refresh_from_db()
        assert rec.is_active is False


# ===========================================================================
# Selector tests
# ===========================================================================
class TestSelectors:
    def test_records_for_treatment_active_only(self, treatment):
        r1 = create_tooth_record(
            treatment=treatment,
            tooth_number=11,
            procedure=ToothProcedure.FILLING,
        )
        create_tooth_record(
            treatment=treatment,
            tooth_number=12,
            procedure=ToothProcedure.FILLING,
        )
        soft_delete_tooth_record(r1)
        qs = records_for_treatment(treatment.pk)
        assert list(qs.values_list("tooth_number", flat=True)) == [12]

    def test_records_for_patient(self, treatment, other_treatment):
        create_tooth_record(
            treatment=treatment,
            tooth_number=11,
            procedure=ToothProcedure.FILLING,
        )
        create_tooth_record(
            treatment=other_treatment,
            tooth_number=21,
            procedure=ToothProcedure.CROWN,
        )
        patient_pk = treatment.patient_id
        qs = records_for_patient(patient_pk)
        assert qs.count() == 2

    def test_latest_records_by_tooth(self, treatment, other_treatment):
        # older tooth-11 record
        older = create_tooth_record(
            treatment=treatment,
            tooth_number=11,
            procedure=ToothProcedure.FILLING,
            status_value=ToothStatus.TREATED,
        )
        # newer tooth-11 record on a different treatment
        newer = create_tooth_record(
            treatment=other_treatment,
            tooth_number=11,
            procedure=ToothProcedure.CROWN,
            status_value=ToothStatus.PLANNED,
        )
        latest = latest_records_by_tooth(treatment.patient_id)
        # Because records_for_patient orders by -created_at, the newest
        # record for tooth 11 must win.
        assert latest[11].pk == newer.pk
        # Sanity — older still exists in the DB.
        assert ToothRecord.objects.filter(pk=older.pk).exists()


# ===========================================================================
# API — /treatments/{id}/tooth-records/
# ===========================================================================
def _treatment_records_url(treatment_id) -> str:
    return f"/api/v1/treatments/{treatment_id}/tooth-records/"


class TestNestedListCreateAPI:
    def test_bosh_shifokor_creates_record(self, head_doctor, treatment):
        client = _auth_client(head_doctor)
        response = client.post(
            _treatment_records_url(treatment.pk),
            {"toothNumber": 15, "procedure": "filling", "status": "treated"},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        body = response.json()
        assert body["toothNumber"] == 15
        assert body["procedure"] == "filling"
        assert body["status"] == "treated"
        assert body["treatmentId"] == str(treatment.pk)

    def test_doctor_creates_on_own_treatment(self, doctor_user, treatment):
        client = _auth_client(doctor_user)
        response = client.post(
            _treatment_records_url(treatment.pk),
            {"toothNumber": 15, "procedure": "filling"},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED

    def test_doctor_cannot_write_on_other_doctors_treatment(
        self, doctor_user, other_treatment
    ):
        client = _auth_client(doctor_user)
        response = client.post(
            _treatment_records_url(other_treatment.pk),
            {"toothNumber": 15, "procedure": "filling"},
            format="json",
        )
        # Either 403 (permission denied) or 404 (queryset-filtered out).
        # Both mean: doctor cannot write on a treatment they don't own.
        assert response.status_code in {
            status.HTTP_403_FORBIDDEN,
            status.HTTP_404_NOT_FOUND,
        }

    def test_administrator_cannot_write(self, administrator, treatment):
        client = _auth_client(administrator)
        response = client.post(
            _treatment_records_url(treatment.pk),
            {"toothNumber": 15, "procedure": "filling"},
            format="json",
        )
        # ToothRecordPermission.has_permission rejects non-safe methods
        # for administrators.
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_administrator_can_read(self, administrator, head_doctor, treatment):
        # Seed some data via bosh_shifokor first.
        writer = _auth_client(head_doctor)
        writer.post(
            _treatment_records_url(treatment.pk),
            {"toothNumber": 15, "procedure": "filling"},
            format="json",
        )
        reader = _auth_client(administrator)
        response = reader.get(_treatment_records_url(treatment.pk))
        assert response.status_code == status.HTTP_200_OK
        assert len(response.json()) == 1

    def test_anonymous_rejected(self, treatment):
        response = APIClient().get(_treatment_records_url(treatment.pk))
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @pytest.mark.parametrize("bad_tooth", [10, 19, 29, 0, 49, 99])
    def test_invalid_fdi_returns_400(self, head_doctor, treatment, bad_tooth):
        client = _auth_client(head_doctor)
        response = client.post(
            _treatment_records_url(treatment.pk),
            {"toothNumber": bad_tooth, "procedure": "filling"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_error_envelope_shape(self, head_doctor, treatment):
        client = _auth_client(head_doctor)
        response = client.post(
            _treatment_records_url(treatment.pk),
            {"toothNumber": 999, "procedure": "filling"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        body = response.json()
        assert "error" in body
        assert body["error"]["code"] == "VALIDATION_ERROR"

    def test_duplicate_via_api_returns_400(self, head_doctor, treatment):
        client = _auth_client(head_doctor)
        client.post(
            _treatment_records_url(treatment.pk),
            {"toothNumber": 15, "procedure": "filling"},
            format="json",
        )
        response = client.post(
            _treatment_records_url(treatment.pk),
            {"toothNumber": 15, "procedure": "crown"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_list_returns_records(self, head_doctor, treatment):
        client = _auth_client(head_doctor)
        client.post(
            _treatment_records_url(treatment.pk),
            {"toothNumber": 11, "procedure": "filling"},
            format="json",
        )
        client.post(
            _treatment_records_url(treatment.pk),
            {"toothNumber": 12, "procedure": "filling"},
            format="json",
        )
        response = client.get(_treatment_records_url(treatment.pk))
        assert response.status_code == status.HTTP_200_OK
        payload = response.json()
        assert len(payload) == 2
        # Sorted by tooth_number.
        assert [p["toothNumber"] for p in payload] == [11, 12]


# ===========================================================================
# API — standalone /tooth-records/{id}/
# ===========================================================================
class TestStandaloneToothRecordAPI:
    def test_patch_by_owner_doctor(self, doctor_user, treatment):
        writer = _auth_client(doctor_user)
        create_resp = writer.post(
            _treatment_records_url(treatment.pk),
            {"toothNumber": 15, "procedure": "filling"},
            format="json",
        )
        assert create_resp.status_code == status.HTTP_201_CREATED
        record_id = create_resp.json()["id"]

        patch_resp = writer.patch(
            f"/api/v1/tooth-records/{record_id}/",
            {"status": "treated", "notes": "OK"},
            format="json",
        )
        assert patch_resp.status_code == status.HTTP_200_OK
        assert patch_resp.json()["status"] == "treated"
        assert patch_resp.json()["notes"] == "OK"

    def test_admin_cannot_patch(self, administrator, head_doctor, treatment):
        writer = _auth_client(head_doctor)
        create_resp = writer.post(
            _treatment_records_url(treatment.pk),
            {"toothNumber": 15, "procedure": "filling"},
            format="json",
        )
        record_id = create_resp.json()["id"]

        admin_client = _auth_client(administrator)
        patch_resp = admin_client.patch(
            f"/api/v1/tooth-records/{record_id}/",
            {"status": "treated"},
            format="json",
        )
        assert patch_resp.status_code == status.HTTP_403_FORBIDDEN

    def test_delete_soft_deletes(self, head_doctor, treatment):
        writer = _auth_client(head_doctor)
        create_resp = writer.post(
            _treatment_records_url(treatment.pk),
            {"toothNumber": 15, "procedure": "filling"},
            format="json",
        )
        record_id = create_resp.json()["id"]

        del_resp = writer.delete(f"/api/v1/tooth-records/{record_id}/")
        assert del_resp.status_code == status.HTTP_204_NO_CONTENT
        assert not ToothRecord.objects.get(pk=record_id).is_active


# ===========================================================================
# Patient odontogram snapshot
# ===========================================================================
class TestPatientOdontogram:
    def test_snapshot_full_arch(self, head_doctor, treatment, patient):
        client = _auth_client(head_doctor)
        client.post(
            _treatment_records_url(treatment.pk),
            {"toothNumber": 11, "procedure": "filling", "status": "treated"},
            format="json",
        )
        response = client.get(f"/api/v1/patients/{patient.pk}/odontogram/")
        assert response.status_code == status.HTTP_200_OK
        body = response.json()
        # Patient odontogram endpoint returns the full 32-tooth arch.
        assert len(body) == 32
        # Find tooth 11 → should reflect the recorded procedure.
        entry = next(e for e in body if e["toothNumber"] == 11)
        assert entry["procedure"] == "filling"
        assert entry["status"] == "treated"
        # Tooth 45 not recorded → healthy default.
        entry_default = next(e for e in body if e["toothNumber"] == 45)
        assert entry_default["status"] == "healthy"


# ===========================================================================
# Treatment serializer integration — toothRecords appears on Treatment
# ===========================================================================
class TestTreatmentSerializerIntegration:
    def test_tooth_records_appear_in_treatment_response(
        self, head_doctor, treatment
    ):
        client = _auth_client(head_doctor)
        client.post(
            _treatment_records_url(treatment.pk),
            {"toothNumber": 15, "procedure": "filling", "status": "treated"},
            format="json",
        )
        response = client.get(f"/api/v1/treatments/{treatment.pk}/")
        assert response.status_code == status.HTTP_200_OK
        body = response.json()
        assert "toothRecords" in body
        assert len(body["toothRecords"]) == 1
        assert body["toothRecords"][0]["toothNumber"] == 15
