"""Base Django settings for DentaCRM (shared between dev and prod).

Environment-specific settings live in ``config.settings.dev`` and
``config.settings.prod`` — those modules import from this one via
``from .base import *  # noqa: F401,F403``.

All secrets and environment-dependent values are read from environment
variables (never hard-coded). Docker-compose passes them through
``env_file: .env``.
"""
from __future__ import annotations

import os
from datetime import timedelta
from pathlib import Path
from typing import Any

import dj_database_url

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
# BASE_DIR points at backend/ (the directory containing manage.py).
BASE_DIR = Path(__file__).resolve().parent.parent.parent


# ---------------------------------------------------------------------------
# Small env helpers (avoid pulling extra deps like django-environ)
# ---------------------------------------------------------------------------
def env_str(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


def env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "y", "on"}


def env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def env_list(name: str, default: list[str] | None = None, sep: str = ",") -> list[str]:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return list(default or [])
    return [item.strip() for item in raw.split(sep) if item.strip()]


# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------
SECRET_KEY = env_str(
    "DJANGO_SECRET_KEY",
    "insecure-dev-key-change-me-do-not-use-in-production",
)
DEBUG = env_bool("DJANGO_DEBUG", default=False)
ALLOWED_HOSTS = env_list(
    "DJANGO_ALLOWED_HOSTS",
    default=["localhost", "127.0.0.1", "backend"],
)
CSRF_TRUSTED_ORIGINS = env_list(
    "DJANGO_CSRF_TRUSTED_ORIGINS",
    default=["http://localhost:5173", "http://localhost"],
)

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Custom user model — MUST be set before running any migration so that
# every downstream FK resolves to accounts.User rather than auth.User.
AUTH_USER_MODEL = "accounts.User"


# ---------------------------------------------------------------------------
# Installed apps
# ---------------------------------------------------------------------------
DJANGO_APPS: list[str] = [
    "unfold",  # Must be before django.contrib.admin
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS: list[str] = [
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "drf_spectacular",
    "django_filters",
    "corsheaders",
    "simple_history",
    "django_celery_beat",
    "django_celery_results",
    "storages",
]

# Local apps are added as they come online in subsequent build tasks.
# Each entry MUST correspond to a real ``apps/<name>/apps.py`` config to
# keep ``manage.py check`` green.
LOCAL_APPS: list[str] = [
    "apps.core",
    "apps.accounts",
    "apps.departments",
    "apps.doctors",
    "apps.patients",
    "apps.scheduling",
    "apps.treatments",
    "apps.odontogram",
    "apps.prescriptions",
    "apps.inventory",
    "apps.payments",
    "apps.ratings",
    "apps.notifications",
    "apps.reports",
    "apps.telegram_bot",
    "apps.ai_assistant",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS


# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------
MIDDLEWARE = [
    # GZip — compress all responses >200 bytes. Must be first (outermost)
    # so it wraps the final response. Reduces JSON payload sizes by ~70%.
    "django.middleware.gzip.GZipMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    # "django.middleware.locale.LocaleMiddleware",  # Disabled to force 'uz' language globally
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    # T126 — attaches Content-Security-Policy, Referrer-Policy,
    # Permissions-Policy, and X-Content-Type-Options to every response.
    # Runs last (outermost on the response path) so it can inspect
    # headers set by earlier middleware and honour them.
    "apps.core.middleware.SecurityHeadersMiddleware",
    # T131 — attach X-Request-ID to each request/response and bind
    # request_id + user_id into contextvars so JSON logs correlate
    # web + Celery + Sentry traces. Registered *after* the auth
    # middleware so ``request.user`` is populated by the time the
    # response phase re-binds the user id contextvar.
    "apps.core.middleware.RequestIdMiddleware",
    "simple_history.middleware.HistoryRequestMiddleware",
]


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]


# ---------------------------------------------------------------------------
# Database
#
# Prefer DATABASE_URL when set (docker-compose default). Fall back to
# individual POSTGRES_* vars, and finally to SQLite so that tooling like
# ``manage.py check`` and unit tests can run without a live Postgres.
# ---------------------------------------------------------------------------
_database_url = env_str("DATABASE_URL", "")
if _database_url:
    DATABASES: dict[str, dict[str, Any]] = {
        "default": dj_database_url.parse(
            _database_url,
            conn_max_age=env_int("DJANGO_DB_CONN_MAX_AGE", 60),
            conn_health_checks=True,
        )
    }
elif env_str("POSTGRES_HOST"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": env_str("POSTGRES_DB", "dentacrm"),
            "USER": env_str("POSTGRES_USER", "dentacrm"),
            "PASSWORD": env_str("POSTGRES_PASSWORD", "dentacrm"),
            "HOST": env_str("POSTGRES_HOST", "postgres"),
            "PORT": env_str("POSTGRES_PORT", "5432"),
            "CONN_MAX_AGE": env_int("DJANGO_DB_CONN_MAX_AGE", 60),
            "CONN_HEALTH_CHECKS": True,
        }
    }
