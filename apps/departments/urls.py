"""URL routes for the departments app under ``/api/v1/departments/``."""
from __future__ import annotations

from rest_framework.routers import DefaultRouter

from .views import DepartmentViewSet

app_name = "departments"

router = DefaultRouter()
router.register(r"", DepartmentViewSet, basename="department")

urlpatterns = router.urls
