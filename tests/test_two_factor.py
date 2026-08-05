"""Tests for T125 — two-factor authentication.

Covers the full 2FA lifecycle:

* Field is exposed as ``twoFactorEnabled`` on ``/auth/me/`` (see
  ``test_accounts.py`` for the base case).
* ``POST /auth/2fa/enable/`` — requires current password + telegram
  chat id; rejects otherwise.
* ``POST /auth/2fa/disable/`` — requires current password; noop when
  already off.
* ``POST /auth/login/`` — returns HTTP 202 ``{twoFactorRequired: True}``
  when the user has 2FA on, and issues a login OTP.
* ``POST /auth/2fa/verify/`` — validates OTP + credentials and returns
  a token pair identical to the 1-step flow.
* Uniform-error guarantee: wrong password vs wrong OTP surface the
  same message so an attacker cannot distinguish between them.
"""
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import OTPCode, generate_otp_code

pytestmark = pytest.mark.django_db

User = get_user_model()

LOGIN_URL = "/api/v1/auth/login/"
ME_URL = "/api/v1/auth/me/"
ENABLE_URL = "/api/v1/auth/2fa/enable/"
DISABLE_URL = "/api/v1/auth/2fa/disable/"
VERIFY_URL = "/api/v1/auth/2fa/verify/"

_PASSWORD = "StrongPass!123"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def user_with_telegram():
    user = User.objects.create_user(
        phone_number="+998901234570",
        password=_PASSWORD,
        first_name="TwoFactor",
        last_name="User",
        role=User.Role.DOCTOR,
    )
    user.telegram_chat_id = 111222333
    user.save(update_fields=["telegram_chat_id"])
    return user


@pytest.fixture
def user_without_telegram():
    return User.objects.create_user(
        phone_number="+998901234571",
        password=_PASSWORD,
        first_name="NoTelegram",
        last_name="User",
        role=User.Role.DOCTOR,
    )


