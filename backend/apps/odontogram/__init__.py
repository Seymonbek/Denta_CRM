"""Odontogram app — per-tooth clinical records (tish formulasi).

Provides the :class:`ToothRecord` model together with FDI-notation
validation. FDI numbering:

* Upper-right quadrant (1): 11–18
* Upper-left quadrant (2):  21–28
* Lower-left quadrant (3):  31–38
* Lower-right quadrant (4): 41–48

The valid set therefore has exactly 32 numbers. All of them are
enumerated in :data:`FDI_VALID_NUMBERS` and the same list is used by the
serializer/service layer so the DB and the API can never disagree.

Endpoints (mounted under ``/api/v1/treatments/{id}/tooth-records/`` via
:mod:`apps.treatments.views`):

* ``GET  /treatments/{id}/tooth-records/``  → list tooth records
* ``POST /treatments/{id}/tooth-records/``  → create a new tooth record

RBAC mirrors the treatments app: ``bosh_shifokor`` and ``doctor``
(when they own the treatment) may write; anyone with view access to the
parent treatment may read.
"""

default_app_config = "apps.odontogram.apps.OdontogramConfig"