else:
    # Local fallback — enables ``manage.py check`` / ``migrate`` outside
    # Docker and inside the CI sanity job before Postgres is available.
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }


# ---------------------------------------------------------------------------
# Password validation (minimal — real auth is JWT-based, not sessions)
# ---------------------------------------------------------------------------
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]


# ---------------------------------------------------------------------------
# Security response headers (T126)
#
# Empty string on any of these disables the corresponding header (useful
# in local dev when a browser extension conflicts). See
# ``apps/core/middleware.py`` for the effective default values.
# ---------------------------------------------------------------------------
CSP_POLICY = env_str("DJANGO_CSP_POLICY", "")
PERMISSIONS_POLICY = env_str("DJANGO_PERMISSIONS_POLICY", "")
REFERRER_POLICY_HEADER = env_str("DJANGO_REFERRER_POLICY", "same-origin")

# Fall back to the middleware's own defaults when the env vars are
# unset so operators only need to override when they need to.
if not CSP_POLICY:
    from apps.core.middleware import _DEFAULT_CSP as _CSP_DEFAULT

    CSP_POLICY = _CSP_DEFAULT
if not PERMISSIONS_POLICY:
    from apps.core.middleware import (
        _DEFAULT_PERMISSIONS_POLICY as _PP_DEFAULT,
    )

    PERMISSIONS_POLICY = _PP_DEFAULT


# ---------------------------------------------------------------------------
# Internationalisation (Uzbekistan)
# ---------------------------------------------------------------------------
LANGUAGE_CODE = "uz"
TIME_ZONE = "Asia/Tashkent"
USE_I18N = True
USE_TZ = True

LANGUAGES = [
    ("uz", "Oʻzbekcha"),
    ("ru", "Русский"),
    ("en", "English"),
]
LOCALE_PATHS = [BASE_DIR / "locale"]


# ---------------------------------------------------------------------------
# Static & media
# ---------------------------------------------------------------------------
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS: list[Path] = [BASE_DIR / "static"]

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# ---------------------------------------------------------------------------
# Unfold Admin Customization
# ---------------------------------------------------------------------------
from django.templatetags.static import static
from django.urls import reverse

