"""Tests for the Telegram bot bundle.

We NEVER hit a real Telegram API. The tests rely on the MockBot that
:func:`apps.telegram_bot.bot.get_bot` returns when
``TELEGRAM_BOT_TOKEN`` is empty.
"""
from __future__ import annotations

import pytest
from django.test import override_settings

pytestmark = pytest.mark.django_db


@override_settings(TELEGRAM_BOT_TOKEN="")
def test_mock_bot_records_calls_when_no_token():
    from apps.telegram_bot.bot import MockBot, get_bot, reset_bot

    reset_bot()
    bot = get_bot()
    assert isinstance(bot, MockBot)


@override_settings(TELEGRAM_BOT_TOKEN="")
def test_send_message_sync_uses_mock_bot():
    from apps.telegram_bot.bot import get_bot, reset_bot, send_message_sync

    reset_bot()
    message_id = send_message_sync(chat_id=1234, text="hello")
    assert message_id == 1
    bot = get_bot()
    assert bot.sent == [
        {"chat_id": 1234, "text": "hello", "kwargs": {}}
    ]


@override_settings(TELEGRAM_BOT_TOKEN="")
def test_dispatcher_run_returns_when_token_missing(caplog):
    """Running the bot without a token logs a warning and exits cleanly."""
    from apps.telegram_bot.dispatcher_runner import run

    caplog.set_level("WARNING")
    run()  # must not raise
    assert any(
        "TELEGRAM_BOT_TOKEN is empty" in rec.message
        for rec in caplog.records
    )


def test_routers_build_when_aiogram_available():
    """Building the router should either return a Router or None (fallback)."""
    from apps.telegram_bot.routers import patient, staff

    staff_router = staff.build_router()
    patient_router = patient.build_router()
    # Aiogram is in requirements/base.txt so build_router must succeed.
    assert staff_router is not None
    assert patient_router is not None


def test_management_command_registered():
    """``manage.py run_telegram_bot`` must be registered."""
    from django.core.management import get_commands

    assert "run_telegram_bot" in get_commands()
