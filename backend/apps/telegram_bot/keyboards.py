"""Inline / reply keyboards used by the staff bot."""
from __future__ import annotations

try:
    from aiogram.types import (
        KeyboardButton,
        ReplyKeyboardMarkup,
        ReplyKeyboardRemove,
    )
except Exception:  # pragma: no cover - aiogram absent
    KeyboardButton = None  # type: ignore[assignment,misc]
    ReplyKeyboardMarkup = None  # type: ignore[assignment,misc]
    ReplyKeyboardRemove = None  # type: ignore[assignment,misc]


def share_phone_keyboard():
    """Return a one-time keyboard that asks Telegram for the phone number."""
    if KeyboardButton is None or ReplyKeyboardMarkup is None:  # pragma: no cover
        return None
    return ReplyKeyboardMarkup(
        keyboard=[
            [
                KeyboardButton(
                    text="📱 Telefon raqamimni ulashish",
                    request_contact=True,
                )
            ]
        ],
        resize_keyboard=True,
        one_time_keyboard=True,
    )


def remove_keyboard():
    """Reply markup that hides any custom keyboard."""
    if ReplyKeyboardRemove is None:  # pragma: no cover
        return None
    return ReplyKeyboardRemove()


__all__ = ["share_phone_keyboard", "remove_keyboard"]
