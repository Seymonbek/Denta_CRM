"""Dispatcher runner — polling in dev, webhook stub in prod.

The runner never crashes when ``TELEGRAM_BOT_TOKEN`` is empty; it logs
a warning and exits cleanly so ``docker compose up bot`` succeeds even
without real credentials.
"""
from __future__ import annotations

import asyncio
import logging

from django.conf import settings

logger = logging.getLogger(__name__)


async def _build_dispatcher():
    from aiogram import Dispatcher
    from aiogram.fsm.storage.memory import MemoryStorage

    from .middlewares import LoggingMiddleware, ThrottlingMiddleware
    from .routers import patient as patient_router
    from .routers import staff as staff_router

    dp = Dispatcher(storage=MemoryStorage())
    dp.update.middleware(LoggingMiddleware())
    dp.update.middleware(ThrottlingMiddleware())

    staff = staff_router.build_router()
    patient = patient_router.build_router()
    if staff is not None:
        dp.include_router(staff)
    if patient is not None:
        dp.include_router(patient)
    return dp


async def run_polling() -> None:
    """Run the bot with long polling (dev mode)."""
    token = getattr(settings, "TELEGRAM_BOT_TOKEN", "") or ""
    if not token:
        logger.warning(
            "telegram_bot: TELEGRAM_BOT_TOKEN is empty — bot will not start."
        )
        return

    try:
        from .bot import get_bot

        bot = get_bot()
        dp = await _build_dispatcher()
        logger.info("telegram_bot: starting polling")
        await dp.start_polling(bot)
    except Exception:  # noqa: BLE001
        logger.exception("telegram_bot: polling crashed — exiting cleanly")


def run() -> None:
    """Entry point invoked by the management command."""
    try:
        asyncio.run(run_polling())
    except KeyboardInterrupt:  # pragma: no cover
        logger.info("telegram_bot: shutting down (SIGINT)")


__all__ = ["run", "run_polling"]
