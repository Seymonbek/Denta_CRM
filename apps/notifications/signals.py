"""Custom signals for the ``notifications`` app.

``notification_enqueued`` fires **after** :func:`services.enqueue`
successfully creates a :class:`NotificationLog` row. The telegram bot
app subscribes to it in T22 and performs the actual delivery, then
calls :func:`services.mark_sent` / :func:`services.mark_failed` back on
the same row.

Keeping the transport out of :func:`enqueue` itself lets tests exercise
the service without spinning up an HTTP client / mock server, and keeps
the ``inventory`` and ``scheduling`` call-sites synchronous.
"""
from __future__ import annotations

from django.dispatch import Signal

#: Sent as ``sender=NotificationLog`` with kwargs::
#:
#:     * ``instance`` — the :class:`NotificationLog` row (pending)
#:     * ``context`` — the JSON context dict (echo of ``instance.context``)
notification_enqueued = Signal()


__all__ = ["notification_enqueued"]
