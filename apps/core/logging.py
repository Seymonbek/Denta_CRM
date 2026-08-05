"""T131 — Structured JSON logging + request-id correlation.

Two moving parts live here:

* :data:`request_id_var` / :data:`user_id_var` — process-local
  :class:`contextvars.ContextVar` slots that
  :class:`apps.core.middleware.RequestIdMiddleware` populates on every
  incoming request and :func:`_inject_context_into_record` reads back
  onto every log record.
* :class:`JsonFormatter` — a ``logging.Formatter`` subclass that emits
  each record as a single JSON object (one line per record) so log
  aggregators (CloudWatch, Datadog, Loki, GCP Logging) can index it
  natively. Sensitive fields (``args``, ``msg`` when it looks like an
  exception) are handled defensively so a formatter bug never crashes
  the request path.

Celery propagation lives in ``config/celery.py``: the ``task_prerun``
handler snapshots the calling request's contextvars into the task's
runtime and ``task_postrun`` clears them.
"""
from __future__ import annotations

import json
import logging
from contextvars import ContextVar
from typing import Any, Final

# ---------------------------------------------------------------------------
# Correlation slots
# ---------------------------------------------------------------------------
# Sentinel defaults keep the vars falsy but present so callers can
# ``.get()`` without wrapping in try/except.
request_id_var: ContextVar[str | None] = ContextVar(
    "dentacrm_request_id", default=None
)
user_id_var: ContextVar[str | None] = ContextVar(
    "dentacrm_user_id", default=None
)


# Public helper for the middleware to bind a fresh context.
def bind_request_context(*, request_id: str | None, user_id: str | None) -> None:
    """Populate the correlation vars for the current request."""
    request_id_var.set(request_id)
    user_id_var.set(user_id)


def clear_request_context() -> None:
    """Reset the correlation vars — call from teardown."""
    request_id_var.set(None)
    user_id_var.set(None)


# Standard log-record keys we don't want to duplicate in the JSON extras
# section (they already appear as top-level fields).
_RESERVED_LOG_KEYS: Final[frozenset[str]] = frozenset({
    "name", "msg", "args", "levelname", "levelno",
    "pathname", "filename", "module", "exc_info", "exc_text",
    "stack_info", "lineno", "funcName", "created", "msecs",
    "relativeCreated", "thread", "threadName", "processName",
    "process", "message", "asctime", "taskName",
})


class JsonFormatter(logging.Formatter):
    """Emit each log record as a single-line JSON object.

    Output shape (keys stable across versions):

    ``{"asctime": ..., "level": ..., "name": ..., "message": ...,
       "request_id": ..., "user_id": ..., "exc_info": ..., "extra": {...}}``

    ``request_id`` and ``user_id`` are pulled from the module-level
    ``ContextVar`` slots populated by
    :class:`apps.core.middleware.RequestIdMiddleware` (web) or the
    :mod:`config.celery` signal handlers (workers). When unset they
    are emitted as ``null`` so downstream tooling can filter on
    presence explicitly.
    """

    #: ISO-8601 with milliseconds, UTC-anchored — matches AWS CloudWatch.
    default_time_format = "%Y-%m-%dT%H:%M:%S"
    default_msec_format = "%s.%03dZ"

    def format(self, record: logging.LogRecord) -> str:
        # ``formatMessage`` interpolates ``msg % args`` safely; we call
        # it via ``self.format`` peers rather than ``record.getMessage()``
        # so upstream handlers still see the substituted string.
        try:
            message = record.getMessage()
        except Exception:  # noqa: BLE001
            # A broken record.args should never crash the log pipeline.
            message = str(record.msg)

        payload: dict[str, Any] = {
            "asctime": self.formatTime(record, self.default_time_format + self.default_msec_format[2:]),
            "level": record.levelname,
            "name": record.name,
            "message": message,
            "request_id": request_id_var.get(),
            "user_id": user_id_var.get(),
        }

        # Include exception traceback when present.
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        elif record.exc_text:
            payload["exc_info"] = record.exc_text

        # Ship any structured ``extra=`` kwargs from the log call as a
        # nested ``extra`` object. Reserved LogRecord keys are skipped.
        extra: dict[str, Any] = {}
        for key, value in record.__dict__.items():
            if key in _RESERVED_LOG_KEYS:
                continue
            if key.startswith("_"):
                continue
            try:
                json.dumps(value)
            except TypeError:
                extra[key] = repr(value)
            else:
                extra[key] = value
        if extra:
            payload["extra"] = extra

        try:
            return json.dumps(payload, ensure_ascii=False, default=str)
        except (TypeError, ValueError):
            # Last-resort safety net — never let a bad payload silence a
            # log line entirely.
            safe = {
                "level": record.levelname,
                "name": record.name,
                "message": message,
                "request_id": request_id_var.get(),
                "user_id": user_id_var.get(),
            }
            return json.dumps(safe, ensure_ascii=False, default=str)


__all__ = [
    "JsonFormatter",
    "request_id_var",
    "user_id_var",
    "bind_request_context",
    "clear_request_context",
]
