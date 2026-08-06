"""Celery application factory for DentaCRM.

Follows the pattern documented at
https://docs.celeryq.dev/en/stable/django/first-steps-with-django.html

The Django settings are read via ``DJANGO_SETTINGS_MODULE`` (defaults to
``config.settings.dev``) and every registered app's ``tasks.py`` is
auto-discovered.

T131 — Celery tasks inherit the calling request's ``request_id`` /
``user_id`` correlation ids so downstream logs can be traced across
web + worker. The ids travel from producer to consumer via a
``__correlation`` kwarg attached at ``before_task_publish`` and are
un-packed at ``task_prerun`` / cleared at ``task_postrun`` on the
worker side. When a task is enqueued outside a request (eg. Celery
Beat) the ids simply stay ``None`` — the worker logs still get the
task's own UUID as ``request_id`` so operators can still correlate.
"""
from __future__ import annotations

import os
import uuid
from typing import Any

from celery import Celery
from celery.signals import (
    before_task_publish,
    task_postrun,
    task_prerun,
)

# Ensure Django settings are available before the Celery app is instantiated.
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

app = Celery("dentacrm")

# Read Celery-specific config from Django settings, using the CELERY_ prefix.
app.config_from_object("django.conf:settings", namespace="CELERY")

# Auto-discover tasks in every INSTALLED_APPS app that has a tasks module.
app.autodiscover_tasks()


# ---------------------------------------------------------------------------
# T131 — correlation-id propagation web ⇄ worker
# ---------------------------------------------------------------------------
_CORRELATION_KEY = "__dentacrm_correlation"


@before_task_publish.connect
def _attach_correlation(
    sender: str | None = None,
    body: Any = None,
    headers: dict[str, Any] | None = None,
    properties: dict[str, Any] | None = None,
    **_: Any,
) -> None:
    """Snapshot request_id / user_id into task headers at publish time.

    Uses Celery's message headers (not kwargs) so we don't collide
    with a task's own signature — Celery preserves headers through
    serialisation.
    """
    # Local import avoids pulling Django settings at Celery-import time.
    from apps.core.logging import request_id_var, user_id_var

    if headers is None:
        return
    request_id = request_id_var.get()
    user_id = user_id_var.get()
    if request_id is None and user_id is None:
        return
    headers[_CORRELATION_KEY] = {
        "request_id": request_id,
        "user_id": user_id,
    }


@task_prerun.connect
def _bind_correlation(sender: Any = None, task_id: str | None = None, **_: Any) -> None:
    """Publish the task's correlation ids into contextvars so any log
    call within the task body picks them up automatically.
    """
    from apps.core.logging import bind_request_context

    correlation: dict[str, str] = {}
    if sender is not None:
        request_obj = getattr(sender, "request", None)
        if request_obj is not None:
            headers = getattr(request_obj, "headers", None) or {}
            if isinstance(headers, dict):
                candidate = headers.get(_CORRELATION_KEY)
                if isinstance(candidate, dict):
                    correlation = candidate

    request_id = correlation.get("request_id") if correlation else None
    user_id = correlation.get("user_id") if correlation else None

    # Fall back to a task-local id so worker logs still correlate a
    # single task run internally when no upstream request id exists.
    if not request_id:
        request_id = f"celery-{task_id or uuid.uuid4().hex}"

    bind_request_context(request_id=request_id, user_id=user_id)


@task_postrun.connect
def _clear_correlation(**_: Any) -> None:
    from apps.core.logging import clear_request_context

    clear_request_context()


@app.task(bind=True, ignore_result=True)
def debug_task(self) -> None:  # pragma: no cover - trivial debug helper
    """Emit self-request info; used for smoke-testing Celery wiring."""
    print(f"Request: {self.request!r}")
