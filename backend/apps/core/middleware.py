"""Security-headers middleware.

T126 — attaches Content-Security-Policy plus a handful of well-known
"defence in depth" headers to every outbound response. The values are
tuned for a Django-API + React-SPA deployment fronted by nginx:

* ``Content-Security-Policy`` — locks script/style sources to
  ``'self'`` and Swagger's CDN needs. drf-spectacular's Swagger UI is
  served from ``/api/docs/`` and loads its bundle from unpkg by
  default — the default policy therefore allows the ``unpkg.com`` CDN
  script/style origin. Ops can override the full policy via
  ``DJANGO_CSP_POLICY`` env var.
* ``X-Content-Type-Options: nosniff`` — refuse MIME sniffing.
* ``Referrer-Policy: same-origin`` — safest sane default for a
  first-party SPA.
* ``Permissions-Policy`` — disable camera / microphone / geolocation
  which the app doesn't need; can be overridden via
  ``DJANGO_PERMISSIONS_POLICY``.
* ``X-Frame-Options`` is already set by Django's built-in
  ``XFrameOptionsMiddleware`` — we skip it to avoid conflicts.

The middleware is a no-op when the response already carries the given
header (e.g. Django's ``SecurityMiddleware`` set ``Referrer-Policy``
first). Django's ``SECURE_CONTENT_TYPE_NOSNIFF`` handles
``X-Content-Type-Options`` when set to True; if operators enable it
this middleware will not overwrite it.

T131 — :class:`RequestIdMiddleware` reads ``X-Request-ID`` from the
inbound request (or generates a UUIDv4), publishes it via the
contextvars in :mod:`apps.core.logging`, and echoes it back on the
response so downstream services (nginx access logs, browser dev tools,
Sentry) share the same trace id. It also binds the current
authenticated user id so log records can be filtered per user.
"""
from __future__ import annotations

import uuid
from typing import Callable

from django.conf import settings
from django.http import HttpRequest, HttpResponse

from .logging import (
    bind_request_context,
    clear_request_context,
    request_id_var,
    user_id_var,
)


# ---------------------------------------------------------------------------
# Default CSP — safe for an API + Swagger UI + local Vite dev server
# ---------------------------------------------------------------------------
_DEFAULT_CSP = (
    "default-src 'self'; "
    # Swagger UI loads its bundle from unpkg (drf-spectacular default).
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://fonts.googleapis.com; "
    "img-src 'self' data: blob: https:; "
    "font-src 'self' data: https://fonts.gstatic.com; "
    "connect-src 'self' ws: wss:; "
    "frame-ancestors 'none'; "
    "base-uri 'self'; "
    "form-action 'self'; "
    "object-src 'none'"
)

_DEFAULT_PERMISSIONS_POLICY = (
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), "
    "accelerometer=(), gyroscope=(), magnetometer=()"
)


class SecurityHeadersMiddleware:
    """Attach hardened security headers to every response.

    Config surface (settings — read once at middleware init):

    * ``CSP_POLICY`` (str) — full CSP header value; defaults to
      :data:`_DEFAULT_CSP`. Set to empty string to skip the header.
    * ``PERMISSIONS_POLICY`` (str) — full Permissions-Policy header
      value; defaults to :data:`_DEFAULT_PERMISSIONS_POLICY`. Set to
      empty string to skip.
    * ``REFERRER_POLICY_HEADER`` (str) — value for the ``Referrer-Policy``
      header; defaults to ``"same-origin"``. Set to empty string to skip.
    """

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response
        self.csp = getattr(settings, "CSP_POLICY", _DEFAULT_CSP)
        self.permissions_policy = getattr(
            settings, "PERMISSIONS_POLICY", _DEFAULT_PERMISSIONS_POLICY
        )
        self.referrer_policy = getattr(
            settings, "REFERRER_POLICY_HEADER", "same-origin"
        )

    def __call__(self, request: HttpRequest) -> HttpResponse:
        response = self.get_response(request)

        if self.csp and "Content-Security-Policy" not in response:
            response["Content-Security-Policy"] = self.csp

        # Only set ``X-Content-Type-Options`` when Django's built-in
        # ``SecurityMiddleware`` did not (SECURE_CONTENT_TYPE_NOSNIFF=False).
        if "X-Content-Type-Options" not in response:
            response["X-Content-Type-Options"] = "nosniff"

        if (
            self.referrer_policy
            and "Referrer-Policy" not in response
        ):
            response["Referrer-Policy"] = self.referrer_policy

        if (
            self.permissions_policy
            and "Permissions-Policy" not in response
        ):
            response["Permissions-Policy"] = self.permissions_policy

        return response


__all__ = ["SecurityHeadersMiddleware", "RequestIdMiddleware"]


# ---------------------------------------------------------------------------
# T131 — request-id correlation
# ---------------------------------------------------------------------------
REQUEST_ID_HEADER = "X-Request-ID"
_META_KEY = "HTTP_X_REQUEST_ID"


def _incoming_request_id(request: HttpRequest) -> str:
    """Return the inbound request-id, sanitised.

    Trust an inbound header only when it looks reasonable (printable,
    ≤ 128 chars). Otherwise generate a fresh UUIDv4 so a malicious
    client can't inject newlines / control characters into our logs.
    """
    raw = request.META.get(_META_KEY, "")
    if not raw:
        return uuid.uuid4().hex
    raw = raw.strip()
    if not raw or len(raw) > 128:
        return uuid.uuid4().hex
    # Only keep the ASCII subset humans use for trace ids.
    for ch in raw:
        if not (ch.isalnum() or ch in "-_"):
            return uuid.uuid4().hex
    return raw


class RequestIdMiddleware:
    """Attach ``X-Request-ID`` to every request/response + log record.

    * Reads ``X-Request-ID`` from the request (or mints a fresh
      UUIDv4 when absent / invalid).
    * Stores the value on ``request.request_id`` so views / signal
      handlers can read it without touching contextvars.
    * Publishes it via :data:`apps.core.logging.request_id_var` so the
      JSON formatter (and any custom filter) emits it on every log
      record produced during the request.
    * Publishes the authenticated user id via
      :data:`apps.core.logging.user_id_var` so log slicing per user
      works out of the box.
    * Echoes the id back in the response header so clients (and any
      L7 proxy access log) share the same trace token.
    """

    def __init__(
        self, get_response: Callable[[HttpRequest], HttpResponse]
    ) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        request_id = _incoming_request_id(request)
        request.request_id = request_id  # type: ignore[attr-defined]

        # User id is best-effort: middleware runs before DRF's auth
        # for API requests, so we defer resolution to the response
        # phase via ``request.user`` (which the auth middleware may
        # have populated by then).
        bind_request_context(request_id=request_id, user_id=None)
        try:
            response = self.get_response(request)
            user = getattr(request, "user", None)
            if user is not None and getattr(user, "is_authenticated", False):
                bind_request_context(
                    request_id=request_id,
                    user_id=str(getattr(user, "pk", "")) or None,
                )
            if REQUEST_ID_HEADER not in response:
                response[REQUEST_ID_HEADER] = request_id
            return response
        finally:
            clear_request_context()
