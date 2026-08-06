"""Tests for T121 — the readiness probe at ``/readyz/``.

Contract covered:

* ``GET /readyz/`` returns HTTP 200 with ``{"status": "ready",
  "checks": {...}}`` when every dependency check passes.
* Each check reports its individual status so operators can diagnose a
  partial outage from the response body.
* When the database is unreachable the endpoint returns HTTP 503 with
  the failing check surfaced under ``checks.database.status = "error"``.
* When the cache backend fails the endpoint returns HTTP 503 with
  ``checks.cache.status = "error"``.
* The response is unauthenticated — orchestration platforms probe it
  without credentials.
* ``/healthz/`` (liveness) stays 200 even when downstream services are
  broken — this is what prevents kubelet from restart-storming a pod
  during a transient DB outage.
"""
from __future__ import annotations

from unittest.mock import patch

import pytest
from django.test import Client
from django.urls import reverse

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------
def test_readyz_returns_200_when_all_checks_pass():
    client = Client()
    response = client.get(reverse("readyz"))
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert set(body["checks"].keys()) == {"database", "cache"}
    for name, entry in body["checks"].items():
        assert entry["status"] == "ok", (
            f"check {name!r} should be ok but was {entry!r}"
        )


def test_readyz_reports_per_check_status():
    client = Client()
    body = client.get(reverse("readyz")).json()
    assert "checks" in body
    for check in body["checks"].values():
        assert "status" in check
        assert "detail" in check


def test_readyz_is_unauthenticated():
    """Probes must be reachable without credentials."""
    client = Client()  # no auth cookies / headers
    response = client.get(reverse("readyz"))
    assert response.status_code in (200, 503)


# ---------------------------------------------------------------------------
# Database failure
# ---------------------------------------------------------------------------
def test_readyz_returns_503_when_database_check_reports_error():
    """When the DB probe reports failure, readyz returns 503 with details."""
    from apps.core import health

    def _fake_db_check():
        return False, "database error: OperationalError"

    with patch.object(health, "_check_database", side_effect=_fake_db_check):
        response = Client().get(reverse("readyz"))

    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "not_ready"
    assert body["checks"]["database"]["status"] == "error"
    assert "OperationalError" in body["checks"]["database"]["detail"]
    # Cache still reported (independent axis).
    assert body["checks"]["cache"]["status"] == "ok"


# ---------------------------------------------------------------------------
# Cache failure
# ---------------------------------------------------------------------------
def test_readyz_returns_503_when_cache_check_reports_error():
    from apps.core import health

    def _fake_cache_check():
        return False, "cache error: ConnectionError"

    with patch.object(health, "_check_cache", side_effect=_fake_cache_check):
        response = Client().get(reverse("readyz"))

    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "not_ready"
    assert body["checks"]["cache"]["status"] == "error"
    assert body["checks"]["database"]["status"] == "ok"


def test_readyz_returns_503_when_multiple_checks_fail():
    """503 is returned when any subset of checks fails, and all failures are surfaced."""
    from apps.core import health

    with patch.object(health, "_check_database", side_effect=lambda: (False, "db down")):
        with patch.object(health, "_check_cache", side_effect=lambda: (False, "cache down")):
            response = Client().get(reverse("readyz"))

    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "not_ready"
    assert body["checks"]["database"]["status"] == "error"
    assert body["checks"]["cache"]["status"] == "error"


# ---------------------------------------------------------------------------
# Liveness isolation
# ---------------------------------------------------------------------------
def test_healthz_stays_200_when_dependencies_are_broken():
    """``/healthz/`` is liveness — must NOT touch DB or cache.

    Otherwise a transient DB outage causes k8s to restart the pod,
    which turns a downstream incident into an outage.
    """
    from apps.core import health

    with patch.object(health, "_check_database", side_effect=lambda: (False, "db down")):
        with patch.object(health, "_check_cache", side_effect=lambda: (False, "cache down")):
            response = Client().get(reverse("healthz"))

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"


def test_healthz_and_readyz_are_distinct_endpoints():
    """URL routing wires the two probes to different views."""
    healthz_response = Client().get(reverse("healthz"))
    readyz_response = Client().get(reverse("readyz"))
    # Different payload keys — liveness has "service", readiness has "checks".
    assert "service" in healthz_response.json()
    assert "checks" in readyz_response.json()
    assert "service" not in readyz_response.json()
