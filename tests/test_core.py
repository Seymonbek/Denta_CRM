"""Unit tests for the ``apps.core`` primitives (T3).

These are hermetic tests: they build small DRF views in-memory,
route them through Django's test client via a temporary urlconf,
and assert the standard pagination + error envelopes.

No database migrations are required — the views serve fixed data.
"""
from __future__ import annotations

import unittest.mock as mock
from types import SimpleNamespace
from typing import Any

import pytest
from django.test import RequestFactory
from django.urls import path
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.test import APIClient
from rest_framework.views import APIView

from apps.core.pagination import StandardResultsSetPagination
from apps.core.permissions import (
    ALL_ROLES,
    ROLE_ADMINISTRATOR,
    ROLE_BOSH_SHIFOKOR,
    ROLE_DOCTOR,
    IsAdministrator,
    IsBoshShifokor,
    IsBoshShifokorOrAdministrator,
    IsBoshShifokorOrDoctor,
    IsDoctor,
    IsOwnerDoctorOrPermitted,
)


# ---------------------------------------------------------------------------
# Temporary URLconf: tiny views used to exercise pagination & error handler.
# ---------------------------------------------------------------------------
class _PaginatedNumbers(APIView):
    """Return a paginated list of 42 integers using the standard paginator."""

    authentication_classes: list[Any] = []
    permission_classes: list[Any] = []

    def get(self, request):
        queryset = list(range(1, 43))  # 42 items → 3 pages @ page_size=20
        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(page)


class _RaiseValidation(APIView):
    """Always raises a DRF ValidationError; used to check the envelope."""

    authentication_classes: list[Any] = []
    permission_classes: list[Any] = []

    def get(self, request):
        raise ValidationError({"phone_number": ["Bu telefon raqami band."]})


class _RaisePermission(APIView):
    """Always raises PermissionDenied to check code=PERMISSION_DENIED."""

    authentication_classes: list[Any] = []
    permission_classes: list[Any] = []

    def get(self, request):
        raise PermissionDenied("Sizga ruxsat berilmagan.")


class _RaiseUnhandled(APIView):
    """Raises a plain ``RuntimeError`` — should map to INTERNAL_ERROR."""

    authentication_classes: list[Any] = []
    permission_classes: list[Any] = []

    def get(self, request):
        raise RuntimeError("boom")


urlpatterns = [
    path("_test/paginated/", _PaginatedNumbers.as_view()),
    path("_test/validation/", _RaiseValidation.as_view()),
    path("_test/permission/", _RaisePermission.as_view()),
    path("_test/unhandled/", _RaiseUnhandled.as_view()),
]


# ---------------------------------------------------------------------------
# Pagination
# ---------------------------------------------------------------------------
@pytest.mark.urls(__name__)
def test_pagination_returns_standard_envelope() -> None:
    client = APIClient()
    response = client.get("/_test/paginated/")

    assert response.status_code == 200
    body = response.json()
    # Envelope keys required by PROJECT_BRIEF.
    assert set(body.keys()) == {"count", "next", "previous", "results"}
    assert body["count"] == 42
    # Default page size is 20 → first page has 20 items.
    assert len(body["results"]) == 20
    assert body["previous"] is None
    assert body["next"] is not None


@pytest.mark.urls(__name__)
def test_pagination_respects_page_size_query_param() -> None:
    client = APIClient()
    response = client.get("/_test/paginated/?page_size=5")
    assert response.status_code == 200
    body = response.json()
    assert len(body["results"]) == 5
    assert body["count"] == 42


@pytest.mark.urls(__name__)
def test_pagination_max_page_size_is_enforced() -> None:
    client = APIClient()
    response = client.get("/_test/paginated/?page_size=9999")
    body = response.json()
    # Should clamp to max_page_size (100) but total is only 42.
    assert len(body["results"]) == 42


# ---------------------------------------------------------------------------
# Error envelope
# ---------------------------------------------------------------------------
@pytest.mark.urls(__name__)
def test_validation_error_uses_standard_envelope() -> None:
    client = APIClient()
    response = client.get("/_test/validation/")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    body = response.json()
    assert set(body.keys()) == {"error"}
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert isinstance(body["error"]["message"], str)
    assert body["error"]["message"]  # non-empty
    assert body["error"]["details"] == {"phone_number": ["Bu telefon raqami band."]}


@pytest.mark.urls(__name__)
def test_permission_denied_error_envelope() -> None:
    client = APIClient()
    response = client.get("/_test/permission/")
    assert response.status_code == status.HTTP_403_FORBIDDEN
    body = response.json()
    assert body["error"]["code"] == "PERMISSION_DENIED"
    assert body["error"]["message"] == "Sizga ruxsat berilmagan."


@pytest.mark.urls(__name__)
def test_unhandled_exception_returns_internal_error_envelope() -> None:
    client = APIClient(raise_request_exception=False)
    response = client.get("/_test/unhandled/")
    assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    body = response.json()
    assert body["error"]["code"] == "INTERNAL_ERROR"
    assert body["error"]["message"] == "Internal server error."
    assert body["error"]["details"] == {}


