"""Tests for T119 — password-reset OTP flow.

Covers the following invariants (production-hardening pass, plan_05):

* Two new endpoints under the standard error envelope:
    - ``POST /api/v1/auth/password-reset/request/`` accepts a phone
      number and returns HTTP 202 with a uniform response body
      regardless of whether the number is registered — no user
      enumeration.
    - ``POST /api/v1/auth/password-reset/confirm/`` accepts phone +
      OTP + new password and rotates the credential; every credential
      / OTP mismatch surfaces the same ``VALIDATION_ERROR`` so the
      caller cannot tell why it failed.
* An ``OTPCode`` row of ``purpose=password_reset`` is created for known
  active users and left untouched for unknown / inactive ones.
* Django's password validators run on the new password (min length,
  common-passwords list, numeric-only, similarity).
* Successful confirm marks the OTP ``is_used=True`` and blacklists
  every outstanding refresh token for the user.
* The endpoints are wired to the ``auth_password_reset`` throttle
  scope (``3/hour`` by default). Test isolation is guaranteed by the
  autouse ``_clear_default_cache`` fixture in ``conftest.py``.
"""
from __future__ import annotations

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework.throttling import SimpleRateThrottle

from apps.accounts.models import OTPCode

pytestmark = pytest.mark.django_db


User = get_user_model()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture
def user(db):  # noqa: ARG001 - db fixture is required
    return User.objects.create_user(
        phone_number="+998901112233",
        password="Str0ngPass!123",
        first_name="Reset",
        last_name="User",
        role=User.Role.DOCTOR,
    )


