"""Tests for the ``payments`` app (T17 — Faza 4).

Covers PROJECT_BRIEF acceptance criteria:

* #6  CRUD — list, create, retrieve, soft-void on payments.
* #8  Commission auto-calculated for both ``from_total`` and ``from_net``.
* Procedure-type override wins over the doctor's default rate.
* Fully-paid treatment flips ``payment_status`` and materialises a
  :class:`CommissionRecord`.
* RBAC — all three roles may create payments; only bosh_shifokor may
  void; commissions are visible to head-doctor and to the doctor
  themselves; other doctors are blocked.
* /patients/{id}/balance/ returns the correct balance.
* Standard error envelope on validation failure.
"""
from __future__ import annotations

from datetime import datetime, time, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.departments.models import Department
from apps.doctors.models import CommissionBasis, DoctorProfile, ProcedureType
from apps.inventory.models import MaterialUnit
from apps.inventory.services import create_material, record_usage
from apps.patients.services import create_patient
from apps.payments.models import (
    CommissionRecord,
    PaymentMethod,
)
from apps.payments.services import (
    calculate_commission_for,
    recalculate_commission,
    record_payment,
    void_payment,
)
from apps.scheduling.services import create_appointment
from apps.treatments.models import PaymentStatus
from apps.treatments.services import create_treatment

pytestmark = pytest.mark.django_db

User = get_user_model()

PAYMENTS_URL = "/api/v1/payments/"


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
        name="Terapiya", description="", created_by=head_doctor,
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
        specialization="Ortoped",
        commission_basis=CommissionBasis.FROM_TOTAL,
        default_commission_rate=Decimal("25.00"),
    )
    profile.departments.add(department)
    return profile


