"""Tests for the ``departments`` app (T7).

Covers PROJECT_BRIEF acceptance criteria:
    * #4 RBAC — only bosh_shifokor can create/update/delete departments
    * #6 CRUD — list, create, retrieve, update, soft-delete endpoints
    * pagination envelope + standard error envelope
"""
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from apps.departments.models import Department
from apps.departments.services import (
    create_department,
    soft_delete_department,
    update_department,
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
def test_create_department_service_normalises_and_persists(head_doctor):
    dept = create_department(
        name="  Terapiya  ", description="Umumiy terapiya bo'limi", created_by=head_doctor
    )
    assert dept.pk is not None
    assert dept.name == "Terapiya"
    assert dept.description == "Umumiy terapiya bo'limi"
    assert dept.is_active is True
    assert dept.created_by_id == head_doctor.pk


def test_create_department_rejects_empty_name(head_doctor):
    from django.core.exceptions import ValidationError

    with pytest.raises(ValidationError):
        create_department(name="   ", created_by=head_doctor)


def test_create_department_rejects_duplicate_name_case_insensitive(head_doctor):
    from django.core.exceptions import ValidationError

    create_department(name="Ortopediya", created_by=head_doctor)
    with pytest.raises(ValidationError):
        create_department(name="ortopediya", created_by=head_doctor)


def test_update_department_service_partial_update(head_doctor):
    dept = create_department(name="Xirurgiya", created_by=head_doctor)
    updated = update_department(dept, description="Xirurgik muolajalar")
    assert updated.name == "Xirurgiya"
    assert updated.description == "Xirurgik muolajalar"


def test_update_department_rejects_duplicate_name(head_doctor):
    from django.core.exceptions import ValidationError

    create_department(name="A", created_by=head_doctor)
    b = create_department(name="B", created_by=head_doctor)
    with pytest.raises(ValidationError):
        update_department(b, name="a")


def test_soft_delete_flips_is_active(head_doctor):
    dept = create_department(name="Ortodontiya", created_by=head_doctor)
    soft_delete_department(dept)
    dept.refresh_from_db()
    assert dept.is_active is False
    # Row is not physically removed:
    assert Department.objects.filter(pk=dept.pk).exists()


# ===========================================================================
# HTTP: list
# ===========================================================================
LIST_URL = "/api/v1/departments/"


def test_list_requires_authentication(api_client):
    response = api_client.get(LIST_URL)
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    body = response.json()
    assert body["error"]["code"] in {"NOT_AUTHENTICATED", "AUTHENTICATION_FAILED"}


def test_list_returns_pagination_envelope(api_client, head_doctor):
    create_department(name="Terapiya", created_by=head_doctor)
    create_department(name="Xirurgiya", created_by=head_doctor)

    _auth(api_client, head_doctor)
    response = api_client.get(LIST_URL)
    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert set(body.keys()) == {"count", "next", "previous", "results"}
    assert body["count"] == 2
    names = {row["name"] for row in body["results"]}
    assert names == {"Terapiya", "Xirurgiya"}


def test_list_hides_inactive_by_default(api_client, head_doctor):
    active = create_department(name="Active", created_by=head_doctor)
    inactive = create_department(name="Inactive", created_by=head_doctor)
    soft_delete_department(inactive)

    _auth(api_client, head_doctor)
    response = api_client.get(LIST_URL)
    body = response.json()
    ids = {row["id"] for row in body["results"]}
    assert str(active.id) in ids
    assert str(inactive.id) not in ids


def test_include_inactive_only_for_bosh_shifokor(
    api_client, head_doctor, doctor
):
    active = create_department(name="Active", created_by=head_doctor)
    inactive = create_department(name="Inactive", created_by=head_doctor)
    soft_delete_department(inactive)

    _auth(api_client, head_doctor)
    response = api_client.get(f"{LIST_URL}?include_inactive=true")
    body = response.json()
    ids = {row["id"] for row in body["results"]}
    assert {str(active.id), str(inactive.id)}.issubset(ids)

    # Doctor should NOT be able to see inactive ones even with the flag.
    api_client.force_authenticate(user=doctor)
    response = api_client.get(f"{LIST_URL}?include_inactive=true")
    body = response.json()
    ids = {row["id"] for row in body["results"]}
    assert str(inactive.id) not in ids


def test_list_search_by_name(api_client, head_doctor):
    create_department(name="Terapiya", created_by=head_doctor)
    create_department(name="Xirurgiya", created_by=head_doctor)

    _auth(api_client, head_doctor)
    response = api_client.get(f"{LIST_URL}?search=xir")
    body = response.json()
    assert body["count"] == 1
    assert body["results"][0]["name"] == "Xirurgiya"


def test_list_visible_to_all_authenticated_roles(
    api_client, head_doctor, doctor, administrator
):
    create_department(name="Terapiya", created_by=head_doctor)

    for user in (head_doctor, doctor, administrator):
        api_client.force_authenticate(user=user)
        response = api_client.get(LIST_URL)
        assert response.status_code == status.HTTP_200_OK, (
            f"Role {user.role} should be able to list departments"
        )
        assert response.json()["count"] == 1


# ===========================================================================
# HTTP: create (RBAC)
# ===========================================================================
def test_create_as_bosh_shifokor(api_client, head_doctor):
    _auth(api_client, head_doctor)
    response = api_client.post(
        LIST_URL,
        data={"name": "Yangi bo'lim", "description": "Tavsif"},
        format="json",
    )
    assert response.status_code == status.HTTP_201_CREATED, response.content
    body = response.json()
    assert body["name"] == "Yangi bo'lim"
    assert body["description"] == "Tavsif"
    assert body["isActive"] is True
    assert body["createdBy"]["id"] == str(head_doctor.pk)
    assert Department.objects.filter(name="Yangi bo'lim").exists()


def test_create_forbidden_for_doctor(api_client, doctor):
    _auth(api_client, doctor)
    response = api_client.post(
        LIST_URL,
        data={"name": "Never Created"},
        format="json",
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN
    body = response.json()
    assert body["error"]["code"] == "PERMISSION_DENIED"
    assert not Department.objects.filter(name="Never Created").exists()


def test_create_forbidden_for_administrator(api_client, administrator):
    _auth(api_client, administrator)
    response = api_client.post(LIST_URL, data={"name": "Nope"}, format="json")
    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_create_rejects_empty_name(api_client, head_doctor):
    _auth(api_client, head_doctor)
    response = api_client.post(LIST_URL, data={"name": "   "}, format="json")
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"


def test_create_rejects_duplicate(api_client, head_doctor):
    create_department(name="Terapiya", created_by=head_doctor)
    _auth(api_client, head_doctor)
    response = api_client.post(LIST_URL, data={"name": "terapiya"}, format="json")
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"


# ===========================================================================
# HTTP: retrieve
# ===========================================================================
def test_retrieve_returns_camel_case_shape(api_client, head_doctor):
    dept = create_department(
        name="Terapiya", description="izoh", created_by=head_doctor
    )
    _auth(api_client, head_doctor)
    response = api_client.get(f"{LIST_URL}{dept.id}/")
    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert set(body.keys()) >= {
        "id",
        "name",
        "description",
        "isActive",
        "createdAt",
        "updatedAt",
        "createdBy",
    }
    assert body["id"] == str(dept.id)
    assert body["isActive"] is True


def test_retrieve_missing_returns_standard_envelope(api_client, head_doctor):
    _auth(api_client, head_doctor)
    response = api_client.get(f"{LIST_URL}00000000-0000-0000-0000-000000000000/")
    assert response.status_code == status.HTTP_404_NOT_FOUND
    body = response.json()
    assert body["error"]["code"] == "NOT_FOUND"


# ===========================================================================
# HTTP: update (RBAC)
# ===========================================================================
def test_patch_as_bosh_shifokor(api_client, head_doctor):
    dept = create_department(name="Terapiya", created_by=head_doctor)
    _auth(api_client, head_doctor)
    response = api_client.patch(
        f"{LIST_URL}{dept.id}/",
        data={"description": "Yangilangan tavsif"},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["description"] == "Yangilangan tavsif"


def test_patch_forbidden_for_doctor(api_client, head_doctor, doctor):
    dept = create_department(name="Terapiya", created_by=head_doctor)
    _auth(api_client, doctor)
    response = api_client.patch(
        f"{LIST_URL}{dept.id}/",
        data={"description": "should-not-work"},
        format="json",
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_patch_rejects_duplicate_name(api_client, head_doctor):
    a = create_department(name="A", created_by=head_doctor)
    b = create_department(name="B", created_by=head_doctor)
    _auth(api_client, head_doctor)
    response = api_client.patch(
        f"{LIST_URL}{b.id}/", data={"name": "a"}, format="json"
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    a.refresh_from_db()
    b.refresh_from_db()
    assert a.name == "A"
    assert b.name == "B"


# ===========================================================================
# HTTP: delete (soft)
# ===========================================================================
def test_delete_as_bosh_shifokor_soft_deletes(api_client, head_doctor):
    dept = create_department(name="Terapiya", created_by=head_doctor)
    _auth(api_client, head_doctor)
    response = api_client.delete(f"{LIST_URL}{dept.id}/")
    assert response.status_code == status.HTTP_204_NO_CONTENT
    dept.refresh_from_db()
    assert dept.is_active is False  # soft delete


def test_delete_forbidden_for_administrator(api_client, head_doctor, administrator):
    dept = create_department(name="Terapiya", created_by=head_doctor)
    _auth(api_client, administrator)
    response = api_client.delete(f"{LIST_URL}{dept.id}/")
    assert response.status_code == status.HTTP_403_FORBIDDEN
    dept.refresh_from_db()
    assert dept.is_active is True
