"""Development settings for DentaCRM."""
from __future__ import annotations

from .base import *  # noqa: F401,F403
from .base import env_bool, env_list

# ---------------------------------------------------------------------------
# Debug
# ---------------------------------------------------------------------------
DEBUG = env_bool("DJANGO_DEBUG", default=True)

# Loosen host/origin checks in dev.
ALLOWED_HOSTS = env_list(
    "DJANGO_ALLOWED_HOSTS",
    default=["*"],
)

# Show emails in the console instead of sending them.
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

# In dev, Celery can run tasks synchronously when EAGER=1 (used by tests).
CELERY_TASK_ALWAYS_EAGER = env_bool("CELERY_TASK_ALWAYS_EAGER", default=True)
CELERY_TASK_EAGER_PROPAGATES = True

# CORS: allow the Vite dev server unconditionally in local dev.
CORS_ALLOW_ALL_ORIGINS = True