def _login_tokens(client: APIClient, phone: str, password: str = _PASSWORD) -> dict:
    """Log in via the 1-step flow (returns access+refresh)."""
    response = client.post(
        LOGIN_URL,
        {"phoneNumber": phone, "password": password},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK, response.content
    return response.json()


def _auth(client: APIClient, access: str) -> None:
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")


# ===========================================================================
# Profile exposure
# ===========================================================================
def test_profile_exposes_two_factor_flag(api_client, user_with_telegram):
    tokens = _login_tokens(api_client, user_with_telegram.phone_number)
    _auth(api_client, tokens["access"])
    response = api_client.get(ME_URL)
    body = response.json()
    assert "twoFactorEnabled" in body
    assert body["twoFactorEnabled"] is False


# ===========================================================================
# Enable
# ===========================================================================
def test_enable_requires_auth(api_client):
    response = api_client.post(ENABLE_URL, {"password": _PASSWORD}, format="json")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


def test_enable_requires_correct_password(api_client, user_with_telegram):
    tokens = _login_tokens(api_client, user_with_telegram.phone_number)
    _auth(api_client, tokens["access"])
    response = api_client.post(
        ENABLE_URL, {"password": "wrong-password"}, format="json"
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"
    user_with_telegram.refresh_from_db()
    assert user_with_telegram.two_factor_enabled is False


def test_enable_requires_telegram_chat_id(api_client, user_without_telegram):
    tokens = _login_tokens(api_client, user_without_telegram.phone_number)
    _auth(api_client, tokens["access"])
    response = api_client.post(ENABLE_URL, {"password": _PASSWORD}, format="json")
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"
    # Message should mention Telegram so operators know why.
    detail = body["error"]["details"]
    payload = str(detail)
    assert "Telegram" in payload
    user_without_telegram.refresh_from_db()
    assert user_without_telegram.two_factor_enabled is False


def test_enable_succeeds_and_persists(api_client, user_with_telegram):
    tokens = _login_tokens(api_client, user_with_telegram.phone_number)
    _auth(api_client, tokens["access"])
    response = api_client.post(ENABLE_URL, {"password": _PASSWORD}, format="json")
    assert response.status_code == status.HTTP_200_OK, response.content
    body = response.json()
    assert body["twoFactorEnabled"] is True
    user_with_telegram.refresh_from_db()
    assert user_with_telegram.two_factor_enabled is True


def test_enable_when_already_enabled_returns_400(api_client, user_with_telegram):
    user_with_telegram.two_factor_enabled = True
    user_with_telegram.save(update_fields=["two_factor_enabled"])
    # A 2FA-enabled user cannot log in with a plain password, so bypass
    # the login step by minting a token directly.
    from rest_framework_simplejwt.tokens import RefreshToken

    access = str(RefreshToken.for_user(user_with_telegram).access_token)
    _auth(api_client, access)
    response = api_client.post(ENABLE_URL, {"password": _PASSWORD}, format="json")
    assert response.status_code == status.HTTP_400_BAD_REQUEST


# ===========================================================================
# Disable
# ===========================================================================
def test_disable_requires_auth(api_client):
    response = api_client.post(DISABLE_URL, {"password": _PASSWORD}, format="json")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


def test_disable_requires_correct_password(api_client, user_with_telegram):
    # First enable it.
    user_with_telegram.two_factor_enabled = True
    user_with_telegram.save(update_fields=["two_factor_enabled"])
    from rest_framework_simplejwt.tokens import RefreshToken

    access = str(RefreshToken.for_user(user_with_telegram).access_token)
    _auth(api_client, access)
    response = api_client.post(
        DISABLE_URL, {"password": "wrong-password"}, format="json"
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    user_with_telegram.refresh_from_db()
    assert user_with_telegram.two_factor_enabled is True


def test_disable_when_not_enabled_returns_400(api_client, user_with_telegram):
    tokens = _login_tokens(api_client, user_with_telegram.phone_number)
    _auth(api_client, tokens["access"])
    response = api_client.post(DISABLE_URL, {"password": _PASSWORD}, format="json")
    assert response.status_code == status.HTTP_400_BAD_REQUEST


def test_disable_succeeds(api_client, user_with_telegram):
    user_with_telegram.two_factor_enabled = True
    user_with_telegram.save(update_fields=["two_factor_enabled"])
    from rest_framework_simplejwt.tokens import RefreshToken

    access = str(RefreshToken.for_user(user_with_telegram).access_token)
    _auth(api_client, access)
    response = api_client.post(DISABLE_URL, {"password": _PASSWORD}, format="json")
    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert body["twoFactorEnabled"] is False
    user_with_telegram.refresh_from_db()
    assert user_with_telegram.two_factor_enabled is False


# ===========================================================================
# Login short-circuit + verify
# ===========================================================================
def test_login_returns_202_when_2fa_enabled(api_client, user_with_telegram):
    user_with_telegram.two_factor_enabled = True
    user_with_telegram.save(update_fields=["two_factor_enabled"])
    response = api_client.post(
        LOGIN_URL,
        {"phoneNumber": user_with_telegram.phone_number, "password": _PASSWORD},
        format="json",
    )
    assert response.status_code == status.HTTP_202_ACCEPTED
    body = response.json()
    assert body["twoFactorRequired"] is True
    # No tokens in this response — must go through /auth/2fa/verify/.
    assert "access" not in body
    assert "refresh" not in body
    # OTP row was created with purpose=login.
    otp_qs = OTPCode.objects.filter(
        user=user_with_telegram,
        purpose=OTPCode.Purpose.LOGIN,
        is_used=False,
    )
    assert otp_qs.exists()


def test_login_returns_tokens_when_2fa_disabled(api_client, user_with_telegram):
    """Sanity: unchanged behaviour for the vast majority of users."""
    response = api_client.post(
        LOGIN_URL,
        {"phoneNumber": user_with_telegram.phone_number, "password": _PASSWORD},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert "access" in body
    assert "refresh" in body


def test_verify_returns_tokens(api_client, user_with_telegram):
    user_with_telegram.two_factor_enabled = True
    user_with_telegram.save(update_fields=["two_factor_enabled"])
    # Issue an OTP by triggering login.
    api_client.post(
        LOGIN_URL,
        {"phoneNumber": user_with_telegram.phone_number, "password": _PASSWORD},
        format="json",
    )
    otp = OTPCode.objects.filter(
        user=user_with_telegram,
        purpose=OTPCode.Purpose.LOGIN,
        is_used=False,
    ).latest("created_at")

    response = api_client.post(
        VERIFY_URL,
        {
            "phoneNumber": user_with_telegram.phone_number,
            "password": _PASSWORD,
            "code": otp.code,
        },
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK, response.content
    body = response.json()
    assert "access" in body
    assert "refresh" in body
    assert body["user"]["twoFactorEnabled"] is True
    # OTP was consumed.
    otp.refresh_from_db()
    assert otp.is_used is True


def test_verify_rejects_wrong_password(api_client, user_with_telegram):
    user_with_telegram.two_factor_enabled = True
    user_with_telegram.save(update_fields=["two_factor_enabled"])
    otp = OTPCode.objects.create(
        user=user_with_telegram,
        code=generate_otp_code(),
        purpose=OTPCode.Purpose.LOGIN,
    )
    response = api_client.post(
        VERIFY_URL,
        {
            "phoneNumber": user_with_telegram.phone_number,
            "password": "wrong-password",
            "code": otp.code,
        },
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"


def test_verify_rejects_wrong_code(api_client, user_with_telegram):
    user_with_telegram.two_factor_enabled = True
    user_with_telegram.save(update_fields=["two_factor_enabled"])
    response = api_client.post(
        VERIFY_URL,
        {
            "phoneNumber": user_with_telegram.phone_number,
            "password": _PASSWORD,
            "code": "000000",
        },
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST


def test_verify_uniform_error_between_password_and_code_failure(
    api_client, user_with_telegram
):
    """Wrong-password vs wrong-OTP must surface identical detail text."""
    user_with_telegram.two_factor_enabled = True
    user_with_telegram.save(update_fields=["two_factor_enabled"])
    otp = OTPCode.objects.create(
        user=user_with_telegram,
        code=generate_otp_code(),
        purpose=OTPCode.Purpose.LOGIN,
    )

    r_pwd = api_client.post(
        VERIFY_URL,
        {
            "phoneNumber": user_with_telegram.phone_number,
            "password": "wrong",
            "code": otp.code,
        },
        format="json",
    )
    r_otp = api_client.post(
        VERIFY_URL,
        {
            "phoneNumber": user_with_telegram.phone_number,
            "password": _PASSWORD,
            "code": "000000",
        },
        format="json",
    )
    assert r_pwd.status_code == status.HTTP_400_BAD_REQUEST
    assert r_otp.status_code == status.HTTP_400_BAD_REQUEST
    # Same detail message on both — no oracle to distinguish them.
    d_pwd = str(r_pwd.json()["error"]["details"])
    d_otp = str(r_otp.json()["error"]["details"])
    assert d_pwd == d_otp


def test_verify_rejects_when_2fa_disabled(api_client, user_with_telegram):
    """/auth/2fa/verify/ makes no sense when 2FA is off — force user
    to use /auth/login/ so we don't have two independent auth code paths."""
    # 2FA is off (default).
    otp = OTPCode.objects.create(
        user=user_with_telegram,
        code=generate_otp_code(),
        purpose=OTPCode.Purpose.LOGIN,
    )
    response = api_client.post(
        VERIFY_URL,
        {
            "phoneNumber": user_with_telegram.phone_number,
            "password": _PASSWORD,
            "code": otp.code,
        },
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST


def test_verify_rejects_expired_otp(api_client, user_with_telegram):
    from django.utils import timezone
    from datetime import timedelta

    user_with_telegram.two_factor_enabled = True
    user_with_telegram.save(update_fields=["two_factor_enabled"])
    otp = OTPCode.objects.create(
        user=user_with_telegram,
        code=generate_otp_code(),
        purpose=OTPCode.Purpose.LOGIN,
        expires_at=timezone.now() - timedelta(minutes=1),
    )
    response = api_client.post(
        VERIFY_URL,
        {
            "phoneNumber": user_with_telegram.phone_number,
            "password": _PASSWORD,
            "code": otp.code,
        },
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST


def test_verify_rejects_used_otp(api_client, user_with_telegram):
    user_with_telegram.two_factor_enabled = True
    user_with_telegram.save(update_fields=["two_factor_enabled"])
    otp = OTPCode.objects.create(
        user=user_with_telegram,
        code=generate_otp_code(),
        purpose=OTPCode.Purpose.LOGIN,
    )
    otp.mark_used()
    response = api_client.post(
        VERIFY_URL,
        {
            "phoneNumber": user_with_telegram.phone_number,
            "password": _PASSWORD,
            "code": otp.code,
        },
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST


def test_verify_ignores_password_reset_otp(api_client, user_with_telegram):
    """A password-reset OTP must not double as a login OTP."""
    user_with_telegram.two_factor_enabled = True
    user_with_telegram.save(update_fields=["two_factor_enabled"])
    otp = OTPCode.objects.create(
        user=user_with_telegram,
        code=generate_otp_code(),
        purpose=OTPCode.Purpose.PASSWORD_RESET,
    )
    response = api_client.post(
        VERIFY_URL,
        {
            "phoneNumber": user_with_telegram.phone_number,
            "password": _PASSWORD,
            "code": otp.code,
        },
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
