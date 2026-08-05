"""Cache-wrapped services for the ``reports`` app.

Every top-level report payload is memoised in Redis for
:data:`REPORT_CACHE_TTL` seconds. Cache keys are built from the endpoint
name and query parameters so different periods do not collide.

Views call these functions instead of the selectors directly. The
selectors remain fully usable from Celery tasks / management commands
without touching the cache layer.
"""
from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from django.core.cache import cache

from .selectors import (
    VALID_PERIODS,
    Period,
    dashboard_payload,
    departments_payload,
    procedures_payload,
    revenue_payload,
)

logger = logging.getLogger(__name__)

# 5-minute TTL — PROJECT_BRIEF § "reports app".
REPORT_CACHE_TTL: int = 5 * 60

# Cache key prefix. Combined with Django's global ``KEY_PREFIX`` in
# settings.CACHES this yields e.g. ``dentacrm:reports:dashboard:day``.
_CACHE_NAMESPACE = "reports"


def _cache_key(name: str, *parts: str) -> str:
    return ":".join([_CACHE_NAMESPACE, name, *parts])


def _validate_period(period: str) -> Period:
    if period not in VALID_PERIODS:
        raise ValueError(
            f"'period' must be one of {VALID_PERIODS}, got {period!r}"
        )
    return period  # type: ignore[return-value]


def _cached(key: str, compute: Callable[[], dict[str, Any]]) -> dict[str, Any]:
    """Return the cached value under ``key`` or compute + cache it."""
    try:
        hit = cache.get(key)
    except Exception:  # noqa: BLE001 — never let the cache backend crash the request
        logger.warning("reports: cache.get failed for key=%s", key, exc_info=True)
        hit = None
    if hit is not None:
        return hit

    value = compute()
    try:
        cache.set(key, value, timeout=REPORT_CACHE_TTL)
    except Exception:  # noqa: BLE001
        logger.warning("reports: cache.set failed for key=%s", key, exc_info=True)
    return value


# ---------------------------------------------------------------------------
# Public API — one function per endpoint.
# ---------------------------------------------------------------------------
def get_dashboard(period: str) -> dict[str, Any]:
    p = _validate_period(period)
    return _cached(_cache_key("dashboard", p), lambda: dashboard_payload(p))


def get_revenue(period: str) -> dict[str, Any]:
    p = _validate_period(period)
    return _cached(_cache_key("revenue", p), lambda: revenue_payload(p))


def get_procedures(period: str, *, limit: int = 10) -> dict[str, Any]:
    p = _validate_period(period)
    safe_limit = max(1, min(int(limit), 50))
    return _cached(
        _cache_key("procedures", p, f"limit-{safe_limit}"),
        lambda: procedures_payload(p, limit=safe_limit),
    )


def get_departments(period: str) -> dict[str, Any]:
    p = _validate_period(period)
    return _cached(_cache_key("departments", p), lambda: departments_payload(p))


def prime_dashboard_cache() -> dict[str, dict[str, Any]]:
    """Warm every dashboard variant. Called by the Celery beat task."""
    return {p: get_dashboard(p) for p in VALID_PERIODS}


def invalidate_all() -> None:
    """Delete every cached report payload.

    Called after a bulk seed / import / manual data edit — best-effort.
    We iterate over the known keys instead of calling ``cache.clear()``
    so unrelated caches are preserved.
    """
    endpoints = [
        ("dashboard", ()),
        ("revenue", ()),
        ("departments", ()),
    ]
    for name, _extra in endpoints:
        for p in VALID_PERIODS:
            try:
                cache.delete(_cache_key(name, p))
            except Exception:  # noqa: BLE001
                logger.warning(
                    "reports: cache.delete failed for %s/%s", name, p, exc_info=True,
                )
    # Procedures cache keys include a limit suffix — clear the common ones.
    for p in VALID_PERIODS:
        for limit in (5, 10, 20):
            try:
                cache.delete(_cache_key("procedures", p, f"limit-{limit}"))
            except Exception:  # noqa: BLE001
                pass


__all__ = [
    "REPORT_CACHE_TTL",
    "get_dashboard",
    "get_revenue",
    "get_procedures",
    "get_departments",
    "prime_dashboard_cache",
    "invalidate_all",
]
