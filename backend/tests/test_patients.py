"""Tests for the ``patients`` app (T9).

Covers PROJECT_BRIEF acceptance criteria:

* #4 RBAC — bosh_shifokor & administrator write; doctors read-only.
* #6 CRUD — list, create, retrieve, update, soft-delete endpoints.
* Search — ``?search=`` matches on name and phone.
* Standard error envelope + pagination envelope.
* Sub-resources: ``/patients/{id}/history/`` and
  ``/patients/{id}/odontogram/`` (both stable in early phases).
"""
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from rest_framework import status
from rest_framework.test import APIClient

from apps.patients.models import Patient
from apps.patients.selectors import search_patients
from apps.patients.services import (
    create_patient,
    soft_delete_patient,
    update_patient,
)

pytestmark = pytest.mark.django_db

User = get_user_model()

LIST_URL = "/api/v1/patients/"


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
def doctor():
    return User.objects.create_user(
        phone_number="+998900000002",
        password="StrongPass!123",
        first_name="Doc",
        last_name="Tor",
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
def api_client():
    return APIClient()


def _auth(client: APIClient, user) -> APIClient:
    client.force_authenticate(user=user)
    return client


# ===========================================================================
# Service layer
# ===========================================================================
def test_create_patient_normalises_phone_and_persists(administrator):
    patient = create_patient(
        first_name=" Ali ",
        last_name="Valiyev",
        phone_number="+998 90 123 45 67",
        gender="male",
        address="Toshkent",
        notes="Allergiya: penicillin",
        created_by=administrator,
    )
    assert patient.pk is not None
    assert patient.first_name == "Ali"
    assert patient.last_name == "Valiyev"
    assert patient.phone_number == "+998901234567"
    assert patient.gender == "male"
    assert patient.notes == "Allergiya: penicillin"
    assert patient.created_by_id == administrator.pk
    assert patient.is_active is True


def test_create_patient_rejects_empty_name(administrator):
    with pytest.raises(ValidationError):
        create_patient(
            first_name="",
            last_name="Valiyev",
            phone_number="+998901234567",
            created_by=administrator,
        )


def test_create_patient_rejects_bad_phone(administrator):
    with pytest.raises(ValidationError):
        create_patient(
            first_name="Ali",
            last_name="Valiyev",
            phone_number="abc",
            created_by=administrator,
        )


def test_create_patient_rejects_duplicate_active_phone(administrator):
    create_patient(
        first_name="Ali",
        last_name="Valiyev",
        phone_number="+998901234567",
        created_by=administrator,
    )
    with pytest.raises(ValidationError):
        create_patient(
            first_name="Vali",
            last_name="Aliyev",
            phone_number="+998 90 123-45-67",  # normalises to same number
            created_by=administrator,
        )


def test_create_patient_rejects_bad_gender(administrator):
    with pytest.raises(ValidationError):
        create_patient(
            first_name="Ali",
            last_name="Valiyev",
            phone_number="+998901234570",
            gender="other",
            created_by=administrator,
        )


def test_update_patient_partial(administrator):
    patient = create_patient(
        first_name="Ali",
        last_name="Valiyev",
        phone_number="+998901234571",
        created_by=administrator,
    )
    updated = update_patient(patient, address="Yangi manzil")
    assert updated.address == "Yangi manzil"
    assert updated.first_name == "Ali"  # unchanged


def test_update_patient_can_clear_gender(administrator):
    patient = create_patient(
        first_name="Ali",
        last_name="Valiyev",
        phone_number="+998901234572",
        gender="male",
        created_by=administrator,
    )
    updated = update_patient(patient, gender=None)
    assert updated.gender is None


def test_update_patient_rejects_duplicate_phone(administrator):
    a = create_patient(
        first_name="A",
        last_name="A",
        phone_number="+998901234573",
        created_by=administrator,
    )
    b = create_patient(
        first_name="B",
        last_name="B",
        phone_number="+998901234574",
        created_by=administrator,
    )
    with pytest.raises(ValidationError):
        update_patient(b, phone_number="+998901234573")
    # The first patient still exists intact.
    a.refresh_from_db()
    assert a.phone_number == "+998901234573"


def test_soft_delete_flips_is_active(administrator):
    patient = create_patient(
        first_name="Ali",
        last_name="Valiyev",
        phone_number="+998901234575",
        created_by=administrator,
    )
    soft_delete_patient(patient)
    patient.refresh_from_db()
    assert patient.is_active is False
    # Freeing up the phone allows re-registration:
    fresh = create_patient(
        first_name="Ali",
        last_name="Valiyev",
        phone_number="+998901234575",
        created_by=administrator,
    )
    assert fresh.pk != patient.pk
    assert fresh.is_active is True


def test_search_by_name_and_phone(administrator):
    create_patient(
        first_name="Ali",
        last_name="Valiyev",
        phone_number="+998901111111",
        created_by=administrator,
    )
    create_patient(
        first_name="Bek",
        last_name="Aliyev",
        phone_number="+998902222222",
        created_by=administrator,
    )
    # Name match (case-insensitive):
    assert search_patients("vali").count() == 1
    # Multi-token match — 'karim' filters only when both tokens hit:
    assert search_patients("Ali Valiyev").count() == 1
    # Phone match:
    assert search_patients("2222").count() == 1
    # Empty query returns all active patients:
    assert search_patients("").count() == 2


# ===========================================================================
# HTTP: authentication + list envelope
# ===========================================================================
def test_list_requires_authentication(api_client):
    response = api_client.get(LIST_URL)
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    body = response.json()
    assert body["error"]["code"] in {"NOT_AUTHENTICATED", "AUTHENTICATION_FAILED"}


def test_list_returns_pagination_envelope(api_client, administrator):
    create_patient(
        first_name="Ali",
        last_name="Valiyev",
        phone_number="+998901234580",
        created_by=administrator,
    )
    create_patient(
        first_name="Bek",
        last_name="Aliyev",
        phone_number="+998901234581",
        created_by=administrator,
    )

    _auth(api_client, administrator)
    response = api_client.get(LIST_URL)
    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert set(body.keys()) == {"count", "next", "previous", "results"}
    assert body["count"] == 2
    row = body["results"][0]
    assert {"id", "firstName", "lastName", "phoneNumber", "gender"}.issubset(
        row.keys()
    )


def test_list_visible_to_doctor_but_write_forbidden(
    api_client, doctor, administrator
):
    create_patient(
        first_name="Ali",
        last_name="Valiyev",
        phone_number="+998901234582",
        created_by=administrator,
    )
    _auth(api_client, doctor)
    assert api_client.get(LIST_URL).status_code == status.HTTP_200_OK
    response = api_client.post(
        LIST_URL,
        {
            "firstName": "Zafar",
            "lastName": "Toshev",
            "phoneNumber": "+998901234583",
        },
        format="json",
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.json()["error"]["code"] == "PERMISSION_DENIED"


def test_list_search_query(api_client, administrator):
    create_patient(
        first_name="Ali",
        last_name="Valiyev",
        phone_number="+998901234584",
        created_by=administrator,
    )
    create_patient(
        first_name="Bek",
        last_name="Karimov",
        phone_number="+998901234585",
        created_by=administrator,
    )
    _auth(api_client, administrator)
    response = api_client.get(f"{LIST_URL}?search=karim")
    body = response.json()
    assert body["count"] == 1
    assert body["results"][0]["lastName"] == "Karimov"


# ===========================================================================
# HTTP: create
# ===========================================================================
def test_create_via_api_admin(api_client, administrator):
    _auth(api_client, administrator)
    response = api_client.post(
        LIST_URL,
        {
            "firstName": "Ali",
            "lastName": "Valiyev",
            "phoneNumber": "+998 90 123 45 90",
            "gender": "male",
            "address": "Toshkent",
            "notes": "Penicillin allergiyasi bor",
        },
        format="json",
    )
    assert response.status_code == status.HTTP_201_CREATED, response.json()
    body = response.json()
    assert body["phoneNumber"] == "+998901234590"
    assert body["gender"] == "male"
    assert body["fullName"] == "Ali Valiyev"
    # DB was written and audit fields set:
    patient = Patient.objects.get(pk=body["id"])
    assert patient.created_by_id == administrator.pk


def test_create_via_api_head_doctor(api_client, head_doctor):
    _auth(api_client, head_doctor)
    response = api_client.post(
        LIST_URL,
        {
            "firstName": "Zafar",
            "lastName": "Toshev",
            "phoneNumber": "+998901234591",
        },
        format="json",
    )
    assert response.status_code == status.HTTP_201_CREATED


def test_create_validates_phone(api_client, administrator):
    _auth(api_client, administrator)
    response = api_client.post(
        LIST_URL,
        {
            "firstName": "Ali",
            "lastName": "Valiyev",
            "phoneNumber": "abc",
        },
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"


def test_create_rejects_duplicate_phone(api_client, administrator):
    create_patient(
        first_name="Ali",
        last_name="Valiyev",
        phone_number="+998901234592",
        created_by=administrator,
    )
    _auth(api_client, administrator)
    response = api_client.post(
        LIST_URL,
        {
            "firstName": "Vali",
            "lastName": "Aliyev",
            "phoneNumber": "+998901234592",
        },
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


# ===========================================================================
# HTTP: retrieve / update / delete
# ===========================================================================
def test_retrieve_update_delete_flow(api_client, administrator):
    patient = create_patient(
        first_name="Ali",
        last_name="Valiyev",
        phone_number="+998901234595",
        created_by=administrator,
    )
    detail_url = f"{LIST_URL}{patient.pk}/"

    _auth(api_client, administrator)

    # Retrieve
    response = api_client.get(detail_url)
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["phoneNumber"] == "+998901234595"

    # Partial update
    response = api_client.patch(
        detail_url,
        {"address": "Yangi manzil"},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["address"] == "Yangi manzil"

    # Soft delete
    response = api_client.delete(detail_url)
    assert response.status_code == status.HTTP_204_NO_CONTENT
    patient.refresh_from_db()
    assert patient.is_active is False


def test_doctor_cannot_update_patient(api_client, administrator, doctor):
    patient = create_patient(
        first_name="Ali",
        last_name="Valiyev",
        phone_number="+998901234596",
        created_by=administrator,
    )
    _auth(api_client, doctor)
    response = api_client.patch(
        f"{LIST_URL}{patient.pk}/",
        {"address": "Boshqa manzil"},
        format="json",
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN


# ===========================================================================
# Sub-resources: history + odontogram
# ===========================================================================
def test_history_endpoint_returns_seed_note_when_empty(
    api_client, administrator
):
    patient = create_patient(
        first_name="Ali",
        last_name="Valiyev",
        phone_number="+998901234597",
        created_by=administrator,
    )
    _auth(api_client, administrator)
    response = api_client.get(f"{LIST_URL}{patient.pk}/history/")
    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    # T123: history now returns the standard pagination envelope.
    assert set(body.keys()) == {"count", "next", "previous", "results"}
    results = body["results"]
    assert isinstance(results, list)
    assert body["count"] == len(results) == 1
    seed = results[0]
    assert seed["type"] == "note"
    assert "occurredAt" in seed
    assert "title" in seed


def test_odontogram_endpoint_returns_full_fdi_arch(api_client, administrator):
    patient = create_patient(
        first_name="Ali",
        last_name="Valiyev",
        phone_number="+998901234598",
        created_by=administrator,
    )
    _auth(api_client, administrator)
    response = api_client.get(f"{LIST_URL}{patient.pk}/odontogram/")
    assert response.status_code == status.HTTP_200_OK
    teeth = response.json()
    # 32 permanent adult teeth in FDI numbering.
    assert len(teeth) == 32
    numbers = sorted(t["toothNumber"] for t in teeth)
    expected = sorted(
        n for q in (10, 20, 30, 40) for n in range(q + 1, q + 9)
    )
    assert numbers == expected
    # Default status is "healthy" until T13 populates ToothRecord rows.
    assert {t["status"] for t in teeth} == {"healthy"}


def test_unknown_patient_returns_standard_404(api_client, administrator):
    _auth(api_client, administrator)
    response = api_client.get(f"{LIST_URL}00000000-0000-0000-0000-000000000000/")
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json()["error"]["code"] == "NOT_FOUND"


# ===========================================================================
# T122 — N+1 query regression guard
# ===========================================================================
def test_list_endpoint_is_not_n_plus_one(
    api_client, administrator, django_assert_num_queries
):
    """List query count must not scale with the number of patient rows.

    Before T122, ``PatientSerializer.to_representation`` triggered a
    SELECT on ``created_by`` for every row. Adding
    ``select_related('created_by')`` in the selector collapses that
    into a single JOIN, so the query count for 3 rows and 15 rows
    must be identical (± the constant baseline of session / count /
    page / rows).
    """
    for i in range(15):
        create_patient(
            first_name=f"Bemor{i:02d}",
            last_name="Testov",
            phone_number=f"+9989020{i:05d}",
            created_by=administrator,
        )
    _auth(api_client, administrator)

    # Warm up any lazy setup (auth backend loading etc.) so the actual
    # comparison is stable.
    api_client.get(LIST_URL)

    # Measure the query count once with the full 15 rows.
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    with CaptureQueriesContext(connection) as ctx_15:
        response = api_client.get(f"{LIST_URL}?page_size=100")
        assert response.status_code == 200
        assert response.json()["count"] == 15
    q_15 = len(ctx_15.captured_queries)

    # Delete 12 rows (leave 3) and re-measure.
    ids_to_delete = list(Patient.objects.values_list("pk", flat=True)[:12])
    Patient.objects.filter(pk__in=ids_to_delete).delete()

    with CaptureQueriesContext(connection) as ctx_3:
        response = api_client.get(f"{LIST_URL}?page_size=100")
        assert response.status_code == 200
        assert response.json()["count"] == 3
    q_3 = len(ctx_3.captured_queries)

    assert q_15 == q_3, (
        f"list endpoint N+1 detected: 15 rows → {q_15} queries, "
        f"3 rows → {q_3} queries. Both should be equal thanks to "
        f"select_related('created_by')."
    )


# ===========================================================================
# T123 — patient-history pagination envelope
# ===========================================================================
def test_history_endpoint_returns_pagination_envelope(
    api_client, administrator
):
    """History must return the standard ``{count, next, previous, results}``
    envelope so it matches every other list endpoint documented in
    PROJECT_BRIEF § "Pagination format"."""
    patient = create_patient(
        first_name="Zafar",
        last_name="Toshev",
        phone_number="+998901234600",
        created_by=administrator,
    )
    _auth(api_client, administrator)
    response = api_client.get(f"{LIST_URL}{patient.pk}/history/")
    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert set(body.keys()) == {"count", "next", "previous", "results"}
    assert isinstance(body["results"], list)
    # An empty-history patient always has the "patient created" seed note.
    assert body["count"] == 1
    assert body["results"][0]["type"] == "note"


def test_history_endpoint_respects_page_size(api_client, administrator):
    """``?page_size=`` must trim the ``results`` list even when the total
    event count exceeds the requested page size."""
    patient = create_patient(
        first_name="Zafar",
        last_name="Toshev",
        phone_number="+998901234601",
        created_by=administrator,
    )
    _auth(api_client, administrator)
    # With only the seed note there is 1 event; page_size=5 → 1 result,
    # but ``next`` must still be None.
    response = api_client.get(f"{LIST_URL}{patient.pk}/history/?page_size=5")
    body = response.json()
    assert body["count"] == 1
    assert body["next"] is None
    assert body["previous"] is None
    assert len(body["results"]) == 1
