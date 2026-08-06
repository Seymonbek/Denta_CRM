"""Prescriptions app — retseptlar va shablonlar.

Models (PROJECT_BRIEF § "prescriptions app"):

* :class:`PrescriptionTemplate` — reusable retsept shabloni (name +
  content). Created by ``bosh_shifokor`` or ``doctor``; anyone with
  clinical write access can list them.
* :class:`Prescription` — an individual retsept issued for a
  :class:`apps.treatments.Treatment`. May be based on a template but
  ``content`` is always stored verbatim so template changes never
  rewrite history. ``sent_to_telegram_at`` is set by the send-service
  once the patient (or a mock, in dev) receives the message.

Endpoints (PROJECT_BRIEF § "Prescriptions"):

* ``GET  /api/v1/prescription-templates/``
* ``POST /api/v1/prescription-templates/``
* ``GET  /api/v1/prescription-templates/{id}/``
* ``PATCH /api/v1/prescription-templates/{id}/``
* ``DELETE /api/v1/prescription-templates/{id}/``
* ``GET  /api/v1/prescriptions/`` (filters: ``?treatment=&patient=``)
* ``GET  /api/v1/prescriptions/{id}/``
* ``POST /api/v1/treatments/{id}/prescription/`` — create+send.

RBAC (PROJECT_BRIEF § "RBAC" — clinical write):

* Read/list: ``bosh_shifokor``, ``doctor`` (own by default),
  ``administrator`` (read-only, to see what to hand out).
* Write / send: ``bosh_shifokor`` and the treatment's ``doctor``.
"""

default_app_config = "apps.prescriptions.apps.PrescriptionsConfig"
