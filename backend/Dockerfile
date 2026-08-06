# syntax=docker/dockerfile:1.6
#
# DentaCRM backend — development image.
#
# Task-1 scope: minimal, cache-friendly image that installs the pinned
# development requirements. The actual Django code is added in the next
# task (T2). We copy only the requirements/ folder so that source edits do
# not invalidate the pip layer.
#
# The image is intentionally NOT a multi-stage build in dev — hot-reload
# via mounted volumes is more important than image size here. The prod
# variant (task T28) uses a slim multi-stage build instead.

FROM python:3.12-slim-bookworm AS base

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONPATH=/app

# ---------------------------------------------------------------------------
# System dependencies
#   - build-essential + libpq-dev: psycopg build fallback (binary wheel is
#     preferred but this keeps the image resilient across arches)
#   - curl: healthchecks
#   - gettext: Django translations (uz locale)
#   - postgresql-client: `pg_dump` for the backup Celery task (T23)
# ---------------------------------------------------------------------------
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
        curl \
        gettext \
        postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------
# Non-root user
# ---------------------------------------------------------------------------
RUN useradd --create-home --shell /bin/bash --uid 1000 app
WORKDIR /app

# ---------------------------------------------------------------------------
# Python dependencies (cached layer)
#
# requirements/base.txt is the canonical pinned list. In T2 it will contain
# Django, DRF, simplejwt, etc. For T1 we only need pip to be functional so
# that `docker compose build backend` succeeds even before Django code
# exists. An empty base.txt is placed alongside this Dockerfile.
# ---------------------------------------------------------------------------
COPY requirements/ /app/requirements/
RUN pip install --upgrade "pip==24.2" "setuptools==75.1.0" "wheel==0.44.0" \
    && if [ -s /app/requirements/dev.txt ]; then \
           pip install -r /app/requirements/dev.txt; \
       elif [ -s /app/requirements/base.txt ]; then \
           pip install -r /app/requirements/base.txt; \
       else \
           echo "requirements/*.txt is empty — skipping pip install (T1)"; \
       fi

# ---------------------------------------------------------------------------
# Application source
# In dev, the whole backend/ tree is mounted over /app via docker-compose
# so this COPY is a fallback for builds without a bind-mount.
# ---------------------------------------------------------------------------
COPY --chown=app:app . /app

USER app

EXPOSE 8000

# Default dev command — the docker-compose service overrides this per role
# (backend / celery_worker / celery_beat / bot). We fall back to a shell so
# the container stays alive if started without a command.
CMD ["bash", "-lc", "python -c 'import sys; print(\"dentacrm backend image ready:\", sys.version)'; tail -f /dev/null"]