@pytest.fixture
def procedure_type(department):
    return ProcedureType.objects.create(
        name="Plomba",
        department=department,
        default_duration_minutes=30,
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
def appointment(patient, doctor, department, procedure_type, administrator):
    tz = timezone.get_current_timezone()
    start = timezone.make_aware(
        datetime.combine(timezone.localdate() + timedelta(days=1), time(10, 0)),
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
def treatment(appointment, patient, doctor, department, procedure_type, doctor_user):
    return create_treatment(
        appointment=appointment,
        patient=patient,
        doctor=doctor,
        department=department,
        procedure_type=procedure_type,
        diagnosis="Karies",
        description="Standard filling",
        price=Decimal("500000.00"),
        created_by=doctor_user,
    )


@pytest.fixture
def api_client():
    return APIClient()


def _auth(client: APIClient, user) -> APIClient:
    client.force_authenticate(user=user)
    return client


# ===========================================================================
# 1. Commission formula — from_total
# ===========================================================================
class TestCommissionFromTotal:
    def test_from_total_uses_doctor_default_rate(self, treatment):
        # doctor.default_commission_rate = 30%, price = 500000
        numbers = calculate_commission_for(treatment)
        assert numbers["basis"] == "from_total"
        assert numbers["rate"] == Decimal("30.00")
        assert numbers["baseAmount"] == Decimal("500000.00")
        assert numbers["amount"] == Decimal("150000.00")
        assert numbers["materialCost"] == Decimal("0.00")

    def test_procedure_rate_overrides_doctor_default(
        self, treatment, procedure_type,
    ):
        procedure_type.commission_rate_override = Decimal("40.00")
        procedure_type.save(update_fields=["commission_rate_override"])
        # Reload treatment so cached FK picks up new override.
        treatment.refresh_from_db()
        numbers = calculate_commission_for(treatment)
        assert numbers["rate"] == Decimal("40.00")
        assert numbers["amount"] == Decimal("200000.00")


# ===========================================================================
# 2. Commission formula — from_net
# ===========================================================================
class TestCommissionFromNet:
    def test_from_net_subtracts_material_cost(
        self, treatment, doctor, doctor_user, head_doctor,
    ):
        # Switch doctor to from_net.
        doctor.commission_basis = CommissionBasis.FROM_NET
        doctor.save(update_fields=["commission_basis"])
        # Create a material with a real unit cost and consume it.
        composite = create_material(
            name="Filtek Z250",
            unit=MaterialUnit.GRAM,
            quantity_in_stock=Decimal("50.000"),
            minimum_threshold=Decimal("10.000"),
            unit_cost=Decimal("10000.00"),  # 10 000 UZS per gram
        )
        record_usage(
            treatment=treatment,
            material=composite,
            quantity_used=Decimal("3.000"),
            recorded_by=doctor_user,
        )
        # material_cost = 3 * 10 000 = 30 000 → base = 500 000 - 30 000 = 470 000
        # rate = 30 % → amount = 141 000
        treatment.refresh_from_db()
        numbers = calculate_commission_for(treatment)
        assert numbers["basis"] == "from_net"
        assert numbers["materialCost"] == Decimal("30000.00")
        assert numbers["baseAmount"] == Decimal("470000.00")
        assert numbers["amount"] == Decimal("141000.00")

    def test_from_net_clamps_to_zero_when_materials_exceed_price(
        self, treatment, doctor, doctor_user,
    ):
        doctor.commission_basis = CommissionBasis.FROM_NET
        doctor.save(update_fields=["commission_basis"])
        expensive = create_material(
            name="Gold Alloy",
            unit=MaterialUnit.GRAM,
            quantity_in_stock=Decimal("100.000"),
            minimum_threshold=Decimal("5.000"),
            unit_cost=Decimal("1000000.00"),  # very expensive
        )
        record_usage(
            treatment=treatment,
            material=expensive,
            quantity_used=Decimal("1.000"),
            recorded_by=doctor_user,
        )
        treatment.refresh_from_db()
        numbers = calculate_commission_for(treatment)
        assert numbers["amount"] == Decimal("0.00")
        assert numbers["baseAmount"] == Decimal("0.00")


# ===========================================================================
# 3. Full payment lifecycle
# ===========================================================================
class TestPaymentLifecycle:
    def test_partial_payment_sets_partial_status(self, treatment, administrator):
        record_payment(
            treatment=treatment,
            amount=Decimal("200000.00"),
            method=PaymentMethod.CASH,
            received_by=administrator,
        )
        treatment.refresh_from_db()
        assert treatment.payment_status == PaymentStatus.PARTIAL
        # No commission until fully paid.
        assert not CommissionRecord.objects.filter(treatment=treatment).exists()

    def test_full_payment_flips_status_and_creates_commission(
        self, treatment, administrator,
    ):
        record_payment(
            treatment=treatment,
            amount=Decimal("500000.00"),
            method=PaymentMethod.CARD,
            received_by=administrator,
        )
        treatment.refresh_from_db()
        assert treatment.payment_status == PaymentStatus.PAID
        commission = CommissionRecord.objects.get(treatment=treatment)
        assert commission.amount == Decimal("150000.00")
        assert commission.basis == "from_total"

    def test_over_payment_rejected(self, treatment, administrator):
        record_payment(
            treatment=treatment,
            amount=Decimal("500000.00"),
            method=PaymentMethod.CASH,
            received_by=administrator,
        )
        from django.core.exceptions import ValidationError as DjangoVE

        with pytest.raises(DjangoVE):
            record_payment(
                treatment=treatment,
                amount=Decimal("1.00"),
                method=PaymentMethod.CASH,
                received_by=administrator,
            )

    def test_void_payment_reverts_status(self, treatment, administrator):
        p1 = record_payment(
            treatment=treatment,
            amount=Decimal("500000.00"),
            method=PaymentMethod.CASH,
            received_by=administrator,
        )
        treatment.refresh_from_db()
        assert treatment.payment_status == PaymentStatus.PAID

        void_payment(p1)
        treatment.refresh_from_db()
        assert treatment.payment_status == PaymentStatus.UNPAID


# ===========================================================================
# 4. Patient balance
# ===========================================================================
class TestPatientBalance:
    def test_balance_reflects_billing_minus_payments(
        self, treatment, patient, administrator, api_client, head_doctor,
    ):
        record_payment(
            treatment=treatment,
            amount=Decimal("200000.00"),
            method=PaymentMethod.CASH,
            received_by=administrator,
        )
        _auth(api_client, head_doctor)
        url = f"/api/v1/patients/{patient.pk}/balance/"
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK, response.data
        assert response.data["totalBilled"] == "500000.00"
        assert response.data["totalPaid"] == "200000.00"
        assert response.data["balance"] == "300000.00"


# ===========================================================================
# 5. API — payments viewset
# ===========================================================================
class TestPaymentsAPI:
    def test_list_requires_auth(self, api_client):
        response = api_client.get(PAYMENTS_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_administrator_can_create_payment(
        self, api_client, administrator, treatment,
    ):
        _auth(api_client, administrator)
        response = api_client.post(
            PAYMENTS_URL,
            data={
                "treatmentId": str(treatment.pk),
                "amount": "100000.00",
                "method": "cash",
                "note": "Reception desk",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        assert response.data["amount"] == "100000.00"
        assert response.data["method"] == "cash"
        # patientId is derived server-side.
        assert response.data["patientId"] == str(treatment.patient_id)

    def test_doctor_can_create_payment(self, api_client, doctor_user, treatment):
        _auth(api_client, doctor_user)
        response = api_client.post(
            PAYMENTS_URL,
            data={
                "treatmentId": str(treatment.pk),
                "amount": "50000.00",
                "method": "card",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data

    def test_over_payment_returns_standard_error_envelope(
        self, api_client, administrator, treatment,
    ):
        _auth(api_client, administrator)
        # Pay in full first.
        api_client.post(
            PAYMENTS_URL,
            data={"treatmentId": str(treatment.pk), "amount": "500000.00", "method": "cash"},
            format="json",
        )
        response = api_client.post(
            PAYMENTS_URL,
            data={"treatmentId": str(treatment.pk), "amount": "1.00", "method": "cash"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "error" in response.data
        assert response.data["error"]["code"] == "VALIDATION_ERROR"

    def test_only_bosh_shifokor_can_void(
        self, api_client, head_doctor, doctor_user, administrator, treatment,
    ):
        payment = record_payment(
            treatment=treatment,
            amount=Decimal("100000.00"),
            method=PaymentMethod.CASH,
            received_by=administrator,
        )
        url = f"{PAYMENTS_URL}{payment.pk}/"

        _auth(api_client, doctor_user)
        response = api_client.delete(url)
        assert response.status_code == status.HTTP_403_FORBIDDEN

        _auth(api_client, administrator)
        response = api_client.delete(url)
        assert response.status_code == status.HTTP_403_FORBIDDEN

        _auth(api_client, head_doctor)
        response = api_client.delete(url)
        assert response.status_code == status.HTTP_204_NO_CONTENT
        payment.refresh_from_db()
        assert payment.is_active is False

    def test_method_filter(self, api_client, head_doctor, administrator, treatment):
        record_payment(
            treatment=treatment,
            amount=Decimal("100000.00"),
            method=PaymentMethod.CASH,
            received_by=administrator,
        )
        record_payment(
            treatment=treatment,
            amount=Decimal("100000.00"),
            method=PaymentMethod.CARD,
            received_by=administrator,
        )
        _auth(api_client, head_doctor)
        response = api_client.get(f"{PAYMENTS_URL}?method=cash")
        assert response.status_code == status.HTTP_200_OK
        methods = {row["method"] for row in response.data["results"]}
        assert methods == {"cash"}


# ===========================================================================
# 6. Doctor commissions endpoint
# ===========================================================================
class TestCommissionsAPI:
    def test_head_doctor_sees_any_doctor(
        self, api_client, head_doctor, doctor, treatment, administrator,
    ):
        record_payment(
            treatment=treatment,
            amount=Decimal("500000.00"),
            method=PaymentMethod.CASH,
            received_by=administrator,
        )
        _auth(api_client, head_doctor)
        url = f"/api/v1/doctors/{doctor.pk}/commissions/"
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]["amount"] == "150000.00"

    def test_doctor_sees_own_commissions(
        self, api_client, doctor_user, doctor, treatment, administrator,
    ):
        record_payment(
            treatment=treatment,
            amount=Decimal("500000.00"),
            method=PaymentMethod.CASH,
            received_by=administrator,
        )
        _auth(api_client, doctor_user)
        url = f"/api/v1/doctors/{doctor.pk}/commissions/"
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1

    def test_doctor_cannot_see_other_doctors_commissions(
        self,
        api_client,
        doctor_user,
        other_doctor,
        treatment,
        administrator,
    ):
        # ``treatment`` belongs to fixture doctor; other_doctor has no commissions.
        record_payment(
            treatment=treatment,
            amount=Decimal("500000.00"),
            method=PaymentMethod.CASH,
            received_by=administrator,
        )
        _auth(api_client, doctor_user)
        url = f"/api/v1/doctors/{other_doctor.pk}/commissions/"
        response = api_client.get(url)
        # doctor_user is neither head-doctor nor other_doctor; blocked.
        assert response.status_code in (
            status.HTTP_403_FORBIDDEN,
            status.HTTP_404_NOT_FOUND,
        )

    def test_administrator_forbidden(
        self, api_client, administrator, doctor,
    ):
        _auth(api_client, administrator)
        url = f"/api/v1/doctors/{doctor.pk}/commissions/"
        response = api_client.get(url)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_summary_endpoint(
        self, api_client, head_doctor, doctor, treatment, administrator,
    ):
        record_payment(
            treatment=treatment,
            amount=Decimal("500000.00"),
            method=PaymentMethod.CASH,
            received_by=administrator,
        )
        _auth(api_client, head_doctor)
        url = f"/api/v1/doctors/{doctor.pk}/commissions/summary/"
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 1
        assert response.data["totalAmount"] == "150000.00"


# ===========================================================================
# 7. Recalculation idempotence
# ===========================================================================
class TestRecalculation:
    def test_recalculate_updates_existing_record_in_place(
        self, treatment, administrator, doctor,
    ):
        record_payment(
            treatment=treatment,
            amount=Decimal("500000.00"),
            method=PaymentMethod.CASH,
            received_by=administrator,
        )
        first = CommissionRecord.objects.get(treatment=treatment)
        # Bump the doctor's rate; recalc should update the same row.
        doctor.default_commission_rate = Decimal("50.00")
        doctor.save(update_fields=["default_commission_rate"])
        recalculate_commission(treatment)
        assert CommissionRecord.objects.filter(treatment=treatment).count() == 1
        second = CommissionRecord.objects.get(pk=first.pk)
        assert second.amount == Decimal("250000.00")
