"""Tests for T126 — security response headers.

Every API response must carry a Content-Security-Policy header plus a
handful of defence-in-depth headers (X-Content-Type-Options,
Referrer-Policy, Permissions-Policy). The middleware is designed so
operators can override individual policies via env vars without
touching the code.
"""
from __future__ import annotations

import pytest
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


def _healthz(api_client: APIClient):
    return api_client.get("/healthz/")


# ===========================================================================
# Basic header presence — every endpoint gets the headers
# ===========================================================================
def test_csp_header_present_on_liveness_endpoint(api_client):
    """Even the unauthenticated liveness probe carries a CSP."""
    response = _healthz(api_client)
    assert response.status_code == status.HTTP_200_OK
    assert "Content-Security-Policy" in response.headers
    csp = response.headers["Content-Security-Policy"]
    # A meaningful policy must at minimum lock default-src.
    assert "default-src" in csp
    assert "'self'" in csp


def test_csp_header_present_on_error_response(api_client):
    """Even a 404 must include the CSP — attackers often abuse errors."""
    response = api_client.get("/api/v1/does-not-exist/")
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert "Content-Security-Policy" in response.headers


def test_csp_header_present_on_api_endpoint(api_client):
    """Login is unauthenticated but still API — headers must flow through."""
    response = api_client.post(
        "/api/v1/auth/login/",
        {"phoneNumber": "+998900000000", "password": "wrong"},
        format="json",
    )
    # Regardless of 400 / 401, the header must be present.
    assert "Content-Security-Policy" in response.headers


def test_x_content_type_options_nosniff(api_client):
    response = _healthz(api_client)
    assert response.headers.get("X-Content-Type-Options") == "nosniff"


def test_referrer_policy_default_is_same_origin(api_client):
    response = _healthz(api_client)
    assert response.headers.get("Referrer-Policy") == "same-origin"


def test_permissions_policy_present_and_locks_sensitive_apis(api_client):
    response = _healthz(api_client)
    pp = response.headers.get("Permissions-Policy", "")
    # Sensitive browser APIs the app doesn't need.
    for api in ("camera=()", "microphone=()", "geolocation=()"):
        assert api in pp, f"Permissions-Policy missing {api!r}: {pp!r}"


# ===========================================================================
# CSP content — the exact default policy is documented and stable
# ===========================================================================
def test_csp_default_policy_scopes(api_client):
    csp = _healthz(api_client).headers["Content-Security-Policy"]
    # Core directives that MUST be present so a reviewer can grep them.
    for directive in (
        "default-src",
        "script-src",
        "style-src",
        "img-src",
        "frame-ancestors 'none'",
        "object-src 'none'",
        "base-uri 'self'",
    ):
        assert directive in csp, (
            f"CSP missing directive {directive!r}. Full policy: {csp!r}"
        )


# ===========================================================================
# Env override — operators can substitute their own policy
# ===========================================================================
@override_settings(CSP_POLICY="default-src 'none'; report-uri /csp-report/")
def test_csp_policy_is_overridable_via_settings(api_client):
    response = _healthz(api_client)
    assert (
        response.headers["Content-Security-Policy"]
        == "default-src 'none'; report-uri /csp-report/"
    )


@override_settings(REFERRER_POLICY_HEADER="strict-origin-when-cross-origin")
def test_referrer_policy_is_overridable(api_client):
    response = _healthz(api_client)
    assert (
        response.headers["Referrer-Policy"]
        == "strict-origin-when-cross-origin"
    )


# ===========================================================================
# X-Frame-Options — Django default (SAMEORIGIN) must be preserved
# ===========================================================================
def test_x_frame_options_still_set_by_django(api_client):
    """Django's XFrameOptionsMiddleware sets this — our middleware must
    not overwrite or remove it."""
    response = _healthz(api_client)
    assert response.headers.get("X-Frame-Options") in {"DENY", "SAMEORIGIN"}


# ===========================================================================
# Middleware ordering guard — make sure the middleware ran
# ===========================================================================
def test_middleware_is_registered_in_settings():
    from django.conf import settings

    assert (
        "apps.core.middleware.SecurityHeadersMiddleware" in settings.MIDDLEWARE
    ), "SecurityHeadersMiddleware not registered in settings.MIDDLEWARE"
    # It must run after XFrameOptionsMiddleware so it can honour
    # X-Frame-Options set by Django.
    idx_xfo = settings.MIDDLEWARE.index(
        "django.middleware.clickjacking.XFrameOptionsMiddleware"
    )
    idx_sec = settings.MIDDLEWARE.index(
        "apps.core.middleware.SecurityHeadersMiddleware"
    )
    assert idx_sec > idx_xfo


# ===========================================================================
# Reverse-name guard — the readyz route exists and receives headers too
# ===========================================================================
def test_readyz_probe_receives_csp(api_client):
    # readyz is defined at the URL layer in T121; make sure the security
    # middleware wraps it too.
    response = api_client.get("/readyz/")
    # readyz returns 200 in the happy path; 503 if a downstream is down.
    # Either way the header must be attached.
    assert response.status_code in {200, 503}
    assert "Content-Security-Policy" in response.headers
    # unused import silencer
    _ = reverse
