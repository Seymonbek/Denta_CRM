"""URL routes for the ``patients`` app under ``/api/v1/patients/``.

Registered from :mod:`config.urls`. Uses the DRF DefaultRouter so the
custom ``history`` and ``odontogram`` actions on :class:`PatientViewSet`
are exposed automatically at ``/patients/{id}/history/`` and
``/patients/{id}/odontogram/``.
"""
from __future__ import annotations

from rest_framework.routers import DefaultRouter

from .views import PatientViewSet

app_name = "patients"

router = DefaultRouter()
router.register(r"", PatientViewSet, basename="patient")

urlpatterns = router.urls
