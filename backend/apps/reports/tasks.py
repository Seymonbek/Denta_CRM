"""Celery tasks for the ``reports`` app.

The recurring :func:`generate_dashboard_cache` task pre-warms the Redis
cache used by the reports endpoints (5-minute TTL). Running the task
inside beat guarantees the frontend never sees a full cache-miss.
"""
from __future__ import annotations

import logging

from celery import shared_task
from django.core.cache import cache

from . import services

logger = logging.getLogger(__name__)


@shared_task(name="apps.reports.tasks.generate_dashboard_cache")
def generate_dashboard_cache() -> dict[str, int]:
    """Pre-warm the reports cache for the three canonical periods.

    We call the service invalidator first so the next warm-up returns
    the freshest numbers. All exceptions are caught per-endpoint so a
    single failure never poisons the whole beat run.
    """
    counts: dict[str, int] = {}
    try:
        services.invalidate_all()
    except Exception:  # noqa: BLE001
        logger.warning("reports: invalidate_all failed", exc_info=True)

    for period in ("day", "week", "month"):
        try:
            services.get_dashboard(period=period)
            counts[f"dashboard.{period}"] = 1
        except Exception:  # noqa: BLE001
            logger.exception("reports: warming dashboard.%s failed", period)
            counts[f"dashboard.{period}"] = 0

        try:
            services.get_revenue(period=period)
            counts[f"revenue.{period}"] = 1
        except Exception:  # noqa: BLE001
            logger.exception("reports: warming revenue.%s failed", period)
            counts[f"revenue.{period}"] = 0

        try:
            services.get_departments(period=period)
            counts[f"departments.{period}"] = 1
        except Exception:  # noqa: BLE001
            logger.exception("reports: warming departments.%s failed", period)
            counts[f"departments.{period}"] = 0

        try:
            services.get_procedures(period=period, limit=10)
            counts[f"procedures.{period}"] = 1
        except Exception:  # noqa: BLE001
            logger.exception("reports: warming procedures.%s failed", period)
            counts[f"procedures.{period}"] = 0

    _ = cache  # keep the import — celery workers reuse it for eviction
    return counts


__all__ = ["generate_dashboard_cache"]
