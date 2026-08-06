"""URL routes for the ``prescriptions`` app.

Three mount points (see ``config/urls.py``):

* ``/api/v1/prescription-templates/`` → ``template_urlpatterns``
* ``/api/v1/prescriptions/``          → ``prescription_urlpatterns``
* ``/api/v1/treatments/{id}/prescription/`` → ``action_urlpatterns``

The three viewsets live under distinct top-level paths so we expose
three named url-lists rather than a single ``urlpatterns`` with
``include`` gymnastics.
"""
from __future__ import annotations

from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    IssuePrescriptionActionView,
    PrescriptionTemplateViewSet,
    PrescriptionViewSet,
)

app_name = "prescriptions"


def _template_router() -> DefaultRouter:
    router = DefaultRouter()
    router.register(r"", PrescriptionTemplateViewSet, basename="prescription-template")
    return router


def _prescription_router() -> DefaultRouter:
    router = DefaultRouter()
    router.register(r"", PrescriptionViewSet, basename="prescription")
    return router


template_urlpatterns = _template_router().urls
prescription_urlpatterns = _prescription_router().urls

# Action route: ``/api/v1/treatments/{treatment_id}/prescription/``
action_urlpatterns = [
    path(
        "<uuid:treatment_id>/prescription/",
        IssuePrescriptionActionView.as_view(),
        name="treatment-issue-prescription",
    ),
]

# Compatibility: some tooling imports ``urlpatterns`` from every app.
urlpatterns = template_urlpatterns


__all__ = [
    "template_urlpatterns",
    "prescription_urlpatterns",
    "action_urlpatterns",
    "urlpatterns",
]
