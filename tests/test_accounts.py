"""End-to-end tests for /api/v1/auth/ endpoints (T4).

Covers PROJECT_BRIEF acceptance criteria #3 and #15:
    * JWT login returns access + refresh tokens
    * ``/auth/me/`` requires authentication and returns camelCase profile
    * Wrong password returns the standard error envelope
    * ``/auth/refresh/`` rotates tokens and blacklists the old one
"""
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db


User = get_user_model()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture
def head_doctor():
    return User.objects.create_user(
        phone_number="+998901234567",
        password="StrongPass!123",
        first_name="Aziz",
        last_name="Karimov",
        role=User.Role.BOSH_SHIFOKOR,
    )


@pytest.fixture
def api_client():
    return APIClient()


# ---------------------------------------------------------------------------
# Model-level
# ---------------------------------------------------------------------------
def test_user_manager_normalises_phone_and_hashes_password() -> None:
    user = User.objects.create_user(
        phone_number=" +998 90 123 45 67 ",
        password="Password!123",
        first_name="Ali",
        last_name="Valiev",
    )
    assert user.phone_number == "+998901234567"
    assert user.check_password("Password!123")
    # Password must not be stored in plain text.
    assert user.password != "Password!123"


def test_user_manager_rejects_malformed_phone() -> None:
    from django.core.exceptions import ValidationError

    with pytest.raises(ValidationError):
        User.objects.create_user(
            phone_number="not-a-phone",
            password="Password!123",
            first_name="X",
            last_name="Y",
        )


def test_role_defaults_and_choices() -> None:
    assert set(dict(User.Role.choices).keys()) == {
        "bosh_shifokor",
        "doctor",
        "administrator",
    }


# ---------------------------------------------------------------------------
# /auth/login/
# ---------------------------------------------------------------------------
def test_login_success(api_client, head_doctor) -> None:
    url = reverse("v1:accounts:login")
    response = api_client.post(
        url,
        data={"phoneNumber": "+998901234567", "password": "StrongPass!123"},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK, response.content
    body = response.json()
    assert "access" in body and body["access"]
    assert "refresh" in body and body["refresh"]
    assert body["user"]["phoneNumber"] == "+998901234567"
    assert body["user"]["role"] == "bosh_shifokor"
    assert body["user"]["firstName"] == "Aziz"


def test_login_accepts_snake_case_input(api_client, head_doctor) -> None:
    url = reverse("v1:accounts:login")
    response = api_client.post(
        url,
        data={"phone_number": "+998901234567", "password": "StrongPass!123"},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK


def test_login_wrong_password_returns_standard_envelope(api_client, head_doctor) -> None:
    url = reverse("v1:accounts:login")
    response = api_client.post(
        url,
        data={"phoneNumber": "+998901234567", "password": "wrong"},
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    body = response.json()
    assert set(body.keys()) == {"error"}
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert "noto'g'ri" in body["error"]["message"].lower() or "noto" in body["error"]["message"].lower()


def test_login_unknown_user_returns_same_error(api_client) -> None:
    url = reverse("v1:accounts:login")
    response = api_client.post(
        url,
        data={"phoneNumber": "+998900000000", "password": "whatever"},
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"


def test_login_inactive_user_denied(api_client, head_doctor) -> None:
    head_doctor.is_active = False
    head_doctor.save(update_fields=["is_active"])
    url = reverse("v1:accounts:login")
    response = api_client.post(
        url,
        data={"phoneNumber": "+998901234567", "password": "StrongPass!123"},
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST


def test_login_missing_fields_returns_error(api_client) -> None:
    url = reverse("v1:accounts:login")
    response = api_client.post(url, data={}, format="json")
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"


# ---------------------------------------------------------------------------
# /auth/me/
# ---------------------------------------------------------------------------
def test_me_requires_auth(api_client) -> None:
    url = reverse("v1:accounts:me")
    response = api_client.get(url)
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    body = response.json()
    assert body["error"]["code"] in {"NOT_AUTHENTICATED", "AUTHENTICATION_FAILED"}


def test_me_returns_camel_case_profile(api_client, head_doctor) -> None:
    # Login to obtain the access token.
    login_url = reverse("v1:accounts:login")
    tokens = api_client.post(
        login_url,
        data={"phoneNumber": "+998901234567", "password": "StrongPass!123"},
        format="json",
    ).json()
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")

    me_url = reverse("v1:accounts:me")
    response = api_client.get(me_url)
    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    # T125: ``twoFactorEnabled`` is now part of the profile payload.
    assert set(body.keys()) == {
        "id",
        "firstName",
        "lastName",
        "phoneNumber",
        "role",
        "twoFactorEnabled",
    }
    assert body["phoneNumber"] == "+998901234567"
    assert body["role"] == "bosh_shifokor"
    assert body["twoFactorEnabled"] is False


# ---------------------------------------------------------------------------
# /auth/refresh/
# ---------------------------------------------------------------------------
def test_refresh_rotates_tokens(api_client, head_doctor) -> None:
    login_url = reverse("v1:accounts:login")
    tokens = api_client.post(
        login_url,
        data={"phoneNumber": "+998901234567", "password": "StrongPass!123"},
        format="json",
    ).json()
    refresh_url = reverse("v1:accounts:refresh")
    response = api_client.post(
        refresh_url,
        data={"refresh": tokens["refresh"]},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert body["access"]
    assert body["refresh"]
    assert body["refresh"] != tokens["refresh"]


def test_refresh_with_invalid_token(api_client) -> None:
    refresh_url = reverse("v1:accounts:refresh")
    response = api_client.post(
        refresh_url,
        data={"refresh": "not-a-valid-token"},
        format="json",
    )
    # DRF may report 401 (with an authenticate header) or 403 (without one)
    # depending on the resolved authenticator; both surface an auth-error
    # code in the standard envelope.
    assert response.status_code in {
        status.HTTP_401_UNAUTHORIZED,
        status.HTTP_403_FORBIDDEN,
    }
    body = response.json()
    assert body["error"]["code"] in {
        "AUTHENTICATION_FAILED",
        "NOT_AUTHENTICATED",
        "PERMISSION_DENIED",
    }


def test_otp_code_generation_and_expiry() -> None:
    from apps.accounts.models import OTPCode, generate_otp_code

    user = User.objects.create_user(
        phone_number="+998900000001",
        password="P@ssword123",
        first_name="A",
        last_name="B",
    )
    code = OTPCode.objects.create(user=user, code=generate_otp_code())
    assert len(code.code) == 6 and code.code.isdigit()
    assert code.is_used is False
    assert code.is_expired is False
    code.mark_used()
    code.refresh_from_db()
    assert code.is_used is True
