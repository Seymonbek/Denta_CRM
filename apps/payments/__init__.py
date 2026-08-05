"""Payments & doctor commissions app.

Contains:
    * :class:`Payment` — money received against a :class:`Treatment`,
      recorded by an administrator, doctor, or head-doctor at the
      reception desk. Method is one of ``cash / card / payme / click /
      bank_transfer`` — PROJECT_BRIEF § "payments app".
    * :class:`CommissionRecord` — the doctor's cut of a single treatment,
      calculated once when the treatment is fully paid (or on-demand via
      :func:`services.recalculate_commission`). Formula (see brief):

          rate  = procedure_type.commission_rate_override
                    or doctor.default_commission_rate
          base  = price                    (basis = ``from_total``)
                | price - material_cost    (basis = ``from_net``)
          amount = base * rate / 100

All business logic lives in :mod:`apps.payments.services`. Read helpers
live in :mod:`apps.payments.selectors`. Signals wire ``post_save`` on
Payment to refresh the treatment's ``payment_status`` and (if fully
paid) create/refresh the commission record.
"""

default_app_config = "apps.payments.apps.PaymentsConfig"
