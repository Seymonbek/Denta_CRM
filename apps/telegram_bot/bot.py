"""Bot factory + a synchronous ``send_message`` helper.

The Aiogram :class:`Bot` is created lazily so importing this module has
no network side-effects. When ``TELEGRAM_BOT_TOKEN`` is empty (dev /
tests) :func:`get_bot` returns a :class:`MockBot` that implements the
same asynchronous ``.send_message`` API but only logs the payload.

The synchronous wrapper :func:`send_message_sync` is what the
notifications Celery task calls.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from django.conf import settings

logger = logging.getLogger(__name__)


class MockBot:
    """No-op stand-in used when a real Telegram token is not configured."""

    def __init__(self, token: str = "") -> None:
        self.token = token
        self.sent: list[dict[str, Any]] = []

    async def send_message(
        self,
        chat_id: int,
        text: str,
        **kwargs: Any,
    ) -> Any:
        record = {"chat_id": chat_id, "text": text, "kwargs": kwargs}
        self.sent.append(record)
        logger.info("telegram_bot[MOCK]: send_message %s", record)
        # Return a lightweight object with a numeric ``message_id`` so
        # callers can persist it exactly like they would for the real bot.
        return type("MockMessage", (), {"message_id": len(self.sent)})()

    async def close(self) -> None:  # pragma: no cover - mock
        return None


_bot_instance: Any | None = None


def get_bot() -> Any:
    """Return a singleton Aiogram :class:`Bot` (or :class:`MockBot`).

    We deliberately avoid caching the real Aiogram bot across tests —
    the module-level instance is only created lazily in production
    workers.
    """
    global _bot_instance
    if _bot_instance is not None:
        return _bot_instance

    token = getattr(settings, "TELEGRAM_BOT_TOKEN", "") or ""
    if not token:
        _bot_instance = MockBot()
        return _bot_instance

    try:
        from aiogram import Bot
        from aiogram.client.default import DefaultBotProperties
        from aiogram.enums import ParseMode

        _bot_instance = Bot(
            token=token,
            default=DefaultBotProperties(parse_mode=ParseMode.HTML),
        )
    except Exception:  # noqa: BLE001
        logger.exception(
            "telegram_bot: cannot instantiate aiogram Bot — falling back to mock"
        )
        _bot_instance = MockBot(token=token)
    return _bot_instance


def reset_bot() -> None:
    """Drop the singleton — used by tests between assertions."""
    global _bot_instance
    _bot_instance = None


def send_message_sync(*, chat_id: int, text: str) -> int | None:
    """Send a message synchronously; returns the Telegram ``message_id``.

    Wraps the async Aiogram call in :func:`asyncio.run`. Safe to call
    from Celery workers (each task runs in its own greenlet).
    """
    bot = get_bot()

    async def _send() -> int | None:
        result = await bot.send_message(chat_id=chat_id, text=text)
        return getattr(result, "message_id", None)

    try:
        return asyncio.run(_send())
    except RuntimeError:
        # asyncio.run raises inside an existing loop (unusual in celery,
        # common in some test frameworks). Fall back to a new loop.
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(_send())
        finally:
            loop.close()


__all__ = ["get_bot", "reset_bot", "send_message_sync", "MockBot"]
