"""URL routes for the inventory app.

Mounted at:
    /api/v1/materials/         → MaterialViewSet
    /api/v1/material-usages/   → MaterialUsageViewSet
"""
from __future__ import annotations

from rest_framework.routers import DefaultRouter

from .views import MaterialUsageViewSet, MaterialViewSet

app_name = "inventory"

material_router = DefaultRouter()
material_router.register(r"", MaterialViewSet, basename="material")

usage_router = DefaultRouter()
usage_router.register(r"", MaterialUsageViewSet, basename="material-usage")

material_urlpatterns = material_router.urls
usage_urlpatterns = usage_router.urls

urlpatterns = material_urlpatterns
