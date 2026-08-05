"""End-to-end clinic flow smoke test (Task 107, criterion #42).

This test exercises the whole clinical workflow over the real HTTP layer
so we can prove that the modules integrate correctly:

    1. Login as ``bosh_shifokor`` at POST /api/v1/auth/login/
       → capture JWT access token.
    2. Create a department, a doctor (nested user payload), a patient
       (as administrator), an appointment (as head doctor for
       simplicity), and finally a treatment.
    3. Add a tooth record via the nested odontogram route.
    4. Create a material, log a material usage against the treatment.
    5. Upload a small in-memory PNG image against the treatment.
    6. Record a full payment.
    7. GET /api/v1/patients/{id}/balance/ and
       /api/v1/doctors/{id}/commissions/ and assert the numbers.

No external services are contacted — Redis is stubbed out by the
project's conftest, Celery tasks are eager, and the photo pipeline
processes in-memory bytes.
"""
from __future__ import annotations

import io
from datetime import datetime, time, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from django.utils import timezone
from PIL import Image
from rest_framework import status
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db

User = get_user_model()


HEAD_PHONE = "+998900000101"
HEAD_PASSWORD = "SmokeTest!123"
DOCTOR_PHONE = "+998900000102"
DOCTOR_PASSWORD = "SmokeTest!123"
ADMIN_PHONE = "+998900000103"
ADMIN_PASSWORD = "SmokeTest!123"


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------
def _make_png_bytes() -> bytes:
    """Return a valid 32×32 PNG as bytes (no on-disk file needed)."""
    buffer = io.BytesIO()
    Image.new("RGB", (32, 32), color=(200, 220, 250)).save(buffer, format="PNG")
    return buffer.getvalue()


