"""URL routes for the ``treatments`` app under ``/api/v1/treatments/``."""
from __future__ import annotations

from rest_framework.routers import DefaultRouter

from .views import TreatmentViewSet

app_name = "treatments"

router = DefaultRouter()
router.register(r"", TreatmentViewSet, basename="treatment")

urlpatterns = router.urls
