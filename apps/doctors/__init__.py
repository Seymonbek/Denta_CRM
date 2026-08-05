"""Doctors app — clinical staff profiles, working hours, time-off, procedures.

Models (PROJECT_BRIEF § "doctors app"):

* :class:`DoctorProfile` — one per ``accounts.User`` with role='doctor' or
  role='bosh_shifokor'; carries department M2M and commission settings.
* :class:`WorkingHours` — weekly recurring shift (weekday + start/end).
* :class:`TimeOff` — one-off leaves that override working hours.
* :class:`ProcedureType` — clinical procedures a doctor performs
  (with default price/duration and optional commission override).

The ``available-slots`` endpoint composes WorkingHours minus TimeOff to
return bookable slots. Once :mod:`apps.scheduling` (T10) is live it will
further subtract already-booked appointments.
"""

default_app_config = "apps.doctors.apps.DoctorsConfig"
