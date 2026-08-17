"""URL routes for the ``ratings`` app.

Two mount points wired from :mod:`config.urls`:

* ``/api/v1/ratings/leaderboard/``    → ``leaderboard_urlpatterns``
* ``/api/v1/doctors/{id}/badges/``    → ``doctor_badge_urlpatterns``
"""
from __future__ import annotations

from django.urls import path, include
from rest_framework.routers import SimpleRouter

from .views import DoctorBadgesView, LeaderboardView, PatientReviewViewSet

app_name = "ratings"


router = SimpleRouter()
router.register(r"reviews", PatientReviewViewSet, basename="review")


leaderboard_urlpatterns = [
    path("leaderboard/", LeaderboardView.as_view(), name="leaderboard"),
    path("", include(router.urls)),
]


doctor_badge_urlpatterns = [
    path(
        "<uuid:doctor_id>/badges/",
        DoctorBadgesView.as_view(),
        name="doctor-badges",
    ),
]


urlpatterns = leaderboard_urlpatterns


__all__ = [
    "leaderboard_urlpatterns",
    "doctor_badge_urlpatterns",
    "urlpatterns",
]