def _login(client: APIClient, phone: str, password: str) -> str:
    """POST /auth/login/, assert 200, return the access token."""
    response = client.post(
        reverse("v1:accounts:login"),
        data={"phoneNumber": phone, "password": password},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK, response.content
    body = response.json()
    assert "access" in body and body["access"], body
    return body["access"]


def _bearer(client: APIClient, token: str) -> APIClient:
    """Return the same client with the Authorization header set."""
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture
def head_doctor():
    """The ``bosh_shifokor`` who orchestrates most of the flow."""
    return User.objects.create_user(
        phone_number=HEAD_PHONE,
        password=HEAD_PASSWORD,
        first_name="Aziz",
        last_name="Karimov",
        role=User.Role.BOSH_SHIFOKOR,
    )


@pytest.fixture
def administrator():
    return User.objects.create_user(
        phone_number=ADMIN_PHONE,
        password=ADMIN_PASSWORD,
        first_name="Malika",
        last_name="Sobirova",
        role=User.Role.ADMINISTRATOR,
    )


@pytest.fixture
def api_client():
    return APIClient()


# ---------------------------------------------------------------------------
# The smoke flow
# ---------------------------------------------------------------------------
def test_full_clinic_flow_end_to_end(head_doctor, administrator, api_client):
    """Full clinic workflow — proves criterion #42.

    Kept as a single test so the linear narrative is obvious and any
    regression across app boundaries surfaces immediately.
    """
    # -- 1. Login as bosh_shifokor -----------------------------------------
    head_token = _login(api_client, HEAD_PHONE, HEAD_PASSWORD)
    _bearer(api_client, head_token)

    # /auth/me/ works with the token
    me = api_client.get(reverse("v1:accounts:me"))
    assert me.status_code == status.HTTP_200_OK, me.content
    assert me.json()["phoneNumber"] == HEAD_PHONE
    assert me.json()["role"] == "bosh_shifokor"

    # -- 2a. Create department ---------------------------------------------
    dept_resp = api_client.post(
        "/api/v1/departments/",
        data={"name": "Terapiya", "description": "Umumiy terapiya"},
        format="json",
    )
    assert dept_resp.status_code == status.HTTP_201_CREATED, dept_resp.content
    department_id = dept_resp.json()["id"]

    # -- 2b. Create doctor (nested user payload) ---------------------------
    doctor_resp = api_client.post(
        "/api/v1/doctors/",
        data={
            "user": {
                "phoneNumber": DOCTOR_PHONE,
                "firstName": "Doc",
                "lastName": "Tor",
                "role": "doctor",
                "password": DOCTOR_PASSWORD,
            },
            "departmentIds": [department_id],
            "specialization": "Terapevt",
            "commissionBasis": "from_total",
            "defaultCommissionRate": "30.00",
        },
        format="json",
    )
    assert doctor_resp.status_code == status.HTTP_201_CREATED, doctor_resp.content
    doctor_body = doctor_resp.json()
    doctor_id = doctor_body["id"]
    assert doctor_body["commissionBasis"] == "from_total"
    assert doctor_body["defaultCommissionRate"] == "30.00"

    # -- 2c. Create patient (as administrator) -----------------------------
    admin_token = _login(APIClient(), ADMIN_PHONE, ADMIN_PASSWORD)
    admin_client = _bearer(APIClient(), admin_token)
    patient_resp = admin_client.post(
        "/api/v1/patients/",
        data={
            "firstName": "Ali",
            "lastName": "Valiyev",
            "phoneNumber": "+998901112233",
            "gender": "male",
            "notes": "Allergiya yo'q.",
        },
        format="json",
    )
    assert patient_resp.status_code == status.HTTP_201_CREATED, patient_resp.content
    patient_id = patient_resp.json()["id"]

    # -- 2d. Create appointment (head doctor is allowed to book) -----------
    tz = timezone.get_current_timezone()
    start = timezone.make_aware(
        datetime.combine(timezone.localdate() + timedelta(days=1), time(10, 0)),
        tz,
    )
    end = start + timedelta(minutes=30)
    appt_resp = api_client.post(
        "/api/v1/appointments/",
        data={
            "patientId": patient_id,
            "doctorId": doctor_id,
            "departmentId": department_id,
            "scheduledStart": start.isoformat(),
            "scheduledEnd": end.isoformat(),
            "notes": "First consultation",
        },
        format="json",
    )
    assert appt_resp.status_code == status.HTTP_201_CREATED, appt_resp.content
    appointment_id = appt_resp.json()["id"]

    # -- 3a. Create treatment (head doctor) --------------------------------
    treatment_resp = api_client.post(
        "/api/v1/treatments/",
        data={
            "appointmentId": appointment_id,
            "patientId": patient_id,
            "doctorId": doctor_id,
            "departmentId": department_id,
            "diagnosis": "Karies (26)",
            "description": "Composite filling, upper left first molar.",
            "price": "500000.00",
            "stage": "in_progress",
        },
        format="json",
    )
    assert treatment_resp.status_code == status.HTTP_201_CREATED, treatment_resp.content
    treatment_body = treatment_resp.json()
    treatment_id = treatment_body["id"]
    assert treatment_body["price"] == "500000.00"
    assert treatment_body["paymentStatus"] == "unpaid"

    # -- 3b. Add tooth record via the treatments-nested route --------------
    # The odontogram module exposes tooth records under
    # /api/v1/treatments/{id}/tooth-records/ so the treatment context is
    # implicit — no need to send ``treatment`` in the body.
    tooth_resp = api_client.post(
        f"/api/v1/treatments/{treatment_id}/tooth-records/",
        data={
            "toothNumber": 26,
            "procedure": "filling",
            "status": "treated",
            "notes": "Composite Z250, layered.",
        },
        format="json",
    )
    assert tooth_resp.status_code in (
        status.HTTP_200_OK,
        status.HTTP_201_CREATED,
    ), tooth_resp.content
    tooth_body = tooth_resp.json()
    assert tooth_body["toothNumber"] == 26
    assert tooth_body["procedure"] == "filling"
    assert tooth_body["status"] == "treated"

    # -- 4a. Create material with a unit_cost of 10 000 UZS / gram ---------
    material_resp = api_client.post(
        "/api/v1/materials/",
        data={
            "name": "Composite Z250",
            "unit": "gram",
            "quantityInStock": "50.000",
            "minimumThreshold": "5.000",
            "unitCost": "10000.00",
            "notes": "Filling composite.",
        },
        format="json",
    )
    assert material_resp.status_code == status.HTTP_201_CREATED, material_resp.content
    material_id = material_resp.json()["id"]

    # -- 4b. Record a MaterialUsage — 2 grams consumed ---------------------
    usage_resp = api_client.post(
        "/api/v1/material-usages/",
        data={
            "treatmentId": treatment_id,
            "materialId": material_id,
            "quantityUsed": "2.000",
        },
        format="json",
    )
    assert usage_resp.status_code == status.HTTP_201_CREATED, usage_resp.content

    # Stock decremented from 50 → 48 grams.
    material_after = api_client.get(f"/api/v1/materials/{material_id}/")
    assert material_after.status_code == status.HTTP_200_OK, material_after.content
    assert Decimal(material_after.json()["quantityInStock"]) == Decimal("48.000")

    # -- 5. Upload photo (in-memory PNG) -----------------------------------
    upload = SimpleUploadedFile(
        name="before.png",
        content=_make_png_bytes(),
        content_type="image/png",
    )
    photo_resp = api_client.post(
        f"/api/v1/treatments/{treatment_id}/photos/",
        data={"photoType": "before", "image": upload, "caption": "Boshlanish"},
        format="multipart",
    )
    assert photo_resp.status_code == status.HTTP_201_CREATED, photo_resp.content
    assert photo_resp.json()["photoType"] == "before"

    # -- 6. Post a full payment (500 000 UZS) ------------------------------
    payment_resp = admin_client.post(
        "/api/v1/payments/",
        data={
            "treatmentId": treatment_id,
            "amount": "500000.00",
            "method": "cash",
            "note": "Full cash payment",
        },
        format="json",
    )
    assert payment_resp.status_code == status.HTTP_201_CREATED, payment_resp.content

    # -- 7a. Patient balance — expect 0 owed after full payment ------------
    balance_resp = api_client.get(f"/api/v1/patients/{patient_id}/balance/")
    assert balance_resp.status_code == status.HTTP_200_OK, balance_resp.content
    balance_body = balance_resp.json()
    assert Decimal(balance_body["totalBilled"]) == Decimal("500000.00")
    assert Decimal(balance_body["totalPaid"]) == Decimal("500000.00")
    assert Decimal(balance_body["balance"]) == Decimal("0.00")

    # -- 7b. Doctor commissions — 30% of 500 000 = 150 000 -----------------
    commissions_resp = api_client.get(
        f"/api/v1/doctors/{doctor_id}/commissions/"
    )
    assert commissions_resp.status_code == status.HTTP_200_OK, commissions_resp.content
    commissions = commissions_resp.json()
    assert len(commissions) == 1
    only = commissions[0]
    assert Decimal(only["amount"]) == Decimal("150000.00")
    assert only["basis"] == "from_total"
    assert Decimal(only["rate"]) == Decimal("30.00")
    # baseAmount = price for from_total.
    assert Decimal(only["baseAmount"]) == Decimal("500000.00")

    # -- 7c. Treatment now flagged as paid ---------------------------------
    treatment_after = api_client.get(f"/api/v1/treatments/{treatment_id}/")
    assert treatment_after.status_code == status.HTTP_200_OK, treatment_after.content
    assert treatment_after.json()["paymentStatus"] == "paid"
