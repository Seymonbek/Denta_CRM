"""Patient bot flow — send-only (per PROJECT_BRIEF § "Telegram Bot").

Patients receive reminders and prescriptions through the shared
:mod:`apps.notifications` pipeline; they never interact with the bot.
This module still exposes a Router so aiogram can filter out any
accidental incoming messages with a friendly reply.
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

try:
    from aiogram import Router
    from aiogram.filters import Command
    from aiogram.types import Message
except Exception:  # pragma: no cover - aiogram absent
    Router = None  # type: ignore[assignment,misc]
    Command = None  # type: ignore[assignment,misc]
    Message = object  # type: ignore[assignment,misc]


def build_router():
    """Return a configured aiogram Router for patient handlers."""
    if Router is None:
        return None
    router = Router(name="patient")

    @router.message(Command("start"))
    async def on_start(message: Message) -> None:  # type: ignore[valid-type]
        await message.answer(
            "Salom! Bu bot orqali klinikadan eslatmalar va retseptlar yuboriladi. "
            "Xabar yozishning hojati yo'q — administrator bilan telefon orqali "
            "bog'laning."
        )

    @router.message()
    async def on_any(message: Message) -> None:  # type: ignore[valid-type]
        await message.answer(
            "Bot faqat eslatma yuborish uchun ishlaydi. Iltimos, klinikaning "
            "administratori bilan telefon orqali bog'laning."
        )

    return router


__all__ = ["build_router"]
