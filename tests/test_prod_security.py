"""T128 — Production settings hardening tests.

Loads ``config.settings.prod`` under a fresh import with the minimum
required env vars set (real ``DJANGO_SECRET_KEY``, ``JWT_SIGNING_KEY``,
non-empty ``DJANGO_ALLOWED_HOSTS``) and asserts that every documented
TLS / cookie / HSTS flag is set to a safe value.

The prod module raises ``RuntimeError`` at import time when the safety
guards fail, so this file exercises both success and failure paths.
"""
from __future__ import annotations

import importlib
import os
import sys
from typing import Any

import pytest


PROD_MODULE = "config.settings.prod"
BASE_MODULE = "config.settings.base"


def _reload_prod(monkeypatch: pytest.MonkeyPatch, **env: str) -> Any:
    """Import (or reimport) ``config.settings.prod`` under ``env``.

    ``monkeypatch.setenv`` is used so pytest restores the prior
    environment after the test regardless of assertion outcome.

    Both ``config.settings.prod`` AND ``config.settings.base`` are
    dropped from ``sys.modules`` because ``prod`` does
    ``from .base import ...`` — without dropping base first, the
    module-level ``SECRET_KEY`` / ``SIMPLE_JWT`` symbols keep their
    values from the initial pytest environment (which uses the
    insecure dev fallback), so the safety guards in prod.py always
    trip on reload.
    """
    # Baseline: values that MUST be present or prod.py raises at import.
    baseline = {
        "DJANGO_SECRET_KEY": "test-prod-secret-key-" + ("x" * 40),
        "JWT_SIGNING_KEY": "test-jwt-signing-key-" + ("y" * 40),
        "DJANGO_ALLOWED_HOSTS": "example.com,www.example.com",
    }
    for k, v in {**baseline, **env}.items():
        monkeypatch.setenv(k, v)

    # Drop both modules so imports re-execute against the new env.
    sys.modules.pop(PROD_MODULE, None)
    sys.modules.pop(BASE_MODULE, None)
    return importlib.import_module(PROD_MODULE)


def test_prod_settings_default_cookie_hardening(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """With only the required vars set, every cookie / HSTS flag defaults safe."""
    prod = _reload_prod(monkeypatch)

    assert prod.DEBUG is False, "DEBUG must be False in prod."

    # Cookies (session)
    assert prod.SESSION_COOKIE_SECURE is True
    assert prod.SESSION_COOKIE_HTTPONLY is True
    assert prod.SESSION_COOKIE_SAMESITE == "Lax"

    # Cookies (CSRF)
    assert prod.CSRF_COOKIE_SECURE is True
    assert prod.CSRF_COOKIE_HTTPONLY is True
    assert prod.CSRF_COOKIE_SAMESITE == "Lax"

    # HSTS
    assert prod.SECURE_HSTS_SECONDS == 60 * 60 * 24 * 365
    assert prod.SECURE_HSTS_INCLUDE_SUBDOMAINS is True
    assert prod.SECURE_HSTS_PRELOAD is True

    # TLS redirect + proxy header
    assert prod.SECURE_SSL_REDIRECT is True
    assert prod.SECURE_PROXY_SSL_HEADER == ("HTTP_X_FORWARDED_PROTO", "https")

    # Content sniffing + referrer
    assert prod.SECURE_CONTENT_TYPE_NOSNIFF is True
    assert prod.SECURE_REFERRER_POLICY == "same-origin"


def test_prod_settings_hsts_can_be_shortened_for_staging(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Staging deployments override HSTS to a short lifetime."""
    prod = _reload_prod(
        monkeypatch,
        DJANGO_SECURE_HSTS_SECONDS="60",
        DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS="0",
        DJANGO_SECURE_HSTS_PRELOAD="0",
    )
    assert prod.SECURE_HSTS_SECONDS == 60
    assert prod.SECURE_HSTS_INCLUDE_SUBDOMAINS is False
    assert prod.SECURE_HSTS_PRELOAD is False


def test_prod_settings_ssl_redirect_can_be_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When Cloudflare/ALB already redirects, we can opt out to avoid loops."""
    prod = _reload_prod(monkeypatch, DJANGO_SECURE_SSL_REDIRECT="0")
    assert prod.SECURE_SSL_REDIRECT is False


def test_prod_settings_reject_insecure_secret_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The dev fallback secret key must be rejected at import time."""
    with pytest.raises(RuntimeError, match="DJANGO_SECRET_KEY"):
        _reload_prod(
            monkeypatch,
            DJANGO_SECRET_KEY="insecure-dev-key-change-me",
        )


def test_prod_settings_reject_missing_allowed_hosts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Empty ALLOWED_HOSTS blows up loudly instead of silently allowing all."""
    with pytest.raises(RuntimeError, match="DJANGO_ALLOWED_HOSTS"):
        _reload_prod(monkeypatch, DJANGO_ALLOWED_HOSTS="")


def test_prod_settings_reject_insecure_jwt_signing_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The dev fallback JWT signing key must be rejected in prod."""
    # Force JWT_SIGNING_KEY empty AND DJANGO_SECRET_KEY to the insecure dev key
    # so the "reuse DJANGO_SECRET_KEY" fallback (also insecure) is rejected too.
    with pytest.raises(RuntimeError):
        _reload_prod(
            monkeypatch,
            DJANGO_SECRET_KEY="real-strong-key-" + ("k" * 40),
            JWT_SIGNING_KEY="insecure-fallback-key",
        )


@pytest.fixture(autouse=True)
def _restore_original_settings_module():
    """Make sure we don't leave prod half-loaded for the next test."""
    original = os.environ.get("DJANGO_SETTINGS_MODULE")
    yield
    # Restore whatever settings module the rest of the suite is running
    # under (typically config.settings.dev via pytest.ini).
    if original is not None:
        os.environ["DJANGO_SETTINGS_MODULE"] = original
    # Drop cached prod import so subsequent test modules don't reuse it,
    # and reload base so the dev suite continues under the pytest env
    # (dev key, LocMemCache, ...) rather than the last prod-flavoured
    # environment left over from this test module.
    sys.modules.pop(PROD_MODULE, None)
    sys.modules.pop(BASE_MODULE, None)
