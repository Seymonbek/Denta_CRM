"""Django admin for the ``notifications`` app."""
from __future__ import annotations

from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import NotificationLog


@admin.register(NotificationLog)
class NotificationLogAdmin(ModelAdmin):
    """Support-oriented admin — most rows are read-only."""

    list_display = (
        "created_at",
        "type",
        "channel",
        "status",
        "user",
        "patient",
        "sent_at",
    )
    list_filter = ("status", "channel", "type")
    search_fields = (
        "message",
        "external_message_id",
        "user__phone_number",
        "patient__phone_number",
    )
    readonly_fields = (
        "id",
        "created_at",
        "updated_at",
        "sent_at",
    )
    ordering = ("-created_at",)

