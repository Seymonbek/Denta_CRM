"""URL routes for the ``doctors`` app.

Two URL groups are exposed:

* ``/api/v1/doctors/`` — this module's ``urlpatterns`` (DoctorProfile
  viewset + nested working-hours / time-off / available-slots actions).
* ``/api/v1/procedure-types/`` — lives in :mod:`apps.doctors.procedure_urls`
  and is included separately from :mod:`config.urls`.
"""
from __future__ import annotations

from rest_framework.routers import DefaultRouter

from .views import DoctorProfileViewSet

app_name = "doctors"

doctors_router = DefaultRouter()
doctors_router.register(r"", DoctorProfileViewSet, basename="doctor")

urlpatterns = doctors_router.urls