@pytest.fixture
def user_with_telegram(db):  # noqa: ARG001
    return User.objects.create_user(
        phone_number="+998904445566",
        password="Str0ngPass!123",
        first_name="Chat",
        last_name="User",
        role=User.Role.DOCTOR,
        telegram_chat_id=555_666_777,
    )


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture(autouse=True)
def _relax_password_reset_rate(monkeypatch):
    """Loosen the OTP throttle so functional tests are not rate-limited.

    The default rate (``3/hour``) is deliberately tight for production
    but would swallow half of the tests below. We reset it to a large
    value for the tests that don't specifically exercise throttling.
    """
    monkeypatch.setitem(
        SimpleRateThrottle.THROTTLE_RATES,
        "auth_password_reset",
        "1000/hour",
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _request_url():
    return reverse("v1:accounts:password-reset-request")


def _confirm_url():
    return reverse("v1:accounts:password-reset-confirm")


def _latest_reset_otp(user_obj) -> OTPCode:
    return OTPCode.objects.filter(
        user=user_obj,
        purpose=OTPCode.Purpose.PASSWORD_RESET,
    ).latest("created_at")


# ---------------------------------------------------------------------------
# /password-reset/request/
# ---------------------------------------------------------------------------
def test_request_creates_otp_for_known_user(api_client, user):
    response = api_client.post(
        _request_url(),
        data={"phoneNumber": "+998901112233"},
        format="json",
    )
    assert response.status_code == status.HTTP_202_ACCEPTED
    body = response.json()
    assert "detail" in body

    otp = _latest_reset_otp(user)
    assert otp.purpose == OTPCode.Purpose.PASSWORD_RESET
    assert otp.is_used is False
    assert len(otp.code) == 6 and otp.code.isdigit()
    assert otp.expires_at > timezone.now()


def test_request_accepts_snake_case_input(api_client, user):
    response = api_client.post(
        _request_url(),
        data={"phone_number": "+998901112233"},
        format="json",
    )
    assert response.status_code == status.HTTP_202_ACCEPTED
    assert _latest_reset_otp(user).is_used is False


def test_request_normalises_phone_input(api_client, user):
    """Whitespace / punctuation in the input must not defeat the lookup."""
    response = api_client.post(
        _request_url(),
        data={"phoneNumber": " +998 (901) 11-22-33 "},
        format="json",
    )
    assert response.status_code == status.HTTP_202_ACCEPTED
    assert _latest_reset_otp(user).is_used is False


def test_request_for_unknown_user_returns_same_envelope(api_client):
    """No user with this phone → still HTTP 202, no OTP row created."""
    response = api_client.post(
        _request_url(),
        data={"phoneNumber": "+998909999999"},
        format="json",
    )
    assert response.status_code == status.HTTP_202_ACCEPTED
    body = response.json()
    assert "detail" in body
    assert OTPCode.objects.count() == 0


def test_request_for_inactive_user_creates_no_otp(api_client, user):
    """Deactivated accounts must not receive reset codes."""
    user.is_active = False
    user.save(update_fields=["is_active"])
    response = api_client.post(
        _request_url(),
        data={"phoneNumber": "+998901112233"},
        format="json",
    )
    # Response is still identical to the known-user case.
    assert response.status_code == status.HTTP_202_ACCEPTED
    assert OTPCode.objects.filter(user=user).count() == 0


def test_request_missing_phone_returns_validation_error(api_client):
    response = api_client.post(_request_url(), data={}, format="json")
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"


def test_request_malformed_phone_returns_validation_error(api_client):
    response = api_client.post(
        _request_url(),
        data={"phoneNumber": "not-a-phone"},
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_request_enqueues_telegram_notification_when_chat_id_set(
    api_client, user_with_telegram, monkeypatch,
):
    """When the user has a telegram_chat_id, a notification is enqueued.

    We patch the async delivery task rather than mocking the whole
    ``enqueue`` service — this keeps the DB write in-place so the row
    (which the admin panel exposes) is still observable.
    """
    from apps.notifications import tasks as notif_tasks
    from apps.notifications.models import NotificationLog

    captured = []

    def _fake_delay(log_id):
        captured.append(log_id)
        # Return a benign object with an ``id`` attribute so callers
        # that treat the return as a Celery result don't crash.
        class _R:
            id = "test-task"
        return _R()

    monkeypatch.setattr(notif_tasks.send_notification, "delay", _fake_delay)

    response = api_client.post(
        _request_url(),
        data={"phoneNumber": user_with_telegram.phone_number},
        format="json",
    )
    assert response.status_code == status.HTTP_202_ACCEPTED

    logs = NotificationLog.objects.filter(user=user_with_telegram)
    assert logs.count() == 1
    log = logs.first()
    assert log.channel == "telegram"
    assert log.context.get("purpose") == "password_reset"
    # The OTP code appears in the message body so the user can copy it.
    otp = _latest_reset_otp(user_with_telegram)
    assert otp.code in log.message


# ---------------------------------------------------------------------------
# /password-reset/confirm/
# ---------------------------------------------------------------------------
def test_confirm_rotates_password_and_marks_otp_used(api_client, user):
    api_client.post(
        _request_url(),
        data={"phoneNumber": user.phone_number},
        format="json",
    )
    otp = _latest_reset_otp(user)

    response = api_client.post(
        _confirm_url(),
        data={
            "phoneNumber": user.phone_number,
            "code": otp.code,
            "newPassword": "N3wStr0ngPass!",
        },
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK, response.content

    user.refresh_from_db()
    otp.refresh_from_db()
    assert user.check_password("N3wStr0ngPass!") is True
    assert user.check_password("Str0ngPass!123") is False
    assert otp.is_used is True


def test_confirm_new_password_works_for_immediate_login(api_client, user):
    api_client.post(
        _request_url(),
        data={"phoneNumber": user.phone_number},
        format="json",
    )
    otp = _latest_reset_otp(user)
    api_client.post(
        _confirm_url(),
        data={
            "phoneNumber": user.phone_number,
            "code": otp.code,
            "newPassword": "N3wStr0ngPass!",
        },
        format="json",
    )

    fresh_client = APIClient()
    response = fresh_client.post(
        reverse("v1:accounts:login"),
        data={
            "phoneNumber": user.phone_number,
            "password": "N3wStr0ngPass!",
        },
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    assert "access" in response.json()


def test_confirm_wrong_otp_returns_uniform_error(api_client, user):
    api_client.post(
        _request_url(),
        data={"phoneNumber": user.phone_number},
        format="json",
    )
    response = api_client.post(
        _confirm_url(),
        data={
            "phoneNumber": user.phone_number,
            "code": "000000",  # wrong
            "newPassword": "N3wStr0ngPass!",
        },
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"
    # OTP unchanged.
    assert _latest_reset_otp(user).is_used is False
    # Password unchanged.
    user.refresh_from_db()
    assert user.check_password("Str0ngPass!123") is True


def test_confirm_unknown_user_returns_uniform_error(api_client):
    """Same error shape as wrong-OTP — no enumeration leak."""
    response = api_client.post(
        _confirm_url(),
        data={
            "phoneNumber": "+998909999999",
            "code": "123456",
            "newPassword": "N3wStr0ngPass!",
        },
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"


def test_confirm_expired_otp_rejected(api_client, user):
    otp = OTPCode.objects.create(
        user=user,
        code="654321",
        purpose=OTPCode.Purpose.PASSWORD_RESET,
        expires_at=timezone.now() - timedelta(minutes=1),
    )
    response = api_client.post(
        _confirm_url(),
        data={
            "phoneNumber": user.phone_number,
            "code": otp.code,
            "newPassword": "N3wStr0ngPass!",
        },
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    otp.refresh_from_db()
    assert otp.is_used is False


def test_confirm_already_used_otp_rejected(api_client, user):
    otp = OTPCode.objects.create(
        user=user,
        code="112233",
        purpose=OTPCode.Purpose.PASSWORD_RESET,
    )
    otp.mark_used()
    response = api_client.post(
        _confirm_url(),
        data={
            "phoneNumber": user.phone_number,
            "code": otp.code,
            "newPassword": "N3wStr0ngPass!",
        },
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST


def test_confirm_login_scope_otp_not_accepted(api_client, user):
    """A ``purpose=login`` OTP must not unlock a password reset."""
    otp = OTPCode.objects.create(
        user=user,
        code="778899",
        purpose=OTPCode.Purpose.LOGIN,
    )
    response = api_client.post(
        _confirm_url(),
        data={
            "phoneNumber": user.phone_number,
            "code": otp.code,
            "newPassword": "N3wStr0ngPass!",
        },
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    otp.refresh_from_db()
    assert otp.is_used is False


def test_confirm_rejects_weak_password(api_client, user):
    """Django's password validators must run before OTP lookup."""
    api_client.post(
        _request_url(),
        data={"phoneNumber": user.phone_number},
        format="json",
    )
    otp = _latest_reset_otp(user)
    response = api_client.post(
        _confirm_url(),
        data={
            "phoneNumber": user.phone_number,
            "code": otp.code,
            "newPassword": "123",  # too short + numeric-only
        },
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"
    # OTP still valid on the retry (was NOT consumed).
    otp.refresh_from_db()
    assert otp.is_used is False


def test_confirm_missing_fields_returns_validation_error(api_client):
    response = api_client.post(_confirm_url(), data={}, format="json")
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_confirm_blacklists_outstanding_refresh_tokens(api_client, user):
    """After a successful reset, any prior refresh token must be revoked."""
    # Prime an outstanding refresh token by logging in first.
    login_response = api_client.post(
        reverse("v1:accounts:login"),
        data={
            "phoneNumber": user.phone_number,
            "password": "Str0ngPass!123",
        },
        format="json",
    )
    assert login_response.status_code == status.HTTP_200_OK
    old_refresh = login_response.json()["refresh"]

    api_client.post(
        _request_url(),
        data={"phoneNumber": user.phone_number},
        format="json",
    )
    otp = _latest_reset_otp(user)
    api_client.post(
        _confirm_url(),
        data={
            "phoneNumber": user.phone_number,
            "code": otp.code,
            "newPassword": "N3wStr0ngPass!",
        },
        format="json",
    )

    fresh_client = APIClient()
    response = fresh_client.post(
        reverse("v1:accounts:refresh"),
        data={"refresh": old_refresh},
        format="json",
    )
    # The old refresh token must no longer work.
    assert response.status_code in {
        status.HTTP_400_BAD_REQUEST,
        status.HTTP_401_UNAUTHORIZED,
        status.HTTP_403_FORBIDDEN,
    }


# ---------------------------------------------------------------------------
# Throttling
# ---------------------------------------------------------------------------
def test_request_endpoint_is_rate_limited(monkeypatch, api_client, user):
    """Fourth request within an hour returns HTTP 429."""
    monkeypatch.setitem(
        SimpleRateThrottle.THROTTLE_RATES,
        "auth_password_reset",
        "3/hour",
    )
    for i in range(3):
        r = api_client.post(
            _request_url(),
            data={"phoneNumber": user.phone_number},
            format="json",
        )
        assert r.status_code == status.HTTP_202_ACCEPTED, (
            f"Request #{i + 1} unexpectedly failed: {r.status_code}"
        )

    r = api_client.post(
        _request_url(),
        data={"phoneNumber": user.phone_number},
        format="json",
    )
    assert r.status_code == status.HTTP_429_TOO_MANY_REQUESTS
    assert r.json()["error"]["code"] == "THROTTLED"


def test_confirm_endpoint_is_rate_limited(monkeypatch, api_client, user):
    """Confirm endpoint shares the same scope so brute-force is bounded."""
    monkeypatch.setitem(
        SimpleRateThrottle.THROTTLE_RATES,
        "auth_password_reset",
        "3/hour",
    )
    for _ in range(3):
        r = api_client.post(
            _confirm_url(),
            data={
                "phoneNumber": user.phone_number,
                "code": "000000",
                "newPassword": "N3wStr0ngPass!",
            },
            format="json",
        )
        # Each attempt is a validation-error (400), but it still counts
        # against the shared throttle bucket.
        assert r.status_code == status.HTTP_400_BAD_REQUEST

    r = api_client.post(
        _confirm_url(),
        data={
            "phoneNumber": user.phone_number,
            "code": "000000",
            "newPassword": "N3wStr0ngPass!",
        },
        format="json",
    )
    assert r.status_code == status.HTTP_429_TOO_MANY_REQUESTS
