"""Standard error envelope for the whole DentaCRM API.

PROJECT_BRIEF.md § "Error format" requires **every** API error response
to use this exact shape::

    {
        "error": {
            "code": "VALIDATION_ERROR",
            "message": "Human-readable summary",
            "details": {...}
        }
    }

DRF's default handler returns an untyped ``{"detail": "..."}`` or the
raw serializer-error dict. We wrap those in a stable envelope and map
common exceptions to well-known codes so clients can localise messages
and drive UI states from the ``code`` field.
"""
from __future__ import annotations

import logging
from typing import Any

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Error-code table
# ---------------------------------------------------------------------------
# Ordering matters: more specific exceptions must appear before their
# superclasses.
_EXCEPTION_CODE_MAP: tuple[tuple[type[Exception], str], ...] = (
    (exceptions.ParseError, "PARSE_ERROR"),
    (exceptions.AuthenticationFailed, "AUTHENTICATION_FAILED"),
    (exceptions.NotAuthenticated, "NOT_AUTHENTICATED"),
    (exceptions.PermissionDenied, "PERMISSION_DENIED"),
    (DjangoPermissionDenied, "PERMISSION_DENIED"),
    (exceptions.NotFound, "NOT_FOUND"),
    (Http404, "NOT_FOUND"),
    (exceptions.MethodNotAllowed, "METHOD_NOT_ALLOWED"),
    (exceptions.NotAcceptable, "NOT_ACCEPTABLE"),
    (exceptions.UnsupportedMediaType, "UNSUPPORTED_MEDIA_TYPE"),
    (exceptions.Throttled, "THROTTLED"),
    (exceptions.ValidationError, "VALIDATION_ERROR"),
    (DjangoValidationError, "VALIDATION_ERROR"),
)


def _code_for(exc: Exception) -> str:
    """Return the canonical error code for ``exc``.

    Falls back to ``INTERNAL_ERROR`` for anything unmapped so clients
    always receive a stable string, never ``None``.
    """
    for exc_type, code in _EXCEPTION_CODE_MAP:
        if isinstance(exc, exc_type):
            return code
    return "INTERNAL_ERROR"


def _flatten_message(data: Any) -> str:
    """Produce a short human-readable summary from arbitrary DRF error data."""
    if isinstance(data, str):
        return data
    if isinstance(data, list) and data:
        return _flatten_message(data[0])
    if isinstance(data, dict):
        # Prefer 'detail', 'message', 'non_field_errors', otherwise the
        # first value in the dict.
        for key in ("detail", "message", "non_field_errors"):
            if key in data:
                return _flatten_message(data[key])
        if data:
            first_key = next(iter(data))
            return _flatten_message(data[first_key])
    return "An error occurred."


def _normalise_details(data: Any) -> dict[str, Any]:
    """Coerce DRF error data into a dict for ``details``.

    - ``dict`` → returned as-is (already field→errors mapping).
    - ``list`` → wrapped as ``{"errors": [...]}``.
    - anything else → wrapped as ``{"detail": <value>}``.
    """
    if isinstance(data, dict):
        return data
    if isinstance(data, list):
        return {"errors": data}
    return {"detail": data}


def custom_exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None:
    """DRF exception handler that renders the standard error envelope.

    Behaviour:
    - Delegates to DRF's default handler first so status codes and
      auth-header behaviour stay correct.
    - Wraps unhandled non-DRF exceptions as a 500 with code
      ``INTERNAL_ERROR`` (only when ``DEBUG`` is off — otherwise Django
      shows its own debug page, which is preferred locally).
    """
    # Translate a few Django exceptions to their DRF equivalents so the
    # default handler picks them up.
    if isinstance(exc, Http404):
        exc = exceptions.NotFound()
    elif isinstance(exc, DjangoPermissionDenied):
        exc = exceptions.PermissionDenied()
    elif isinstance(exc, DjangoValidationError):
        exc = exceptions.ValidationError(detail=list(exc.messages))

    response = exception_handler(exc, context)

    if response is None:
        # Unhandled exception — log and return a generic 500 envelope.
        # We intentionally do not leak the exception message to clients.
        logger.exception(
            "Unhandled exception in view %s",
            context.get("view").__class__.__name__ if context.get("view") else "?",
        )
        return Response(
            {
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "Internal server error.",
                    "details": {},
                }
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    code = _code_for(exc)
    message = _flatten_message(response.data)
    details = _normalise_details(response.data)

    response.data = {
        "error": {
            "code": code,
            "message": message,
            "details": details,
        }
    }
    return response
