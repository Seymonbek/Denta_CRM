"""URL routes for the ``odontogram`` app.

Two mount points:

* ``/api/v1/tooth-records/`` — standalone CRUD (routed here).
* ``/api/v1/treatments/{treatment_id}/tooth-records/`` — nested route,
  registered from :mod:`config.urls` alongside the treatments include.

Additionally the patients app includes
:class:`PatientOdontogramView` at ``/patients/{patient_id}/odontogram/``.
"""
from __future__ import annotations

from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    PatientOdontogramView,
    ToothRecordViewSet,
    TreatmentToothRecordsView,
)

app_name = "odontogram"

router = DefaultRouter()
router.register(r"", ToothRecordViewSet, basename="tooth-record")

urlpatterns = list(router.urls)


# Extra URL modules exposed for inclusion elsewhere.
treatment_nested_urlpatterns = [
    path(
        "<uuid:treatment_id>/tooth-records/",
        TreatmentToothRecordsView.as_view(),
        name="treatment-tooth-records",
    ),
]

patient_nested_urlpatterns = [
    path(
        "<uuid:patient_id>/odontogram/",
        PatientOdontogramView.as_view(),
        name="patient-odontogram",
    ),
]
