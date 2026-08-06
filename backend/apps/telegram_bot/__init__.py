"""Telegram bot app (Aiogram 3.x).

Two independent flows:

* **Staff bot** — reacts to ``/start`` and ``/link_phone`` from clinic
  employees. Links their ``telegram_chat_id`` to their user account
  after phone-number verification.
* **Patient stream** — one-way: the bot sends reminders/prescriptions
  to patients, no interactive commands.

The bot NEVER runs during unit tests — importing the package must not
have any network side-effects. Concrete Bot instances are created only
inside :func:`bot.get_bot` or the ``run_telegram_bot`` management
command.
"""

default_app_config = "apps.telegram_bot.apps.TelegramBotConfig"
