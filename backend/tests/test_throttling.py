"""Tests for T118 — login endpoint throttling.

Acceptance criteria (from the plan_05 hardening pass):
    * ``/api/v1/auth/login/`` is rate-limited (default 5/min per IP).
    * The 6th request in a burst returns HTTP 429 with the standard
      error envelope: ``{"error": {"code": "THROTTLED", ...}}``.
    * The scope key is read from ``REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']``
      and is env-overridable via ``LOGIN_RATE_LIMIT``.
    * Authenticated endpoints (``/auth/me/``, business endpoints) are
      NOT throttled — the login gate is the only attack surface here.

These tests deliberately do NOT touch ``django.core.cache.cache`` — the
autouse ``_clear_default_cache`` fixture in ``conftest.py`` gives each
test a clean throttle counter.
"""
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework.throttling import SimpleRateThrottle

pytestmark = pytest.mark.django_db


User = get_user_model()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture
def user():
    return User.objects.create_user(
        phone_number="+998901112233",
        password="Str0ngPass!123",
        first_name="Test",
        last_name="User",
        role=User.Role.ADMINISTRATOR,
    )


@pytest.fixture
def api_client():
    return APIClient()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _login_body(password: str = "Str0ngPass!123") -> dict:
    return {"phoneNumber": "+998901112233", "password": password}


# ---------------------------------------------------------------------------
# 5/min default limit
# ---------------------------------------------------------------------------
def test_login_allows_up_to_five_requests_per_minute(api_client, user):
    """Baseline: 5 successful logins in a row are all allowed."""
    url = reverse("v1:accounts:login")
    for i in range(5):
        response = api_client.post(url, data=_login_body(), format="json")
        assert response.status_code == status.HTTP_200_OK, (
            f"Request #{i + 1} unexpectedly failed: {response.status_code} {response.content!r}"
        )


def test_login_throttled_on_sixth_attempt(api_client, user):
    """The 6th request within the 1-minute window returns HTTP 429."""
    url = reverse("v1:accounts:login")
    for _ in range(5):
        api_client.post(url, data=_login_body(), format="json")
    response = api_client.post(url, data=_login_body(), format="json")

    assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
    body = response.json()
    assert "error" in body
    assert body["error"]["code"] == "THROTTLED"
    # DRF surfaces the wait window inside the message string.
    assert "throttl" in body["error"]["message"].lower()


def test_throttle_counts_failed_logins_too(api_client, user):
    """Wrong-password attempts count against the same rate window.

    This is the whole point of the throttle: credential-stuffing attacks
    should not get unlimited retries just because they never authenticate.
    """
    url = reverse("v1:accounts:login")
    for _ in range(5):
        r = api_client.post(url, data=_login_body(password="wrong-pw"), format="json")
        assert r.status_code == status.HTTP_400_BAD_REQUEST

    response = api_client.post(url, data=_login_body(), format="json")
    assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
    assert response.json()["error"]["code"] == "THROTTLED"


def test_throttled_response_carries_retry_after_header(api_client, user):
    """HTTP 429 responses SHOULD include the ``Retry-After`` header per RFC 6585."""
    url = reverse("v1:accounts:login")
    for _ in range(5):
        api_client.post(url, data=_login_body(), format="json")
    response = api_client.post(url, data=_login_body(), format="json")

    assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
    # DRF sets Retry-After on the response for Throttled exceptions.
    assert "Retry-After" in response, (
        "Throttled response missing Retry-After header — "
        "clients cannot implement backoff correctly."
    )
    # Value is a positive integer number of seconds.
    assert int(response["Retry-After"]) > 0


# ---------------------------------------------------------------------------
# Env / configuration
# ---------------------------------------------------------------------------
def test_login_rate_reflects_default_throttle_rates_setting(api_client, user, monkeypatch):
    """The scope rate is read from ``DEFAULT_THROTTLE_RATES``.

    Tightening the rate to ``2/min`` must throttle on the 3rd request.

    DRF caches ``SimpleRateThrottle.THROTTLE_RATES`` at class-load time
    (it copies the dict reference from ``api_settings.DEFAULT_THROTTLE_RATES``)
    which means ``@override_settings(REST_FRAMEWORK={...})`` does NOT
    propagate to already-loaded throttle classes. We mutate the shared
    ``THROTTLE_RATES`` dict in place instead — ``monkeypatch.setitem``
    restores the original value at test-teardown.
    """
    monkeypatch.setitem(SimpleRateThrottle.THROTTLE_RATES, "auth_login", "2/min")

    url = reverse("v1:accounts:login")
    for i in range(2):
        r = api_client.post(url, data=_login_body(), format="json")
        assert r.status_code == status.HTTP_200_OK, (
            f"Request #{i + 1} under 2/min should have passed but returned {r.status_code}"
        )

    r = api_client.post(url, data=_login_body(), format="json")
    assert r.status_code == status.HTTP_429_TOO_MANY_REQUESTS
    assert r.json()["error"]["code"] == "THROTTLED"


def test_throttle_scope_registered_in_settings(settings):
    """The ``auth_login`` scope must be declared in DRF settings.

    Guard rail: if someone removes the scope from
    ``REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']``, the whole endpoint
    starts raising ``ImproperlyConfigured`` on every request. Catch
    that at test time, not at 3am from a production alert.
    """
    rates = settings.REST_FRAMEWORK.get("DEFAULT_THROTTLE_RATES", {})
    assert "auth_login" in rates, (
        "Login throttle scope missing from REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']. "
        "Add it back to config/settings/base.py — the login view requires it."
    )
    assert "auth_password_reset" in rates, (
        "Password reset throttle scope missing — required by T119."
    )


# ---------------------------------------------------------------------------
# Isolation
# ---------------------------------------------------------------------------
def test_authenticated_endpoints_are_not_throttled_by_auth_login_scope(api_client, user):
    """``/auth/me/`` has no throttle scope — burst calls must never 429.

    This test protects against a common regression: adding a throttle
    globally rather than per-view. If someone flips
    ``DEFAULT_THROTTLE_CLASSES`` on, /auth/me/ would inherit it and
    every polling client would eventually get 429ed. Guard against
    that by exercising 20 sequential authenticated GETs.
    """
    login_url = reverse("v1:accounts:login")
    tokens = api_client.post(login_url, data=_login_body(), format="json").json()
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")

    me_url = reverse("v1:accounts:me")
    for _ in range(20):
        r = api_client.get(me_url)
        assert r.status_code == status.HTTP_200_OK, (
            f"/auth/me/ throttled unexpectedly: {r.status_code} {r.content!r}"
        )


def test_login_throttle_key_uses_client_ip(user):
    """Two clients from different IPs must have independent quotas.

    Simulates a shared network scenario: if throttling keyed on
    something coarser than IP (e.g. always the same key), a benign
    user would be locked out by another user on the same subnet
    exceeding the limit first. We verify the opposite: distinct
    ``REMOTE_ADDR`` values get their own counters.
    """
    url = reverse("v1:accounts:login")

    client_a = APIClient(REMOTE_ADDR="10.0.0.1")
    for _ in range(5):
        r = client_a.post(url, data=_login_body(), format="json")
        assert r.status_code == status.HTTP_200_OK
    # A's 6th is throttled …
    r = client_a.post(url, data=_login_body(), format="json")
    assert r.status_code == status.HTTP_429_TOO_MANY_REQUESTS

    # … but a fresh client from a different IP is untouched.
    client_b = APIClient(REMOTE_ADDR="10.0.0.2")
    r = client_b.post(url, data=_login_body(), format="json")
    assert r.status_code == status.HTTP_200_OK