# ---------------------------------------------------------------------------
# Permission classes
# ---------------------------------------------------------------------------
def _make_request(role: str | None, authenticated: bool = True):
    """Build a lightweight request object with a fake user."""
    request = RequestFactory().get("/")
    user = SimpleNamespace(
        id=1,
        role=role,
        is_authenticated=authenticated,
    )
    request.user = user
    return request


@pytest.mark.parametrize(
    "permission_cls, allowed_role",
    [
        (IsBoshShifokor, ROLE_BOSH_SHIFOKOR),
        (IsDoctor, ROLE_DOCTOR),
        (IsAdministrator, ROLE_ADMINISTRATOR),
    ],
)
def test_single_role_permission_only_grants_matching_role(
    permission_cls, allowed_role
) -> None:
    view = mock.Mock()
    permission = permission_cls()

    # Matching role → allowed
    assert permission.has_permission(_make_request(allowed_role), view) is True

    # Other roles → denied
    for other in ALL_ROLES - {allowed_role}:
        assert permission.has_permission(_make_request(other), view) is False

    # Anonymous → denied
    request = _make_request(None, authenticated=False)
    assert permission.has_permission(request, view) is False


def test_or_combiner_permissions() -> None:
    view = mock.Mock()

    combo1 = IsBoshShifokorOrDoctor()
    assert combo1.has_permission(_make_request(ROLE_BOSH_SHIFOKOR), view) is True
    assert combo1.has_permission(_make_request(ROLE_DOCTOR), view) is True
    assert combo1.has_permission(_make_request(ROLE_ADMINISTRATOR), view) is False

    combo2 = IsBoshShifokorOrAdministrator()
    assert combo2.has_permission(_make_request(ROLE_BOSH_SHIFOKOR), view) is True
    assert combo2.has_permission(_make_request(ROLE_ADMINISTRATOR), view) is True
    assert combo2.has_permission(_make_request(ROLE_DOCTOR), view) is False


def test_is_owner_doctor_or_permitted_grants_bosh_shifokor_all() -> None:
    permission = IsOwnerDoctorOrPermitted()
    request = _make_request(ROLE_BOSH_SHIFOKOR)
    view = SimpleNamespace()
    # Object with a foreign doctor still allowed for bosh_shifokor.
    obj = SimpleNamespace(doctor=SimpleNamespace(user_id=999))
    assert permission.has_object_permission(request, view, obj) is True


def test_is_owner_doctor_or_permitted_grants_owning_doctor() -> None:
    permission = IsOwnerDoctorOrPermitted()
    request = _make_request(ROLE_DOCTOR)
    request.user.doctor_profile = SimpleNamespace(can_view_other_doctors=False)
    view = SimpleNamespace()
    # Doctor owns the object (user_id matches request.user.id).
    obj = SimpleNamespace(doctor=SimpleNamespace(user_id=1))
    assert permission.has_object_permission(request, view, obj) is True


def test_is_owner_doctor_or_permitted_blocks_other_doctor_without_flag() -> None:
    permission = IsOwnerDoctorOrPermitted()
    request = _make_request(ROLE_DOCTOR)
    request.user.doctor_profile = SimpleNamespace(can_view_other_doctors=False)
    view = SimpleNamespace()
    obj = SimpleNamespace(doctor=SimpleNamespace(user_id=42))
    assert permission.has_object_permission(request, view, obj) is False


def test_is_owner_doctor_or_permitted_allows_other_doctor_with_flag() -> None:
    permission = IsOwnerDoctorOrPermitted()
    request = _make_request(ROLE_DOCTOR)
    request.user.doctor_profile = SimpleNamespace(can_view_other_doctors=True)
    view = SimpleNamespace()
    obj = SimpleNamespace(doctor=SimpleNamespace(user_id=42))
    assert permission.has_object_permission(request, view, obj) is True


def test_is_owner_doctor_or_permitted_admin_read_only() -> None:
    permission = IsOwnerDoctorOrPermitted()
    obj = SimpleNamespace(doctor=SimpleNamespace(user_id=42))

    # Administrator with allow_admin_read=True → can read
    view = SimpleNamespace(allow_admin_read=True)
    request = _make_request(ROLE_ADMINISTRATOR)
    assert permission.has_object_permission(request, view, obj) is True

    # But POST/PATCH are still denied.
    request = RequestFactory().patch("/")
    request.user = SimpleNamespace(id=1, role=ROLE_ADMINISTRATOR, is_authenticated=True)
    assert permission.has_object_permission(request, view, obj) is False

    # Administrator without allow_admin_read flag → denied.
    view = SimpleNamespace()
    request = _make_request(ROLE_ADMINISTRATOR)
    assert permission.has_object_permission(request, view, obj) is False


def test_is_owner_doctor_or_permitted_view_hook_used_when_available() -> None:
    """Views can override owner resolution via ``get_owner_doctor``."""
    permission = IsOwnerDoctorOrPermitted()
    request = _make_request(ROLE_DOCTOR)
    request.user.doctor_profile = SimpleNamespace(can_view_other_doctors=False)

    owning_doctor = SimpleNamespace(user_id=1)

    class _ViewWithHook:
        allow_admin_read = False

        def get_owner_doctor(self, obj):
            return owning_doctor

    obj = SimpleNamespace()  # no ``doctor`` attribute — hook is required
    assert permission.has_object_permission(request, _ViewWithHook(), obj) is True
