"""``manage.py run_telegram_bot`` — launches the Aiogram dispatcher.

When ``TELEGRAM_BOT_TOKEN`` is empty the command logs a warning and
exits cleanly (see :func:`apps.telegram_bot.dispatcher_runner.run`).
"""
from __future__ import annotations

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Run the DentaCRM Telegram bot dispatcher (polling in dev)."

    def handle(self, *args, **options) -> None:
        from apps.telegram_bot.dispatcher_runner import run

        self.stdout.write(self.style.NOTICE("Starting Telegram bot..."))
        run()
        self.stdout.write(self.style.SUCCESS("Telegram bot exited."))
