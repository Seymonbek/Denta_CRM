"""Patients app — clinic patient records (bemorlar).

Models (PROJECT_BRIEF § "patients app"):

* :class:`Patient` — a person receiving treatment. Owns basic
  demographics, contact info, allergy/chronic-condition notes, and an
  optional Telegram chat id for reminder delivery.

Everything downstream — appointments (T10), treatments (T12),
odontogram (T13), prescriptions (T14), payments (T17) — hangs off
this model via ``FK(patient)``.

RBAC (PROJECT_BRIEF § "RBAC"):

* Read: any authenticated user (doctors need to look up their own
  patients; administrators run the reception desk).
* Write (create / update / soft-delete): ``bosh_shifokor`` and
  ``administrator`` only. Doctors never touch the patient registry
  directly.
"""

default_app_config = "apps.patients.apps.PatientsConfig"
