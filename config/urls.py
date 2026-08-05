"""Root URL configuration for DentaCRM.

The API is versioned under ``/api/v1/`` and every app registers its own
router / URLconf via ``config.urls`` include statements added as the app
comes online in subsequent build tasks.
"""
from __future__ import annotations

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from django.views.generic import RedirectView
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

from apps.core.health import liveness, readiness
from apps.inventory.urls import (
    material_urlpatterns as inventory_material_urls,
)
from apps.inventory.urls import (
    usage_urlpatterns as inventory_usage_urls,
)
from apps.payments.urls import (
    doctor_commission_urlpatterns as payments_doctor_commission_urls,
)
from apps.payments.urls import (
    patient_balance_urlpatterns as payments_patient_balance_urls,
)
from apps.payments.urls import (
    payment_urlpatterns as payments_payment_urls,
)
from apps.prescriptions.urls import (
    action_urlpatterns as prescription_action_urls,
)
from apps.prescriptions.urls import (
    prescription_urlpatterns,
)
from apps.prescriptions.urls import (
    template_urlpatterns as prescription_template_urls,
)
from apps.ratings.urls import (
    doctor_badge_urlpatterns as ratings_doctor_badge_urls,
)
from apps.ratings.urls import (
    leaderboard_urlpatterns as ratings_leaderboard_urls,
)


def healthcheck(_request):
    """Legacy alias for :func:`apps.core.health.liveness`.

    Retained so existing docker-compose healthchecks and README links
    continue to work. Semantically identical to ``/healthz/``.
    """
    return liveness(_request)


# ---------------------------------------------------------------------------
# API v1
# ---------------------------------------------------------------------------
# App URL includes are appended here as new apps come online. Each entry
# is a real, importable urls module — no dangling includes.
api_v1_patterns: list = [
    path("auth/", include("apps.accounts.urls", namespace="accounts")),
    path("departments/", include("apps.departments.urls", namespace="departments")),
    path("doctors/", include("apps.doctors.urls", namespace="doctors")),
    path(
        "doctors/",
        include((payments_doctor_commission_urls, "payments-doctor-commissions")),
    ),
    path(
        "procedure-types/",
        include("apps.doctors.procedure_urls", namespace="procedure-types"),
    ),
    path("patients/", include("apps.patients.urls", namespace="patients")),
    path(
        "patients/",
        include((payments_patient_balance_urls, "payments-balance")),
    ),
    path("appointments/", include("apps.scheduling.urls", namespace="scheduling")),
    path("treatments/", include("apps.treatments.urls", namespace="treatments")),
    # ``/api/v1/treatments/{id}/prescription/`` — POST issues a retsept.
    # Mounted *before* the treatments viewset router in DRF terms so the
    # named route wins; DRF routers match by full path so order-safe here.
    path("treatments/", include((prescription_action_urls, "prescriptions-action"))),
    path("tooth-records/", include("apps.odontogram.urls", namespace="odontogram")),
    path(
        "materials/",
        include((inventory_material_urls, "inventory-materials")),
    ),
    path(
        "material-usages/",
        include((inventory_usage_urls, "inventory-usages")),
    ),
    path(
        "prescription-templates/",
        include((prescription_template_urls, "prescription-templates")),
    ),
    path(
        "prescriptions/",
        include((prescription_urlpatterns, "prescriptions")),
    ),
    path(
        "payments/",
        include((payments_payment_urls, "payments")),
    ),
    path(
        "ratings/",
        include((ratings_leaderboard_urls, "ratings")),
    ),
    path(
        "doctors/",
        include((ratings_doctor_badge_urls, "ratings-doctor-badges")),
    ),
    path("notifications/", include("apps.notifications.urls", namespace="notifications")),
    path("reports/", include("apps.reports.urls", namespace="reports")),
]


urlpatterns = [
    # Root redirect to Swagger UI
    path("", RedirectView.as_view(url="/api/docs/", permanent=False)),

    # Admin (Django-admin is kept enabled so bosh_shifokor can inspect data
    # during development; secured behind ADMIN_URL in prod via env).
    path("admin/", admin.site.urls),

    # Health checks — liveness (`/healthz/`) never touches downstream
    # services and always returns 200 for a live process; readiness
    # (`/readyz/`) exercises the DB + cache round-trip and returns 503
    # when any check fails so orchestration platforms can remove the
    # pod from load-balancer rotation.
    path("healthz/", healthcheck, name="healthz"),
    path("readyz/", readiness, name="readyz"),

    # OpenAPI / Swagger
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
    path(
        "api/redoc/",
        SpectacularRedocView.as_view(url_name="schema"),
        name="redoc",
    ),

    # Versioned API
    path("api/v1/", include((api_v1_patterns, "v1"), namespace="v1")),
]


# Serve media/static in dev — production uses nginx/S3.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
