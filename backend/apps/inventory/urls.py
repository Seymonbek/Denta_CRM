"""URL routes for the inventory app.

Mounted at:
    /api/v1/materials/         → MaterialViewSet
    /api/v1/material-usages/   → MaterialUsageViewSet
    /api/v1/procedure-boms/    → ProcedureBOMViewSet
"""
from __future__ import annotations

from rest_framework.routers import DefaultRouter

from .views import MaterialUsageViewSet, MaterialViewSet, ProcedureBOMViewSet

app_name = "inventory"

material_router = DefaultRouter()
material_router.register(r"", MaterialViewSet, basename="material")

usage_router = DefaultRouter()
usage_router.register(r"", MaterialUsageViewSet, basename="material-usage")

bom_router = DefaultRouter()
bom_router.register(r"", ProcedureBOMViewSet, basename="procedure-bom")

material_urlpatterns = material_router.urls
usage_urlpatterns = usage_router.urls
procedure_bom_urlpatterns = bom_router.urls

urlpatterns = material_urlpatterns
