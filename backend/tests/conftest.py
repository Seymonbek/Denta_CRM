"""Shared pytest fixtures for the backend test suite.

Runs before Django's setup so ``settings`` mutations here take effect for
every test module.

Notes
-----
* ``CACHES`` is switched to :class:`~django.core.cache.backends.locmem.LocMemCache`
  so tests that touch ``django.core.cache.cache`` (e.g. the reports app)
  don't require a live Redis. Domain apps that read/write through the
  regular ORM are unaffected.
* We deliberately do NOT change ``CELERY_TASK_ALWAYS_EAGER`` here — apps
  that need eager tasks (rare) can toggle it via ``@override_settings``.
* T118: the login endpoint is now rate-limited via
  :class:`~rest_framework.throttling.ScopedRateThrottle`. Its counters
  live in the default cache — which is LocMemCache under tests and
  therefore process-scoped, not test-scoped. The autouse
  ``_clear_default_cache`` fixture below resets it between tests so a
  test that fires several login attempts (e.g. ``test_clinic_flow``
  which logs in as three roles) cannot accidentally leak throttle
  state into the next test. Dedicated throttling tests in
  ``test_throttling.py`` exercise the limit intentionally within a
  single test function.
* T133: :data:`MEDIA_ROOT` is redirected to a session-scoped ``tmp_path``
  so no test can leave orphaned UUID directories behind in
  ``dentacrm/backend/media/`` (170+ such directories from historical
  test runs were manually cleaned up in T133). Future ``TreatmentPhoto``
  uploads land under the pytest temp tree and are wiped automatically
  when the session ends.
"""
from __future__ import annotations

import os
from pathlib import Path

import pytest
from django.conf import settings


def pytest_configure(config):  # noqa: ARG001 — pytest hook signature
    """Swap Redis cache for LocMemCache so tests don't need Redis."""
    settings.CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "dentacrm-tests",
            "TIMEOUT": 300,
            "KEY_PREFIX": "dentacrm",
        }
    }


@pytest.fixture(autouse=True)
def _clear_default_cache():
    """Reset the default cache before every test.

    Two use cases depend on this:

    1. **Throttling isolation** (T118) — the ``ScopedRateThrottle`` on
       ``/auth/login/`` records request counts in the default cache
       keyed by client IP. Without a reset, six independent login tests
       from the same ``127.0.0.1`` client would spill over the ``5/min``
       burst and start returning 429.
    2. **Reports cache isolation** — the reports app caches aggregate
       payloads under stable keys; wiping between tests avoids stale
       reads across cases that mutate underlying data.
    3. **T129 idempotency isolation** — the ``IdempotencyMixin`` writes
       replay entries into the same default cache; wiping stops
       cross-test leakage.
    """
    # Local import so pytest can collect this module without Django set up.
    from django.core.cache import cache

    cache.clear()
    yield
    cache.clear()


@pytest.fixture(autouse=True, scope="session")
def _redirect_media_root(tmp_path_factory) -> None:
    """T133 — redirect MEDIA_ROOT to a pytest tmp dir for the whole session.

    Historical runs of the test suite wrote treatment-photo uploads
    into ``dentacrm/backend/media/treatments/<uuid>/`` and never
    cleaned them up. This fixture points ``settings.MEDIA_ROOT`` at a
    session-scoped tmp dir so future runs never dirty the repo.
    """
    tmp_root = tmp_path_factory.mktemp("dentacrm-media")
    settings.MEDIA_ROOT = str(tmp_root)
    yield
    # tmp_path_factory cleans up automatically at session end.
