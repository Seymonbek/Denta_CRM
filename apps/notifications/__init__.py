"""Notifications app — outbound messages to staff and patients.

The :class:`~apps.notifications.models.NotificationLog` model is the
single audit trail for every message DentaCRM sends: low-stock alerts,
appointment reminders, prescriptions, follow-up invites, etc.

Writes always go through :mod:`apps.notifications.services.enqueue` so
that:

    1. a ``NotificationLog`` row is created in ``pending`` state,
    2. a `notification_enqueued` signal fires — the ``telegram_bot``
       app subscribes to it in T22 and does the actual delivery, then
       calls :func:`~apps.notifications.services.mark_sent`.

Consumers (inventory low-stock, scheduling reminders, ...) never touch
the transport directly — they call ``enqueue`` and let the delivery
layer choose the channel (default = ``telegram``).
"""

default_app_config = "apps.notifications.apps.NotificationsConfig"
