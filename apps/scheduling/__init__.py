"""Scheduling app — patient appointments (navbatlar).

Models (PROJECT_BRIEF § "scheduling app"):

* :class:`Appointment` — a single scheduled visit binding one
  :class:`apps.patients.Patient` to one
  :class:`apps.doctors.DoctorProfile` inside a specific
  :class:`apps.departments.Department`, optionally with a chosen
  :class:`apps.doctors.ProcedureType`.

Double-booking protection
-------------------------

PROJECT_BRIEF explicitly requires a **DB-level** guarantee against
overlapping bookings for the same doctor. We enforce this on two
levels:

1. Application layer (:mod:`apps.scheduling.services`) — every
   ``create_appointment`` / ``move_appointment`` call runs an ORM
   overlap check and rejects offenders with a
   :class:`django.core.exceptions.ValidationError`. This works on
   every backend (including SQLite in the test suite).
2. Database layer — migration ``0002_appointment_exclusion_constraint``
   installs a PostgreSQL ``EXCLUDE USING gist`` constraint on
   ``(doctor_id, tstzrange(scheduled_start, scheduled_end))`` filtered
   to blocking statuses. The migration is a no-op on non-Postgres
   backends so ``pytest`` can still run against SQLite.

RBAC (PROJECT_BRIEF § "RBAC" — "Bemor ro'yxatga olish/navbat"):

* Create / update / cancel: ``bosh_shifokor`` and ``administrator``.
* Read: any authenticated user. Doctors see their own appointments
  unless their profile has ``can_view_other_doctors=True``.
"""

default_app_config = "apps.scheduling.apps.SchedulingConfig"
