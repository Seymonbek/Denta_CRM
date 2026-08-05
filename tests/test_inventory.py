"""Tests for the ``inventory`` app (T16-A).

Covers PROJECT_BRIEF acceptance criteria:

* #6  CRUD — list, create, retrieve, update, soft-delete on materials.
* #9  Inventory — MaterialUsage decrements stock via signal, restock
       replenishes it, low-threshold filter works.
* #4  RBAC — bosh_shifokor writes; doctor read-only + may create
       usages; administrator read-only on materials.
* Standard error envelope + camelCase serialisation.
* Idempotence — the ``apply_usage_to_stock`` service is guarded by
  ``related_usage`` so re-firing the signal does not double-decrement.
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
from apps.inventory.models import (
    Material,
    MaterialUnit,
    StockChangeReason,
)
from apps.inventory.selectors import (
    below_threshold,
    material_logs,
    total_used_of,
)
from apps.inventory.services import (
    adjust_stock,
    apply_usage_to_stock,
    create_material,
    record_usage,
    restock,
    soft_delete_material,
)
from apps.patients.services import create_patient
from apps.scheduling.services import create_appointment
from apps.treatments.services import create_treatment

pytestmark = pytest.mark.django_db

User = get_user_model()

MATERIALS_URL = "/api/v1/materials/"


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
        price=Decimal("100000.00"),
        created_by=doctor_user,
    )


@pytest.fixture
def composite(head_doctor):
    return create_material(
        name="Filtek Z250",
        unit=MaterialUnit.GRAM,
        quantity_in_stock=Decimal("50.000"),
        minimum_threshold=Decimal("10.000"),
        unit_cost=Decimal("120000.00"),
        notes="Universal kompozit",
    )


@pytest.fixture
def api_client():
    return APIClient()


def _auth(client: APIClient, user) -> APIClient:
    client.force_authenticate(user=user)
    return client


# ===========================================================================
# 1. Model & service layer tests
# ===========================================================================
class TestMaterialModel:
    def test_create_material_via_service_writes_initial_log(self):
        material = create_material(
            name="Igna #25",
            unit=MaterialUnit.PIECE,
            quantity_in_stock=Decimal("100.000"),
            minimum_threshold=Decimal("20.000"),
            unit_cost=Decimal("2000.00"),
        )
        assert material.pk is not None
        assert material.quantity_in_stock == Decimal("100.000")
        # Initial stock is recorded as an adjustment log.
        logs = list(material_logs(material.pk))
        assert len(logs) == 1
        assert logs[0].reason == StockChangeReason.ADJUSTMENT
        assert logs[0].change_amount == Decimal("100.000")
        assert logs[0].resulting_quantity == Decimal("100.000")

    def test_duplicate_name_rejected_case_insensitive(self):
        create_material(
            name="Alginat",
            unit=MaterialUnit.GRAM,
            quantity_in_stock=Decimal("10.000"),
        )
        with pytest.raises(Exception):
            create_material(
                name="alginat",  # different case
                unit=MaterialUnit.GRAM,
            )

    def test_negative_quantity_rejected(self):
        with pytest.raises(Exception):
            create_material(
                name="X-negative",
                unit=MaterialUnit.PIECE,
                quantity_in_stock=Decimal("-1.000"),
            )

    def test_below_threshold_property(self, composite):
        assert composite.is_below_threshold is False
        composite.quantity_in_stock = Decimal("5.000")
        composite.save(update_fields=["quantity_in_stock", "updated_at"])
        composite.refresh_from_db()
        assert composite.is_below_threshold is True

    def test_soft_delete_flips_is_active(self, composite):
        soft_delete_material(composite)
        composite.refresh_from_db()
        assert composite.is_active is False


# ===========================================================================
# 2. Signal / usage tests
# ===========================================================================
class TestMaterialUsageSignal:
    def test_usage_decrements_stock_and_writes_log(
        self, treatment, composite, doctor_user
    ):
        record_usage(
            treatment=treatment,
            material=composite,
            quantity_used=Decimal("3.500"),
            recorded_by=doctor_user,
        )
        composite.refresh_from_db()
        assert composite.quantity_in_stock == Decimal("46.500")

        logs = list(material_logs(composite.pk))
        # Two logs: initial adjustment + usage.
        assert len(logs) == 2
        latest = logs[0]
        assert latest.reason == StockChangeReason.USAGE
        assert latest.change_amount == Decimal("-3.500")
        assert latest.resulting_quantity == Decimal("46.500")
        assert latest.related_treatment_id == treatment.pk

    def test_usage_over_stock_rejected(self, treatment, composite):
        with pytest.raises(Exception):
            record_usage(
                treatment=treatment,
                material=composite,
                quantity_used=Decimal("999.000"),
            )
        composite.refresh_from_db()
        assert composite.quantity_in_stock == Decimal("50.000")

    def test_apply_usage_is_idempotent(self, treatment, composite):
        usage = record_usage(
            treatment=treatment,
            material=composite,
            quantity_used=Decimal("2.000"),
        )
        composite.refresh_from_db()
        stock_after_first = composite.quantity_in_stock
        # Manually call the service again — should NOT double-decrement.
        apply_usage_to_stock(usage)
        composite.refresh_from_db()
        assert composite.quantity_in_stock == stock_after_first


# ===========================================================================
# 3. Restock & adjust tests
# ===========================================================================
class TestStockMovements:
    def test_restock_increases_stock_and_logs(self, composite, head_doctor):
        log = restock(
            composite,
            amount=Decimal("25.000"),
            performed_by=head_doctor,
            note="Yangi partiya",
        )
        composite.refresh_from_db()
        assert composite.quantity_in_stock == Decimal("75.000")
        assert log.reason == StockChangeReason.RESTOCK
        assert log.change_amount == Decimal("25.000")
        assert log.performed_by == head_doctor

    def test_restock_rejects_non_positive(self, composite):
        with pytest.raises(Exception):
            restock(composite, amount=Decimal("0.000"))
        with pytest.raises(Exception):
            restock(composite, amount=Decimal("-5.000"))

    def test_adjust_stock_signed_delta(self, composite, head_doctor):
        adjust_stock(
            composite, delta=Decimal("-2.000"), performed_by=head_doctor,
            note="Yo'qolgan miqdor",
        )
        composite.refresh_from_db()
        assert composite.quantity_in_stock == Decimal("48.000")

    def test_adjust_cannot_go_negative(self, composite):
        with pytest.raises(Exception):
            adjust_stock(composite, delta=Decimal("-999.000"))


# ===========================================================================
# 4. Selectors
# ===========================================================================
class TestSelectors:
    def test_below_threshold_returns_only_low_materials(self, head_doctor):
        low = create_material(
            name="Low material",
            unit=MaterialUnit.PIECE,
            quantity_in_stock=Decimal("5.000"),
            minimum_threshold=Decimal("10.000"),
        )
        high = create_material(
            name="High material",
            unit=MaterialUnit.PIECE,
            quantity_in_stock=Decimal("50.000"),
            minimum_threshold=Decimal("10.000"),
        )
        result = list(below_threshold())
        assert low in result
        assert high not in result

    def test_total_used_of_aggregates(self, treatment, composite):
        record_usage(
            treatment=treatment, material=composite, quantity_used=Decimal("1.000")
        )
        record_usage(
            treatment=treatment, material=composite, quantity_used=Decimal("2.000")
        )
        assert total_used_of(composite.pk) == Decimal("3.000")


# ===========================================================================
# 5. API — RBAC + endpoints
# ===========================================================================
class TestMaterialAPI:
    def test_list_requires_authentication(self, api_client):
        response = api_client.get(MATERIALS_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_bosh_shifokor_can_create(self, api_client, head_doctor):
        _auth(api_client, head_doctor)
        response = api_client.post(
            MATERIALS_URL,
            data={
                "name": "Yangi material",
                "unit": "piece",
                "quantityInStock": "20.000",
                "minimumThreshold": "5.000",
                "unitCost": "1500.00",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        body = response.data
        assert body["name"] == "Yangi material"
        assert body["quantityInStock"] == "20.000"
        assert body["isBelowThreshold"] is False
        assert Material.objects.filter(name="Yangi material").exists()

    def test_doctor_cannot_create_material(self, api_client, doctor_user):
        _auth(api_client, doctor_user)
        response = api_client.post(
            MATERIALS_URL,
            data={"name": "X", "unit": "piece"},
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_administrator_read_only(self, api_client, administrator, composite):
        _auth(api_client, administrator)
        response = api_client.get(MATERIALS_URL)
        assert response.status_code == status.HTTP_200_OK
        # Write is refused.
        write = api_client.post(
            MATERIALS_URL,
            data={"name": "Nope", "unit": "piece"},
            format="json",
        )
        assert write.status_code == status.HTTP_403_FORBIDDEN

    def test_below_threshold_filter(self, api_client, head_doctor):
        create_material(
            name="Low", unit=MaterialUnit.PIECE,
            quantity_in_stock=Decimal("1.000"),
            minimum_threshold=Decimal("10.000"),
        )
        create_material(
            name="High", unit=MaterialUnit.PIECE,
            quantity_in_stock=Decimal("100.000"),
            minimum_threshold=Decimal("10.000"),
        )
        _auth(api_client, head_doctor)
        response = api_client.get(f"{MATERIALS_URL}?below_threshold=true")
        assert response.status_code == status.HTTP_200_OK
        names = {row["name"] for row in response.data["results"]}
        assert "Low" in names
        assert "High" not in names

    def test_restock_endpoint(self, api_client, head_doctor, composite):
        _auth(api_client, head_doctor)
        url = f"{MATERIALS_URL}{composite.pk}/restock/"
        response = api_client.patch(
            url, data={"amount": "15.000", "note": "TEST"}, format="json"
        )
        assert response.status_code == status.HTTP_200_OK, response.data
        composite.refresh_from_db()
        assert composite.quantity_in_stock == Decimal("65.000")

    def test_restock_endpoint_forbidden_for_doctor(
        self, api_client, doctor_user, composite
    ):
        _auth(api_client, doctor_user)
        url = f"{MATERIALS_URL}{composite.pk}/restock/"
        response = api_client.patch(
            url, data={"amount": "5.000"}, format="json"
        )
        assert response.status_code in (
            status.HTTP_403_FORBIDDEN,
            status.HTTP_400_BAD_REQUEST,
        )

    def test_logs_endpoint(self, api_client, head_doctor, composite):
        # Restock once to add a log line.
        restock(composite, amount=Decimal("5.000"), performed_by=head_doctor)
        _auth(api_client, head_doctor)
        url = f"{MATERIALS_URL}{composite.pk}/logs/"
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        payload = response.data
        results = payload["results"] if isinstance(payload, dict) else payload
        assert len(results) >= 2  # initial adjustment + restock
        assert results[0]["reason"] in {"restock", "adjustment", "usage"}

    def test_soft_delete_via_api(self, api_client, head_doctor, composite):
        _auth(api_client, head_doctor)
        url = f"{MATERIALS_URL}{composite.pk}/"
        response = api_client.delete(url)
        assert response.status_code == status.HTTP_204_NO_CONTENT
        composite.refresh_from_db()
        assert composite.is_active is False

    def test_update_ignores_quantity_field(self, api_client, head_doctor, composite):
        _auth(api_client, head_doctor)
        url = f"{MATERIALS_URL}{composite.pk}/"
        response = api_client.patch(
            url,
            data={"quantityInStock": "9999.000", "notes": "updated"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK, response.data
        composite.refresh_from_db()
        # quantity was not touched — must go through /restock/ or /adjust/.
        assert composite.quantity_in_stock == Decimal("50.000")
        assert composite.notes == "updated"


# ===========================================================================
# 6. Error envelope
# ===========================================================================
class TestErrorEnvelope:
    def test_validation_error_wrapped(self, api_client, head_doctor):
        _auth(api_client, head_doctor)
        response = api_client.post(
            MATERIALS_URL,
            data={"name": "", "unit": "piece"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "error" in response.data
        assert response.data["error"]["code"] == "VALIDATION_ERROR"



# ===========================================================================
# 7. Low-stock alert
# ===========================================================================
class TestLowStockAlert:
    """The reviewer explicitly requires: threshold ostiga tushganda alert
    chaqiriladi. Now that the ``notifications`` app is installed (T21)
    the hook enqueues a ``inventory.low_stock`` :class:`NotificationLog`
    row targeting every active ``bosh_shifokor``. We verify the row is
    created when — and only when — the stock drops to or below the
    threshold. (The pre-T21 behaviour was to fall back to a WARNING via
    Python logging; that fallback still exists for the case where the
    notifications app is uninstalled.)"""

    def test_usage_below_threshold_enqueues_notification(
        self, treatment, composite, head_doctor
    ):
        from apps.notifications.models import (
            NotificationLog,
            NotificationStatus,
            NotificationType,
        )

        # Bring stock to just above the threshold (11.000 > 10.000).
        adjust_stock(composite, delta=Decimal("-39.000"))
        composite.refresh_from_db()
        assert composite.quantity_in_stock == Decimal("11.000")
        # Baseline: no low-stock notifications yet.
        assert not NotificationLog.objects.filter(
            type=NotificationType.LOW_STOCK
        ).exists()

        # Cross the threshold: 11 - 2 = 9 (below 10).
        record_usage(
            treatment=treatment,
            material=composite,
            quantity_used=Decimal("2.000"),
        )

        composite.refresh_from_db()
        assert composite.quantity_in_stock == Decimal("9.000")

        # Exactly one pending low-stock alert targeting the head doctor.
        alerts = NotificationLog.objects.filter(
            type=NotificationType.LOW_STOCK,
            user=head_doctor,
        )
        assert alerts.count() == 1
        alert = alerts.first()
        assert alert.status == NotificationStatus.PENDING
        assert alert.context["material_id"] == str(composite.pk)
        assert composite.name in alert.message

    def test_usage_above_threshold_does_not_enqueue(
        self, treatment, composite
    ):
        from apps.notifications.models import NotificationLog, NotificationType

        # Stock stays well above the threshold (50 - 3 = 47).
        record_usage(
            treatment=treatment,
            material=composite,
            quantity_used=Decimal("3.000"),
        )

        composite.refresh_from_db()
        assert composite.quantity_in_stock == Decimal("47.000")
        assert not NotificationLog.objects.filter(
            type=NotificationType.LOW_STOCK
        ).exists()