UNFOLD: dict[str, Any] = {
    "SITE_TITLE": "DentaCRM Admin",
    "SITE_HEADER": "DentaCRM Admin Paneli",
    "SITE_SUBHEADER": "Stomatologiya CRM Boshqaruv Tizimi",
    "SITE_URL": "http://localhost:5173/",
    "SHOW_HISTORY": True,
    "SHOW_VIEW_ON_SITE": True,
    "STYLES": [
        lambda request: static("admin/css/custom_unfold.css"),
    ],
    "SIDEBAR": {
        "show_search": True,
        "show_all_applications": True,
        "navigation": [
            {
                "title": "Boshqaruv & Rollar",
                "separator": True,
                "items": [
                    {
                        "title": "Foydalanuvchilar",
                        "icon": "person",
                        "link": lambda request: reverse("admin:accounts_user_changelist"),
                    },
                    {
                        "title": "Bo'limlar",
                        "icon": "domain",
                        "link": lambda request: reverse("admin:departments_department_changelist"),
                    },
                ],
            },
            {
                "title": "Shifokorlar",
                "separator": True,
                "items": [
                    {
                        "title": "Shifokor Profillari",
                        "icon": "medical_services",
                        "link": lambda request: reverse("admin:doctors_doctorprofile_changelist"),
                    },
                    {
                        "title": "Ish Vaqtlari",
                        "icon": "schedule",
                        "link": lambda request: reverse("admin:doctors_workinghours_changelist"),
                    },
                    {
                        "title": "Dam Olish Kunlari",
                        "icon": "event_busy",
                        "link": lambda request: reverse("admin:doctors_timeoff_changelist"),
                    },
                    {
                        "title": "Muolaja Turlari",
                        "icon": "vaccines",
                        "link": lambda request: reverse("admin:doctors_proceduretype_changelist"),
                    },
                ],
            },
            {
                "title": "Bemorlar & Qabullar",
                "separator": True,
                "items": [
                    {
                        "title": "Bemorlar Ro'yxati",
                        "icon": "patient_list",
                        "link": lambda request: reverse("admin:patients_patient_changelist"),
                    },
                    {
                        "title": "Tashriflar & Qabullar",
                        "icon": "calendar_month",
                        "link": lambda request: reverse("admin:scheduling_appointment_changelist"),
                    },
                ],
            },
            {
                "title": "Davolash & Retseptlar",
                "separator": True,
                "items": [
                    {
                        "title": "Davolash Yozuvlari",
                        "icon": "dentistry",
                        "link": lambda request: reverse("admin:treatments_treatment_changelist"),
                    },
                    {
                        "title": "Davolash Rasmlari",
                        "icon": "photo_camera",
                        "link": lambda request: reverse("admin:treatments_treatmentphoto_changelist"),
                    },
                    {
                        "title": "Odontogram Yozuvlari",
                        "icon": "grid_view",
                        "link": lambda request: reverse("admin:odontogram_toothrecord_changelist"),
                    },
                    {
                        "title": "Retseptlar",
                        "icon": "prescriptions",
                        "link": lambda request: reverse("admin:prescriptions_prescription_changelist"),
                    },
                    {
                        "title": "Retsept Shablonlari",
                        "icon": "description",
                        "link": lambda request: reverse("admin:prescriptions_prescriptiontemplate_changelist"),
                    },
                ],
            },
            {
                "title": "Moliya & Sklad",
                "separator": True,
                "items": [
                    {
                        "title": "To'lovlar",
                        "icon": "payments",
                        "link": lambda request: reverse("admin:payments_payment_changelist"),
                    },
                    {
                        "title": "Komissiyalar",
                        "icon": "account_balance_wallet",
                        "link": lambda request: reverse("admin:payments_commissionrecord_changelist"),
                    },
                    {
                        "title": "Materiallar Zaxirasi",
                        "icon": "inventory_2",
                        "link": lambda request: reverse("admin:inventory_material_changelist"),
                    },
                    {
                        "title": "Material Sarfi",
                        "icon": "output",
                        "link": lambda request: reverse("admin:inventory_materialusage_changelist"),
                    },
                    {
                        "title": "Material Loglari",
                        "icon": "history",
                        "link": lambda request: reverse("admin:inventory_materialstocklog_changelist"),
                    },
                ],
            },
        ],
    },
}
# Upload size caps (T130)
#
# DATA_UPLOAD_MAX_MEMORY_SIZE caps the total request body Django will
# buffer in memory before writing a 413 (RequestEntityTooLarge). We set
# it to 10 MiB to leave headroom for a single ~8 MiB photo (see
# MAX_PHOTO_MB) plus multipart overhead. FILE_UPLOAD_MAX_MEMORY_SIZE
# controls when Django spills uploads to a temporary file on disk vs
# keeping them in RAM; keeping the two symmetric means a single-file
# upload stays fully in memory (faster for the Pillow verify() pass in
# apps.treatments.services.upload_treatment_photo).
#
# Per-photo validation (MIME, extension, Pillow.verify, size) is
# enforced in the service layer — see MAX_PHOTO_MB below.
# ---------------------------------------------------------------------------
DATA_UPLOAD_MAX_MEMORY_SIZE = env_int(
    "DATA_UPLOAD_MAX_MEMORY_SIZE", 10 * 1024 * 1024  # 10 MiB
)
FILE_UPLOAD_MAX_MEMORY_SIZE = env_int(
    "FILE_UPLOAD_MAX_MEMORY_SIZE", 10 * 1024 * 1024  # 10 MiB
)

# Treatment photo per-file cap (T130). Read by
# apps.treatments.services.upload_treatment_photo. 8 MiB is generous
# for a smartphone camera JPEG (typically 2–4 MiB) and leaves room for
# the 10 MiB request cap above without a hard clash.
MAX_PHOTO_MB = env_int("MAX_PHOTO_MB", 8)

