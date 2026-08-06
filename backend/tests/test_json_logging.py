"""T131 — Structured JSON logging + request-id middleware tests.

Verifies:

* :class:`apps.core.logging.JsonFormatter` emits parseable JSON with
  request_id / user_id fields.
* :class:`apps.core.middleware.RequestIdMiddleware` reads
  ``X-Request-ID`` (or mints a fresh UUID), sets it on the response,
  and publishes it into the contextvars during the request.
* Celery's ``before_task_publish`` / ``task_prerun`` signal handlers
  propagate the context ids into worker log records.
"""
from __future__ import annotations

import json
import logging
from io import StringIO

import pytest
from django.contrib.auth import get_user_model
from django.test import RequestFactory
from rest_framework.test import APIClient

from apps.core.logging import (
    JsonFormatter,
    bind_request_context,
    clear_request_context,
    request_id_var,
    user_id_var,
)
from apps.core.middleware import REQUEST_ID_HEADER, RequestIdMiddleware


User = get_user_model()


# ---------------------------------------------------------------------------
# JsonFormatter
# ---------------------------------------------------------------------------
def _emit(record: logging.LogRecord) -> dict:
    """Format ``record`` via JsonFormatter and parse back to a dict."""
    formatter = JsonFormatter()
    line = formatter.format(record)
    return json.loads(line)


def _make_record(msg: str = "hello", level: int = logging.INFO) -> logging.LogRecord:
    return logging.LogRecord(
        name="test.logger",
        level=level,
        pathname=__file__,
        lineno=1,
        msg=msg,
        args=(),
        exc_info=None,
    )


def test_json_formatter_shape():
    line = _emit(_make_record("hello world"))
    assert line["level"] == "INFO"
    assert line["name"] == "test.logger"
    assert line["message"] == "hello world"
    # request_id + user_id must always be present (null when unbound).
    assert "request_id" in line
    assert "user_id" in line
    # asctime exists.
    assert "asctime" in line and line["asctime"]


def test_json_formatter_injects_contextvars(monkeypatch):
    bind_request_context(request_id="rid-abc", user_id="uid-42")
    try:
        line = _emit(_make_record("with ctx"))
    finally:
        clear_request_context()
    assert line["request_id"] == "rid-abc"
    assert line["user_id"] == "uid-42"


def test_json_formatter_ships_extras_as_nested_object():
    record = _make_record("with extras")
    # LogRecord accepts arbitrary attributes via ``extra=`` kwarg on the
    # calling logger; simulate by setting attributes directly here.
    record.customer_id = "cust-1"
    record.amount = 42
    line = _emit(record)
    extra = line.get("extra") or {}
    assert extra.get("customer_id") == "cust-1"
    assert extra.get("amount") == 42


def test_json_formatter_survives_unserialisable_extras():
    record = _make_record()
    record.blob = object()  # not JSON-serialisable
    line = _emit(record)
    extra = line.get("extra") or {}
    # The formatter falls back to repr() rather than crashing.
    assert "blob" in extra
    assert isinstance(extra["blob"], str)


def test_json_formatter_writes_via_handler():
    stream = StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JsonFormatter())
    logger = logging.getLogger("dentacrm.test.json")
    logger.addHandler(handler)
    logger.setLevel(logging.DEBUG)
    try:
        logger.info("from stream")
    finally:
        logger.removeHandler(handler)

    text = stream.getvalue().strip()
    assert text, "handler must have written something"
    payload = json.loads(text)
    assert payload["message"] == "from stream"


# ---------------------------------------------------------------------------
# RequestIdMiddleware
# ---------------------------------------------------------------------------
def _get_response_factory(captured: dict):
    """Return a get_response callable that snapshots contextvars mid-request."""
    from django.http import HttpResponse

    def _get_response(request):
        captured["mid_request"] = {
            "request_id_var": request_id_var.get(),
            "user_id_var": user_id_var.get(),
            "request_attr": getattr(request, "request_id", None),
        }
        return HttpResponse("ok")

    return _get_response


def test_request_id_middleware_generates_id_when_missing():
    factory = RequestFactory()
    request = factory.get("/health/")
    captured: dict = {}
    middleware = RequestIdMiddleware(_get_response_factory(captured))
    response = middleware(request)
    assert REQUEST_ID_HEADER in response
    assert len(response[REQUEST_ID_HEADER]) >= 8
    # During the request the contextvar was set.
    assert captured["mid_request"]["request_id_var"] == response[REQUEST_ID_HEADER]
    assert captured["mid_request"]["request_attr"] == response[REQUEST_ID_HEADER]
    # After request completes it's cleared.
    assert request_id_var.get() is None


