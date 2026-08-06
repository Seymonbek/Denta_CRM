"""URL routes for ``/api/v1/appointments/``.

Registered from :mod:`config.urls`. Uses the DRF DefaultRouter so the
custom ``cancel`` action on :class:`AppointmentViewSet` is exposed
automatically at ``/appointments/{id}/cancel/``.
"""
from __future__ import annotations

from rest_framework.routers import DefaultRouter

from .views import AppointmentViewSet

app_name = "scheduling"

router = DefaultRouter()
router.register(r"", AppointmentViewSet, basename="appointment")

urlpatterns = router.urls