# Storage backends (S3/MinIO overridden in prod.py; dev keeps local FS).
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
    },
}


# ---------------------------------------------------------------------------
# REST Framework
# ---------------------------------------------------------------------------
REST_FRAMEWORK: dict[str, Any] = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.StandardResultsSetPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ),
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    # Standard error envelope (see apps/core/exceptions.py).
    "EXCEPTION_HANDLER": "apps.core.exceptions.custom_exception_handler",
    "DEFAULT_RENDERER_CLASSES": (
        "rest_framework.renderers.JSONRenderer",
    ),
    "DEFAULT_PARSER_CLASSES": (
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.MultiPartParser",
        "rest_framework.parsers.FormParser",
    ),
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
    # ------------------------------------------------------------------
    # Throttling (T118)
    #
    # We do NOT enable ``DEFAULT_THROTTLE_CLASSES`` globally — throttling
    # is opt-in per view via ``throttle_scope``. This keeps authenticated
    # workloads unthrottled (they already gate on JWT + RBAC) and focuses
    # protection on unauthenticated attack surfaces (login, password
    # reset OTP). The rates below are read from env at settings-load time
    # so ops can tighten them without a code deploy.
    #
    # Scope keys are consumed by ``rest_framework.throttling.ScopedRateThrottle``
    # in each view's ``throttle_scope`` attribute; see
    # ``apps/accounts/views.py``.
    # ------------------------------------------------------------------
    "DEFAULT_THROTTLE_RATES": {
        "auth_login": env_str("LOGIN_RATE_LIMIT", "5/min"),
        "auth_password_reset": env_str("PASSWORD_RESET_RATE_LIMIT", "3/hour"),
    },
}

# In T3 the exception handler is replaced with the standard-envelope version:
#   REST_FRAMEWORK["EXCEPTION_HANDLER"] = "apps.core.exceptions.custom_exception_handler"
# In T3 the pagination class is replaced with:
#   REST_FRAMEWORK["DEFAULT_PAGINATION_CLASS"] =
#       "apps.core.pagination.StandardResultsSetPagination"
# (T3 done — see apps.core.pagination and apps.core.exceptions.)


# ---------------------------------------------------------------------------
# JWT (simplejwt)
#
# T124 — key separation. Historically ``SIGNING_KEY`` fell back to
# ``DJANGO_SECRET_KEY``, which forced ops to rotate both secrets in
# lockstep and coupled two concerns that live on different lifecycles:
#
#   * ``DJANGO_SECRET_KEY`` signs session cookies, password-reset
#     tokens, and CSRF tokens. Rotating it invalidates every logged-in
#     session but has no effect on already-issued JWTs.
#   * ``JWT_SIGNING_KEY`` signs API access + refresh tokens. Rotating
#     it invalidates every issued JWT (users must re-login) but has
#     no effect on session cookies.
#
# By reading ``JWT_SIGNING_KEY`` (with a same-secret fallback for
# backwards compatibility) we let ops rotate one without the other.
# ``get_random_secret_key()``-generated values are appropriate for
# both; the JWT key should be at least 256 bits of entropy for HS256.
# ---------------------------------------------------------------------------
_jwt_signing_key = env_str("JWT_SIGNING_KEY", "")
if not _jwt_signing_key:
    # Backwards-compatible fallback — reuse DJANGO_SECRET_KEY when
    # JWT_SIGNING_KEY is unset. Log a warning at settings-load time so
    # ops see the drift when they wire up a new deployment; the log
    # goes through the standard logging config (see LOGGING below).
    _jwt_signing_key = SECRET_KEY

SIMPLE_JWT: dict[str, Any] = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=env_int("JWT_ACCESS_TTL_MINUTES", 15)),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=env_int("JWT_REFRESH_TTL_DAYS", 7)),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
    "SIGNING_KEY": _jwt_signing_key,
    "ALGORITHM": env_str("JWT_ALGORITHM", "HS256"),
}


