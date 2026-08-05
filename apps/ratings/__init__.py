"""Ratings app — doctor scoring, badges, and leaderboard.

Contains:
    * :class:`ScoreLog` — append-only ledger of points awarded to a
      doctor. Each row records the reason and how many points were
      granted (``new_patient``, ``treatment_completed``,
      ``photo_uploaded``, ``activity_streak``).
    * :class:`Badge` — reusable achievement definition (name, icon,
      description).
    * :class:`DoctorBadge` — a badge awarded to a doctor for a specific
      period (e.g. ``"2026-07"`` for "top doctor of July 2026").

Endpoints (PROJECT_BRIEF § "Ratings"):
    * ``GET /api/v1/ratings/leaderboard/?period=YYYY-MM``
    * ``GET /api/v1/doctors/{id}/badges/``

Business rules live in :mod:`apps.ratings.services`. Read helpers live in
:mod:`apps.ratings.selectors`. Signals wire ``post_save`` on
:class:`Patient`, :class:`Treatment`, and :class:`TreatmentPhoto` to
:func:`services.award_points` so the ledger is populated automatically.
"""

default_app_config = "apps.ratings.apps.RatingsConfig"
