"""Liveness and readiness probes for orchestration platforms.

Two distinct endpoints (Kubernetes semantics):

* ``/healthz/`` — **liveness**. Always returns 200 if the process is up
  and Django's URL routing / middleware chain resolves. Never touches
  external dependencies — a transient DB or Redis outage must NOT cause
  the pod to be killed and restarted (that would just add restart
  storms on top of an already-degraded downstream).

* ``/readyz/`` — **readiness**. Verifies that the app can actually serve
  traffic by running lightweight checks against every hard dependency
  the request path needs:

  - PostgreSQL: ``SELECT 1`` via ``connections['default'].cursor()``.
  - Cache backend: a set→get round-trip on a per-process key. Under
    Redis this hits the wire; under LocMemCache (unit tests) it stays
    in-memory but still validates that the cache API is wired up.

  Returns HTTP **200** with ``{"status": "ready", "checks": {...}}``
  when everything is green, **503 Service Unavailable** with the same
  envelope + a ``status: "not_ready"`` payload when any check fails.
  Each individual check is reported so operators can pinpoint the
  failing dependency from the response body.

  We deliberately never surface the check response through the standard
  DRF error envelope — orchestration platforms (Kubernetes, ECS,
  Nomad) match on plain HTTP status codes and don't parse JSON, so
  keeping the payload simple avoids coupling the health surface to
  API-envelope changes.

Both views are ``AllowAny`` and ``authentication_classes = []`` so
platform probes don't need credentials. Neither carries any user data.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any

from django.db import DatabaseError, connections
from django.http import JsonResponse

logger = logging.getLogger(__name__)


def liveness(_request: Any) -> JsonResponse:
    """``GET /healthz/`` — liveness probe.

    Returns 200 whenever the Django process is capable of executing a
    view. Does not touch any downstream service.
    """
    return JsonResponse({"status": "ok", "service": "dentacrm-backend"})


def _check_database() -> tuple[bool, str]:
    """Run ``SELECT 1`` against the default database.

    Returns ``(True, "ok")`` on success, ``(False, reason)`` on failure.
    We wrap the actual query in a fresh cursor + close it explicitly so
    the check does not leak a connection under a broken pool.
    """
    try:
        conn = connections["default"]
        with conn.cursor() as cursor:
            cursor.execute("SELECT 1")
            row = cursor.fetchone()
        if row != (1,):
            return False, f"unexpected row: {row!r}"
        return True, "ok"
    except DatabaseError as exc:
        logger.warning("readiness: database check failed: %s", exc)
        return False, f"database error: {exc.__class__.__name__}"
    except Exception as exc:  # noqa: BLE001 — protective boundary
        logger.exception("readiness: unexpected database check failure")
        return False, f"unexpected: {exc.__class__.__name__}"


def _check_cache() -> tuple[bool, str]:
    """Round-trip a random key through the default cache.

    Uses a UUID-based key so concurrent probes don't collide. The value
    is validated on read to catch pathological cache misconfigurations
    (e.g. the cache silently discarding writes).
    """
    # Local import so the module still imports when Django's app
    # registry is not yet ready (e.g. during ``manage.py check`` before
    # apps finish loading).
    from django.core.cache import cache

    key = f"readyz:{uuid.uuid4().hex}"
    sentinel = "ok"
    try:
        cache.set(key, sentinel, timeout=5)
        value = cache.get(key)
        cache.delete(key)
        if value != sentinel:
            return False, f"cache round-trip returned {value!r}"
        return True, "ok"
    except Exception as exc:  # noqa: BLE001 — protective boundary
        logger.warning("readiness: cache check failed: %s", exc)
        return False, f"cache error: {exc.__class__.__name__}"


def readiness(_request: Any) -> JsonResponse:
    """``GET /readyz/`` — readiness probe.

    Runs all registered checks and returns 200 iff every one is green,
    503 otherwise. The response body always includes the per-check
    status so a failing dependency is visible in the response.
    """
    checks: dict[str, dict[str, str]] = {}
    all_ok = True

    for name, runner in (("database", _check_database), ("cache", _check_cache)):
        ok, detail = runner()
        checks[name] = {"status": "ok" if ok else "error", "detail": detail}
        if not ok:
            all_ok = False

    payload = {
        "status": "ready" if all_ok else "not_ready",
        "checks": checks,
    }
    return JsonResponse(payload, status=200 if all_ok else 503)