# ---------------------------------------------------------------------------
# drf-spectacular (Swagger / OpenAPI)
# ---------------------------------------------------------------------------
SPECTACULAR_SETTINGS: dict[str, Any] = {
    "TITLE": "DentaCRM API",
    "DESCRIPTION": (
        "Tish klinikalari uchun to'liq CRM tizimi. "
        "Backend: Django 5 + DRF. Auth: JWT (Bearer)."
    ),
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "SCHEMA_PATH_PREFIX": "/api/v1/",
    "SWAGGER_UI_SETTINGS": {
        "deepLinking": True,
        "persistAuthorization": True,
        "displayOperationId": False,
    },
    "SERVERS": [
        {"url": "http://localhost:8000", "description": "Local dev"},
    ],
    "TAGS": [
        {"name": "auth", "description": "Authentication endpoints"},
        {"name": "departments", "description": "Departments"},
        {"name": "doctors", "description": "Doctor profiles"},
        {"name": "patients", "description": "Patients"},
        {"name": "scheduling", "description": "Appointments"},
        {"name": "treatments", "description": "Treatments & odontogram"},
        {"name": "inventory", "description": "Materials & stock"},
        {"name": "payments", "description": "Payments & commissions"},
        {"name": "ratings", "description": "Doctor ratings & badges"},
        {"name": "reports", "description": "Aggregated reports"},
        {"name": "notifications", "description": "Outbound notifications inbox"},
    ],
}


# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = env_list(
    "DJANGO_CORS_ALLOWED_ORIGINS",
    default=["http://localhost:5173", "http://localhost"],
)
CORS_ALLOW_CREDENTIALS = True


# ---------------------------------------------------------------------------
# Cache (Redis / LocMem fallback)
# ---------------------------------------------------------------------------
_redis_url = env_str("REDIS_URL", "")
if _redis_url:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": _redis_url,
            "TIMEOUT": 300,  # 5 min default TTL; reports override where needed.
            "KEY_PREFIX": "dentacrm",
        }
    }
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "dentacrm-locmem",
        }
    }



# ---------------------------------------------------------------------------
# Celery
# ---------------------------------------------------------------------------
CELERY_BROKER_URL = env_str("CELERY_BROKER_URL", "") or "memory://"
CELERY_RESULT_BACKEND = env_str("CELERY_RESULT_BACKEND", "") or "rpc://"


CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE
CELERY_ENABLE_UTC = True
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 5 * 60
CELERY_BEAT_SCHEDULER = "django_celery_beat.schedulers:DatabaseScheduler"
# When True, tasks run in-process (used in tests to avoid a broker).
CELERY_TASK_ALWAYS_EAGER = env_bool("CELERY_TASK_ALWAYS_EAGER", default=False)
CELERY_TASK_EAGER_PROPAGATES = env_bool("CELERY_TASK_EAGER_PROPAGATES", default=False)


# ---------------------------------------------------------------------------
# Celery Beat schedule — periodic tasks (PROJECT_BRIEF § "Celery Tasks").
# Uses ``crontab`` so entries survive worker restarts.
# ---------------------------------------------------------------------------
from celery.schedules import crontab  # noqa: E402  (import after CELERY_* set)

CELERY_BEAT_SCHEDULE: dict[str, Any] = {
    "send-appointment-reminder-1day": {
        "task": "apps.scheduling.tasks.send_appointment_reminder_1day",
        # Run hourly at :05 — the task itself dedupes via reminder_1d_sent.
        "schedule": crontab(minute="5"),
    },
    "send-appointment-reminder-2hour": {
        "task": "apps.scheduling.tasks.send_appointment_reminder_2hour",
        # Every 15 minutes — small window so 2h reminders are timely.
        "schedule": crontab(minute="*/15"),
    },
    "send-followup-invite": {
        "task": "apps.scheduling.tasks.send_followup_invite",
        # Once a day at 09:00 Asia/Tashkent.
        "schedule": crontab(minute="0", hour="9"),
    },
    "generate-dashboard-cache": {
        "task": "apps.reports.tasks.generate_dashboard_cache",
        "schedule": crontab(minute="*/5"),
    },
    "backup-database": {
        "task": "apps.core.tasks.backup_database",
        # Daily at 03:30 Asia/Tashkent (low traffic).
        "schedule": crontab(minute="30", hour="3"),
    },
    "check-low-stock-sweep": {
        "task": "apps.inventory.tasks.sweep_low_stock",
        # Every 30 minutes — belt-and-braces alongside the post_save signal.
        "schedule": crontab(minute="*/30"),
    },
}


