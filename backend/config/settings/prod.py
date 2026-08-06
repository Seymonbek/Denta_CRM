"""Production settings for DentaCRM.

Enforces DEBUG=False, secure cookies, HSTS, S3/MinIO storage backend.

T128 (production hardening) — the cookie / HSTS / TLS flags below are
tuned so a fresh deploy meets the baseline Mozilla Observatory + OWASP
ASVS §14 recommendations without needing operator action beyond
setting the env vars documented in ``dentacrm/.env.prod.example``:

* ``SESSION_COOKIE_SECURE`` — session cookie only over HTTPS.
* ``SESSION_COOKIE_HTTPONLY`` — session cookie not readable from JS.
* ``SESSION_COOKIE_SAMESITE`` — CSRF hardening on session cookies.
* ``CSRF_COOKIE_SECURE`` / ``CSRF_COOKIE_HTTPONLY`` / ``CSRF_COOKIE_SAMESITE``
  — same for the CSRF token cookie.
* ``SECURE_HSTS_SECONDS`` — env-configurable so staging can ship with
  a short lifetime (e.g. 60s) that lets ops back out of TLS quickly,
  while production defaults to 1 year with ``includeSubDomains`` and
  ``preload`` set for HSTS preload-list submission.
* ``SECURE_SSL_REDIRECT`` — env-gated so dev proxies stay HTTP, on by
  default in prod.
* ``SECURE_PROXY_SSL_HEADER`` — trust ``X-Forwarded-Proto: https`` from
  nginx / the load balancer so Django recognises the request as secure.
"""
from __future__ import annotations

from .base import *  # noqa: F401,F403
from .base import SECRET_KEY, SIMPLE_JWT, env_bool, env_int, env_list, env_str

# ---------------------------------------------------------------------------
# Debug + hosts
# ---------------------------------------------------------------------------
DEBUG = False

ALLOWED_HOSTS = env_list(
    "DJANGO_ALLOWED_HOSTS",
    default=[],  # MUST be set explicitly in prod.
)
if not ALLOWED_HOSTS:
    raise RuntimeError(
        "DJANGO_ALLOWED_HOSTS must be set in production (comma-separated)."
    )

# ---------------------------------------------------------------------------
# Fail loudly if secrets are still the insecure development defaults.
# Prevents accidentally deploying with the checked-in fallback key which
# would let anyone forge JWTs.
# ---------------------------------------------------------------------------
if not SECRET_KEY or SECRET_KEY.startswith("insecure-"):
    raise RuntimeError(
        "DJANGO_SECRET_KEY must be set to a real value in production."
    )
if not SIMPLE_JWT.get("SIGNING_KEY") or SIMPLE_JWT["SIGNING_KEY"].startswith(
    "insecure-"
):
    raise RuntimeError(
        "JWT signing key must be set (via DJANGO_SECRET_KEY) in production."
    )

# ---------------------------------------------------------------------------
# TLS / HSTS
#
# The proxy ssl header lets Django detect HTTPS behind nginx/an ALB.
# ``SECURE_SSL_REDIRECT`` can be disabled via env when a downstream
# terminator (e.g. Cloudflare or AWS ALB) already redirects HTTP → HTTPS,
# so we don't double-redirect and cause a redirect loop.
# ---------------------------------------------------------------------------
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env_bool("DJANGO_SECURE_SSL_REDIRECT", default=True)

# HSTS — 1 year default; staging can pass a short value (e.g. 60) so ops
# can back out of TLS without waiting a year for browser caches to
# expire. ``includeSubDomains`` and ``preload`` are safe defaults for a
# single-tenant CRM served from one apex domain.
SECURE_HSTS_SECONDS = env_int(
    "DJANGO_SECURE_HSTS_SECONDS", 60 * 60 * 24 * 365
)
SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool(
    "DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS", default=True
)
SECURE_HSTS_PRELOAD = env_bool("DJANGO_SECURE_HSTS_PRELOAD", default=True)

SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = env_str("DJANGO_REFERRER_POLICY", "same-origin")

# ---------------------------------------------------------------------------
# Cookies
#
# All cookies (session + CSRF) are marked Secure so they never travel
# over plain HTTP. HttpOnly + SameSite=Lax defeat the most common XSS
# → cookie exfiltration and CSRF patterns. ``Strict`` was rejected
# because it breaks OAuth-style top-level redirects some future
# identity providers use.
# ---------------------------------------------------------------------------
SESSION_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = env_str("DJANGO_SESSION_COOKIE_SAMESITE", "Lax")

CSRF_COOKIE_SECURE = True
CSRF_COOKIE_HTTPONLY = env_bool("DJANGO_CSRF_COOKIE_HTTPONLY", default=True)
CSRF_COOKIE_SAMESITE = env_str("DJANGO_CSRF_COOKIE_SAMESITE", "Lax")

# ---------------------------------------------------------------------------
# Storage — media via S3/MinIO
# ---------------------------------------------------------------------------
STORAGES = {
    "default": {
        "BACKEND": "storages.backends.s3.S3Storage",
        "OPTIONS": {
            "bucket_name": env_str("S3_BUCKET_MEDIA", "dentacrm-media"),
            "endpoint_url": env_str("S3_ENDPOINT_URL", ""),
            "access_key": env_str("S3_ACCESS_KEY", ""),
            "secret_key": env_str("S3_SECRET_KEY", ""),
            "region_name": env_str("S3_REGION", "us-east-1"),
            "addressing_style": "path",
            "querystring_auth": False,
            "file_overwrite": False,
        },
    },
    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.ManifestStaticFilesStorage",
    },
}

# ---------------------------------------------------------------------------
# Logging — WARNING baseline in prod
# ---------------------------------------------------------------------------
_log_json = env_bool("DJANGO_LOG_JSON", default=True)
_log_formatter = "json" if _log_json else "verbose"

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {"format": "%(asctime)s %(levelname)s %(name)s %(message)s"},
        "json": {
            "()": "apps.core.logging.JsonFormatter",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": _log_formatter,
        },
    },
    "root": {"handlers": ["console"], "level": env_str("DJANGO_LOG_LEVEL", "WARNING")},
}

# ---------------------------------------------------------------------------
# Sentry (optional)
# ---------------------------------------------------------------------------
_sentry_dsn = env_str("SENTRY_DSN", "")
if _sentry_dsn:  # pragma: no cover - runtime-only
    import sentry_sdk
    from sentry_sdk.integrations.celery import CeleryIntegration
    from sentry_sdk.integrations.django import DjangoIntegration

    sentry_sdk.init(
        dsn=_sentry_dsn,
        integrations=[DjangoIntegration(), CeleryIntegration()],
        traces_sample_rate=float(env_str("SENTRY_TRACES_SAMPLE_RATE", "0.0")),
        send_default_pii=False,
    )
