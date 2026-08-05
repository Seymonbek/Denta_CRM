"""Tests for T124 — JWT signing key separation from DJANGO_SECRET_KEY.

Contract:

* By default (no ``JWT_SIGNING_KEY`` env var) ``SIMPLE_JWT['SIGNING_KEY']``
  falls back to ``DJANGO_SECRET_KEY`` — this preserves backwards
  compatibility for existing deployments that don't yet set the new
  variable.
* When ``JWT_SIGNING_KEY`` is set at settings-load time it takes
  precedence and JWTs are signed with that key. Rotating it in prod is
  the operator's tool for forcing a global re-login without changing
  ``DJANGO_SECRET_KEY`` (which would also invalidate sessions/CSRF).
* Tokens signed under the old key are rejected once the key rotates —
  simplejwt already enforces this via ``jwt.decode(...)`` but we cover
  it here so a regression can't silently accept stale tokens.
"""
from __future__ import annotations

import importlib
import os

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

pytestmark = pytest.mark.django_db


User = get_user_model()


@pytest.fixture
def user():
    return User.objects.create_user(
        phone_number="+998901234567",
        password="Str0ngPass!123",
        first_name="Key",
        last_name="Tester",
        role=User.Role.DOCTOR,
    )


def test_signing_key_falls_back_to_django_secret_key_when_env_unset(
    monkeypatch,
):
    """No ``JWT_SIGNING_KEY`` → SIMPLE_JWT reuses ``DJANGO_SECRET_KEY``.

    We import ``config.settings.base`` fresh under a controlled env so
    module-level constants are re-evaluated with our env values.
    """
    monkeypatch.delenv("JWT_SIGNING_KEY", raising=False)
    monkeypatch.setenv("DJANGO_SECRET_KEY", "fallback-django-secret-abc")

    from config.settings import base as base_settings

    reloaded = importlib.reload(base_settings)
    try:
        assert reloaded.SIMPLE_JWT["SIGNING_KEY"] == "fallback-django-secret-abc"
        assert reloaded.SECRET_KEY == "fallback-django-secret-abc"
    finally:
        # Restore the module to the values pytest-django originally set.
        importlib.reload(base_settings)


def test_signing_key_prefers_dedicated_env_var(monkeypatch):
    """When ``JWT_SIGNING_KEY`` is set it takes precedence over Django's."""
    monkeypatch.setenv("JWT_SIGNING_KEY", "dedicated-jwt-signing-key-xyz")
    monkeypatch.setenv("DJANGO_SECRET_KEY", "unrelated-django-secret")

    from config.settings import base as base_settings

    reloaded = importlib.reload(base_settings)
    try:
        assert reloaded.SIMPLE_JWT["SIGNING_KEY"] == "dedicated-jwt-signing-key-xyz"
        # Django secret is independently set — proves the keys are decoupled.
        assert reloaded.SECRET_KEY == "unrelated-django-secret"
        assert (
            reloaded.SIMPLE_JWT["SIGNING_KEY"] != reloaded.SECRET_KEY
        ), "T124: JWT_SIGNING_KEY must be independent of DJANGO_SECRET_KEY when set"
    finally:
        importlib.reload(base_settings)


def test_algorithm_is_configurable_via_env(monkeypatch):
    """``JWT_ALGORITHM`` env var controls the simplejwt algorithm."""
    monkeypatch.setenv("JWT_ALGORITHM", "HS512")

    from config.settings import base as base_settings

    reloaded = importlib.reload(base_settings)
    try:
        assert reloaded.SIMPLE_JWT["ALGORITHM"] == "HS512"
    finally:
        importlib.reload(base_settings)


def test_token_signed_with_old_key_rejected_after_rotation(user):
    """Rotating ``SIGNING_KEY`` invalidates previously-issued tokens.

    This is the behaviour operators rely on when they need to force
    every client to re-login (e.g. after a suspected key leak) without
    also nuking sessions and CSRF via ``DJANGO_SECRET_KEY`` rotation.

    Note: simplejwt caches the ``TokenBackend`` at module import time
    (see ``rest_framework_simplejwt.state``), so at runtime we simulate
    a key rotation by (a) minting a token under the current backend,
    then (b) swapping the module-level token backend's ``signing_key``
    to a new value, then (c) exercising the auth path — which should
    now reject the old token. In production the equivalent action is a
    process restart after updating ``JWT_SIGNING_KEY`` in the
    environment.
    """
    original_token = str(RefreshToken.for_user(user).access_token)

    api_client = APIClient()
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {original_token}")
    resp = api_client.get(reverse("v1:accounts:me"))
    assert resp.status_code == status.HTTP_200_OK, (
        f"Baseline auth failed unexpectedly: {resp.status_code} {resp.content!r}"
    )

    # Simulate a signing-key rotation by mutating the cached token
    # backend. This mirrors what happens on process restart with a new
    # ``JWT_SIGNING_KEY`` env var — the new ``TokenBackend`` is built
    # with the fresh key.
    from rest_framework_simplejwt import state

    original_key = state.token_backend.signing_key
    try:
        state.token_backend.signing_key = "brand-new-rotated-key-with-more-than-32-bytes-of-entropy-here"
        resp = api_client.get(reverse("v1:accounts:me"))
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED, (
            "Token minted under the old key must be rejected after rotation."
        )
    finally:
        state.token_backend.signing_key = original_key


def test_env_var_names_are_documented_in_env_examples():
    """Guard rail: ensure the new env var appears in .env.example files.

    Ops rely on ``.env.example`` as the source of truth for available
    configuration. If ``JWT_SIGNING_KEY`` is removed from the template
    without also removing the code path, new deployments will silently
    default to reusing ``DJANGO_SECRET_KEY``.
    """
    repo_root = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..")
    )
    # backend/.env.example
    backend_env = os.path.join(
        repo_root, "backend", ".env.example"
    )
    with open(backend_env, encoding="utf-8") as f:
        backend_content = f.read()
    assert "JWT_SIGNING_KEY" in backend_content, (
        "T124: JWT_SIGNING_KEY missing from backend/.env.example"
    )

    # Repo-level dev + prod templates.
    for name in (".env.example", ".env.prod.example"):
        path = os.path.join(repo_root, name)
        with open(path, encoding="utf-8") as f:
            content = f.read()
        assert "JWT_SIGNING_KEY" in content, (
            f"T124: JWT_SIGNING_KEY missing from {name}"
        )
