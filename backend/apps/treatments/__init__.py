"""Treatments app — davolash yozuvlari.

Models (PROJECT_BRIEF § "treatments app"):

* :class:`Treatment` — a single clinical intervention performed by a
  doctor for a patient. Links to :class:`apps.scheduling.Appointment`,
  :class:`apps.doctors.DoctorProfile`, :class:`apps.patients.Patient`,
  :class:`apps.departments.Department`, and
  :class:`apps.doctors.ProcedureType`. Owns diagnosis, description,
  price, payment_status, and stage.
* :class:`TreatmentPhoto` — before/after/x-ray images uploaded per
  treatment. Thumbnail generation is deferred to T23 (celery task).

RBAC (PROJECT_BRIEF § "RBAC"):

* Read: ``bosh_shifokor`` sees all, ``doctor`` sees own (or all when
  ``can_view_other_doctors=True``), ``administrator`` sees read-only.
* Write (create / update / photos): ``bosh_shifokor`` and ``doctor``.
"""

default_app_config = "apps.treatments.apps.TreatmentsConfig"
