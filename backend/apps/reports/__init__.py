"""Reports app — aggregate read-only endpoints for the head doctor.

The app is intentionally *modelless* — PROJECT_BRIEF § "reports app"
mandates "Modelsiz — faqat aggregate selectors". Its purpose is to
expose pre-computed dashboards / KPIs derived from data already stored
by the domain apps (payments, treatments, scheduling, inventory, …).

Public surface
--------------
* :mod:`apps.reports.selectors` — pure query helpers (no side effects).
* :mod:`apps.reports.services`  — cache-wrapped facade used by views.
* :mod:`apps.reports.views`     — DRF endpoints under ``/api/v1/reports/``.

Caching
-------
Every top-level report result is cached in Redis for 5 minutes
(:data:`apps.reports.services.REPORT_CACHE_TTL`). Cache keys are stable
per ``(endpoint, period, filters)`` tuple so repeat requests within the
window are served from cache. The Celery task ``regenerate_dashboard_cache``
(T23) primes these keys once every 5 min so the first request of a
window never pays the compute cost.
"""

default_app_config = "apps.reports.apps.ReportsConfig"
