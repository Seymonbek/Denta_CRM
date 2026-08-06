"""AppConfig for the ``telegram_bot`` app."""
from __future__ import annotations

from django.apps import AppConfig


class TelegramBotConfig(AppConfig):
    """Aiogram-based Telegram bot for staff + patient notifications."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.telegram_bot"
    label = "telegram_bot"
    verbose_name = "Telegram bot"