# ---------------------------------------------------------------------------
# Database backup (used by apps.core.tasks.backup_database).
# ---------------------------------------------------------------------------
DB_BACKUPS_ENABLED = env_bool("DB_BACKUPS_ENABLED", default=False)
DB_BACKUPS_DIR = env_str("DB_BACKUPS_DIR", "")  # default resolved at runtime


# ---------------------------------------------------------------------------
# Storage (S3/MinIO) — dev keeps FileSystemStorage; prod.py overrides.
# ---------------------------------------------------------------------------
AWS_ACCESS_KEY_ID = env_str("S3_ACCESS_KEY", "")
AWS_SECRET_ACCESS_KEY = env_str("S3_SECRET_KEY", "")
AWS_STORAGE_BUCKET_NAME = env_str("S3_BUCKET_MEDIA", "dentacrm-media")
AWS_S3_ENDPOINT_URL = env_str("S3_ENDPOINT_URL", "http://minio:9000")
AWS_S3_REGION_NAME = env_str("S3_REGION", "us-east-1")
AWS_S3_ADDRESSING_STYLE = "path"
AWS_QUERYSTRING_AUTH = False
AWS_S3_FILE_OVERWRITE = False


# ---------------------------------------------------------------------------
# Telegram (bot token read from env; empty in dev = mocked sender in T22).
# ---------------------------------------------------------------------------
TELEGRAM_BOT_TOKEN = env_str("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_WEBHOOK_URL = env_str("TELEGRAM_WEBHOOK_URL", "")


# ---------------------------------------------------------------------------
# Logging (structured; INFO in dev, WARNING in prod)
#
# T131 — a ``JsonFormatter`` handler is available under the ``json``
# formatter name. It reads request_id + user_id from the contextvars
# populated by :class:`apps.core.middleware.RequestIdMiddleware`. Flip
# ``DJANGO_LOG_JSON=1`` in the environment to route the console
# handler through it. Prod defaults it on; dev defaults it off so
# tail-ing runserver logs stays human-readable.
# ---------------------------------------------------------------------------
_LOG_JSON = env_bool("DJANGO_LOG_JSON", default=False)
_LOG_FORMATTER = "json" if _LOG_JSON else "verbose"

LOGGING: dict[str, Any] = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "%(asctime)s %(levelname)s %(name)s %(message)s",
        },
        "json": {
            "()": "apps.core.logging.JsonFormatter",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": _LOG_FORMATTER,
        },
    },
    "root": {
        "handlers": ["console"],
        "level": env_str("DJANGO_LOG_LEVEL", "INFO"),
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": env_str("DJANGO_LOG_LEVEL", "INFO"),
            "propagate": False,
        },
        "celery": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
    },
}


# ---------------------------------------------------------------------------
# Simple-history configuration
# ---------------------------------------------------------------------------
SIMPLE_HISTORY_REVERT_DISABLED = True


