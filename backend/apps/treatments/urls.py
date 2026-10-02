"""URL routes for the ``treatments`` app."""
from __future__ import annotations

from rest_framework.routers import DefaultRouter

from .views import (
    ICD10DiagnosisViewSet,
    TreatmentPlanItemViewSet,
    TreatmentPlanViewSet,
    TreatmentViewSet,
)

app_name = "treatments"

treatment_router = DefaultRouter()
treatment_router.register(r"", TreatmentViewSet, basename="treatment")

plan_router = DefaultRouter()
plan_router.register(r"", TreatmentPlanViewSet, basename="treatment-plan")

plan_item_router = DefaultRouter()
plan_item_router.register(r"", TreatmentPlanItemViewSet, basename="treatment-plan-item")

icd10_router = DefaultRouter()
icd10_router.register(r"", ICD10DiagnosisViewSet, basename="icd10-diagnosis")

treatment_urlpatterns = treatment_router.urls
treatment_plan_urlpatterns = plan_router.urls
treatment_plan_item_urlpatterns = plan_item_router.urls
icd10_urlpatterns = icd10_router.urls

# Combined router for /api/v1/treatments/
sub_router = DefaultRouter()
sub_router.register(r"plans", TreatmentPlanViewSet, basename="treatment-plan-sub")
sub_router.register(r"plan-items", TreatmentPlanItemViewSet, basename="treatment-plan-item-sub")
sub_router.register(r"icd10", ICD10DiagnosisViewSet, basename="icd10-diagnosis-sub")
sub_router.register(r"", TreatmentViewSet, basename="treatment")

urlpatterns = sub_router.urls
