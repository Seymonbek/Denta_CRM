"""URL routes for ``/api/v1/procedure-types/``.

Kept separate from :mod:`apps.doctors.urls` so ``config.urls`` can mount
it under a top-level path.
"""
from __future__ import annotations

from rest_framework.routers import DefaultRouter

from .views import ProcedureTypeViewSet

app_name = "procedure-types"

router = DefaultRouter()
router.register(r"", ProcedureTypeViewSet, basename="procedure-type")

urlpatterns = router.urls
