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


def test_get_chat_identity_and_formatters(db):
    from apps.accounts.models import User
    from apps.patients.models import Patient
    from apps.telegram_bot.helpers import (
        format_appointments_list,
        format_stock_report,
        get_chat_identity,
    )

    staff_user = User.objects.create(
        phone_number="+998901112233",
        role=User.Role.DOCTOR,
        telegram_chat_id=999111,
    )
    patient = Patient.objects.create(
        first_name="Test",
        last_name="Patient",
        phone_number="+998904445566",
        telegram_chat_id=888222,
    )

    staff_identity = get_chat_identity(999111)
    assert staff_identity["type"] == "staff"
    assert staff_identity["role"] == staff_user.role

    patient_identity = get_chat_identity(888222)
    assert patient_identity["type"] == "patient"
    assert patient_identity["role"] == "patient"

    unlinked = get_chat_identity(123000)
    assert unlinked["type"] == "unlinked"

    app_list_html = format_appointments_list([])
    assert "Hozircha navbatlar mavjud emas" in app_list_html

    stock_html = format_stock_report([])
    assert "Omborda materiallar topilmadi" in stock_html


def test_telegram_reporting_sync_helpers(db):
    from apps.accounts.models import User
    from apps.telegram_bot.routers.staff import (
        _get_telegram_appointments_report_html,
        _get_telegram_daily_financial_html,
        _get_telegram_stock_report_html,
    )

    bosh_shifokor = User.objects.create(
        phone_number="+998900000001",
        role=User.Role.BOSH_SHIFOKOR,
        telegram_chat_id=11223344,
    )

    app_html = _get_telegram_appointments_report_html(11223344)
    assert "Navbatlar" in app_html

    stock_html = _get_telegram_stock_report_html(11223344)
    assert "Ombor" in stock_html

    fin_html = _get_telegram_daily_financial_html(11223344)
    assert "Moliya" in fin_html

    from apps.telegram_bot.routers.staff import _process_telegram_ai_query
    ai_html = _process_telegram_ai_query(11223344, "Ombor holati qanday?")
    assert "AI Yordamchi" in ai_html