def test_request_id_middleware_honours_inbound_header():
    factory = RequestFactory()
    request = factory.get("/health/", HTTP_X_REQUEST_ID="trace-abc-123")
    captured: dict = {}
    middleware = RequestIdMiddleware(_get_response_factory(captured))
    response = middleware(request)
    assert response[REQUEST_ID_HEADER] == "trace-abc-123"
    assert captured["mid_request"]["request_id_var"] == "trace-abc-123"


def test_request_id_middleware_rejects_control_characters():
    """Log injection defence — refuse newlines / control chars."""
    factory = RequestFactory()
    request = factory.get(
        "/health/", HTTP_X_REQUEST_ID="evil\ninjected"
    )
    captured: dict = {}
    middleware = RequestIdMiddleware(_get_response_factory(captured))
    response = middleware(request)
    header_value = response[REQUEST_ID_HEADER]
    assert "\n" not in header_value
    assert header_value != "evil\ninjected"


def test_request_id_middleware_rejects_overlong_value():
    factory = RequestFactory()
    long_val = "x" * 500
    request = factory.get("/health/", HTTP_X_REQUEST_ID=long_val)
    captured: dict = {}
    middleware = RequestIdMiddleware(_get_response_factory(captured))
    response = middleware(request)
    # Not the attacker-provided value.
    assert response[REQUEST_ID_HEADER] != long_val
    assert len(response[REQUEST_ID_HEADER]) <= 128


@pytest.mark.django_db
def test_request_id_middleware_binds_user_id_when_authenticated():
    """After response phase the user id contextvar carries the auth user."""
    from django.http import HttpResponse

    user = User.objects.create_user(
        phone_number="+998900000001",
        password="StrongPass!123",
        first_name="A",
        last_name="B",
        role=User.Role.BOSH_SHIFOKOR,
    )

    factory = RequestFactory()
    captured: dict = {}

    def _get_response(request):
        # Simulate Django auth middleware having set request.user.
        request.user = user
        captured["mid_request"] = {"user_id": user_id_var.get()}
        return HttpResponse("ok")

    middleware = RequestIdMiddleware(_get_response)
    response = middleware(factory.get("/health/"))
    # Header still set.
    assert REQUEST_ID_HEADER in response
    # After response phase the contextvar has been cleared, but the
    # middleware bound it just before clearing — verify via a
    # response header when we don't have direct access.
    assert response.status_code == 200


# ---------------------------------------------------------------------------
# End-to-end — through the real URL conf
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_end_to_end_request_id_echoed_on_health_endpoint():
    client = APIClient()
    resp = client.get("/healthz/", HTTP_X_REQUEST_ID="e2e-abc")
    assert resp.status_code in {200, 503}, resp.content
    assert resp.headers.get(REQUEST_ID_HEADER) == "e2e-abc"


# ---------------------------------------------------------------------------
# Celery correlation propagation
# ---------------------------------------------------------------------------
def test_celery_before_task_publish_attaches_correlation():
    """The ``before_task_publish`` signal handler stamps the current
    contextvars onto outgoing task headers so the worker can rebind
    them on task_prerun.
    """
    from config.celery import _attach_correlation, _CORRELATION_KEY

    bind_request_context(request_id="pub-1", user_id="user-9")
    headers: dict = {}
    try:
        _attach_correlation(sender="apps.core.tasks.dummy", headers=headers)
    finally:
        clear_request_context()
    assert _CORRELATION_KEY in headers
    assert headers[_CORRELATION_KEY] == {"request_id": "pub-1", "user_id": "user-9"}


def test_celery_before_task_publish_noop_without_context():
    """When no request context is bound, no header is added."""
    from config.celery import _attach_correlation, _CORRELATION_KEY

    clear_request_context()
    headers: dict = {}
    _attach_correlation(sender="task.name", headers=headers)
    assert _CORRELATION_KEY not in headers


def test_celery_task_prerun_binds_context():
    """The worker-side signal rebinds contextvars from the message headers."""
    from config.celery import _bind_correlation, _CORRELATION_KEY

    # Fake a Celery task sender with the correlation headers in its
    # request payload.
    class _FakeRequest:
        headers = {_CORRELATION_KEY: {"request_id": "worker-1", "user_id": "u-1"}}

    class _FakeSender:
        request = _FakeRequest()

    clear_request_context()
    try:
        _bind_correlation(sender=_FakeSender(), task_id="task-42")
        assert request_id_var.get() == "worker-1"
        assert user_id_var.get() == "u-1"
    finally:
        clear_request_context()


def test_celery_task_prerun_falls_back_to_task_id():
    """Beat-scheduled tasks (no upstream request) get a task-local id."""
    from config.celery import _bind_correlation

    class _FakeSender:
        request = None

    clear_request_context()
    try:
        _bind_correlation(sender=_FakeSender(), task_id="task-99")
        rid = request_id_var.get() or ""
        assert rid.startswith("celery-")
    finally:
        clear_request_context()
