"""Smoke tests for the Django project bootstrap (T2).

These verify that the settings load, the URL config resolves, and the
Swagger UI is reachable. They do not touch the database.
"""
from __future__ import annotations

from django.test import Client
from django.urls import reverse


def test_healthcheck_endpoint_returns_ok() -> None:
    """``/healthz/`` should return a 200 JSON payload."""
    client = Client()
    response = client.get("/healthz/")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["service"] == "dentacrm-backend"


def test_openapi_schema_endpoint_serves_schema() -> None:
    """drf-spectacular schema endpoint should be reachable."""
    client = Client()
    response = client.get(reverse("schema"))
    assert response.status_code == 200
    # Content-Type is either yaml or json depending on Accept header;
    # both are acceptable — we just verify a payload is returned.
    assert response.content, "schema response must not be empty"


def test_swagger_ui_is_reachable() -> None:
    """``/api/docs/`` should render the Swagger UI shell."""
    client = Client()
    response = client.get(reverse("swagger-ui"))
    assert response.status_code == 200
    assert b"swagger" in response.content.lower()
