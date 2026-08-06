"""AppConfig for the ``payments`` app."""
from __future__ import annotations

from django.apps import AppConfig


class PaymentsConfig(AppConfig):
    """Payments & CommissionRecords."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.payments"
    label = "payments"
    verbose_name = "Moliya va To'lovlar"

    def ready(self) -> None:  # pragma: no cover — import side-effect
        # Importing ``signals`` binds the post_save handler on Payment
        # so treatment.payment_status and CommissionRecord are kept in
        # sync automatically.
        from . import signals  # noqa: F401