# ---------------------------------------------------------------------------
# Django Unfold Configuration (T133)
# ---------------------------------------------------------------------------
UNFOLD = {
    "SITE_TITLE": "DentaCRM Premium Admin",
    "SITE_HEADER": "DentaCRM Admin",
    "SITE_SYMBOL": "medical_services",
    "SHOW_HISTORY": True,
    "SHOW_VIEW_ON_SITE": False,
    "THEME": "dark",  # default to dark mode to match our premium theme
    "STYLES": [
        lambda request: "/static/css/admin_custom.css",
    ],
    "SCRIPTS": [
        lambda request: "/static/js/admin_custom.js",
    ],
    "COLORS": {
        "primary": {
            "50": "240 253 250",
            "100": "204 251 241",
            "200": "153 246 228",
            "300": "94 234 212",
            "400": "45 212 191",
            "500": "20 184 166",
            "600": "13 148 136",
            "700": "15 118 110",
            "800": "17 94 89",
            "900": "19 78 74",
            "950": "4 47 46",
        },
    },
    "ACCOUNT": {
        "navigation": [
            {
                "title": "Saytni ko'rish",
                "link": "/",
                "icon": "visibility",
            },
            {
                "title": "Parolni o'zgartirish",
                "link": "/admin/password_change/",
                "icon": "password",
            },
            {
                "title": "Tizimdan chiqish",
                "link": "/admin/logout/",
                "icon": "logout",
            },
        ],
    },
    "SIDEBAR": {
        "show_search": True,
        "show_all_applications": False,
        "navigation": [
            {
                "title": "Boshqaruv & Rollar",
                "separator": True,
                "items": [
                    {
                        "title": "Foydalanuvchilar",
                        "icon": "people",
                        "link": "/admin/accounts/user/",
                    },
                    {
                        "title": "Bo'limlar",
                        "icon": "domain",
                        "link": "/admin/departments/department/",
                    },
                ],
            },
            {
                "title": "Shifokorlar",
                "separator": True,
                "items": [
                    {
                        "title": "Shifokor Profillari",
                        "icon": "badge",
                        "link": "/admin/doctors/doctorprofile/",
                    },
                    {
                        "title": "Ish Vaqtlari",
                        "icon": "schedule",
                        "link": "/admin/doctors/workinghours/",
                    },
                    {
                        "title": "Dam Olish Kunlari",
                        "icon": "event_busy",
                        "link": "/admin/doctors/timeoff/",
                    },
                    {
                        "title": "Muolaja Turlari",
                        "icon": "healing",
                        "link": "/admin/doctors/proceduretype/",
                    },
                ],
            },
            {
                "title": "Bemorlar & Qabullar",
                "separator": True,
                "items": [
                    {
                        "title": "Bemorlar Ro'yxati",
                        "icon": "person",
                        "link": "/admin/patients/patient/",
                    },
                    {
                        "title": "Tashriflar & Qabullar",
                        "icon": "calendar_month",
                        "link": "/admin/scheduling/appointment/",
                    },
                ],
            },
            {
                "title": "Davolash & Retseptlar",
                "separator": True,
                "items": [
                    {
                        "title": "Davolash Yozuvlari",
                        "icon": "medical_information",
                        "link": "/admin/treatments/treatment/",
                    },
                    {
                        "title": "Davolash Rasmlari",
                        "icon": "photo_library",
                        "link": "/admin/treatments/treatmentphoto/",
                    },
                    {
                        "title": "Odontogram Yozuvlari",
                        "icon": "dentistry",
                        "link": "/admin/odontogram/toothrecord/",
                    },
                    {
                        "title": "Retseptlar",
                        "icon": "assignment",
                        "link": "/admin/prescriptions/prescription/",
                    },
                    {
                        "title": "Retsept Shablonlari",
                        "icon": "description",
                        "link": "/admin/prescriptions/prescriptiontemplate/",
                    },
                ],
            },
            {
                "title": "Moliya",
                "separator": True,
                "items": [
                    {
                        "title": "To'lovlar",
                        "icon": "payments",
                        "link": "/admin/payments/payment/",
                    },
                    {
                        "title": "Komissiya Yozuvlari",
                        "icon": "account_balance_wallet",
                        "link": "/admin/payments/commissionrecord/",
                    },
                ],
            },
            {
                "title": "Sklad (Inventory)",
                "separator": True,
                "items": [
                    {
                        "title": "Materiallar",
                        "icon": "inventory_2",
                        "link": "/admin/inventory/material/",
                    },
                    {
                        "title": "Ishlatilgan Materiallar",
                        "icon": "outbox",
                        "link": "/admin/inventory/materialusage/",
                    },
                    {
                        "title": "Sklad Tarixi (Log)",
                        "icon": "history",
                        "link": "/admin/inventory/materialstocklog/",
                    },
                ],
            },
            {
                "title": "Motivatsiya & Reyting",
                "separator": True,
                "items": [
                    {
                        "title": "Ball Yozuvlari",
                        "icon": "star",
                        "link": "/admin/ratings/scorelog/",
                    },
                    {
                        "title": "Nishonlar (Badges)",
                        "icon": "military_tech",
                        "link": "/admin/ratings/badge/",
                    },
                    {
                        "title": "Shifokor Nishonlari",
                        "icon": "workspace_premium",
                        "link": "/admin/ratings/doctorbadge/",
                    },
                ],
            },
            {
                "title": "Tizim & Bildirishnomalar",
                "separator": True,
                "items": [
                    {
                        "title": "Bildirishnoma Loglari",
                        "icon": "notifications",
                        "link": "/admin/notifications/notificationlog/",
                    },
                    {
                        "title": "OTP Kodlar",
                        "icon": "security",
                        "link": "/admin/accounts/otpcode/",
                    },
                ],
            },
        ],
    },
}


