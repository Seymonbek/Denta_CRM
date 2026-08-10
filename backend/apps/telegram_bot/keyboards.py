"""Inline and Reply Keyboards for Patient, Doctor, and Admin flows."""
from __future__ import annotations

import logging
from typing import Any

from django.conf import settings

logger = logging.getLogger(__name__)

try:
    from aiogram.types import (
        InlineKeyboardButton,
        InlineKeyboardMarkup,
        KeyboardButton,
        ReplyKeyboardMarkup,
        ReplyKeyboardRemove,
        WebAppInfo,
    )
except Exception:  # pragma: no cover - aiogram absent
    InlineKeyboardButton = None  # type: ignore[assignment,misc]
    InlineKeyboardMarkup = None  # type: ignore[assignment,misc]
    KeyboardButton = None  # type: ignore[assignment,misc]
    ReplyKeyboardMarkup = None  # type: ignore[assignment,misc]
    ReplyKeyboardRemove = None  # type: ignore[assignment,misc]
    WebAppInfo = None  # type: ignore[assignment,misc]


def share_phone_keyboard() -> Any:
    """One-time reply keyboard to request contact."""
    if KeyboardButton is None or ReplyKeyboardMarkup is None:
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


def remove_keyboard() -> Any:
    """Reply markup that hides custom keyboards."""
    if ReplyKeyboardRemove is None:
        return None
    return ReplyKeyboardRemove()


def patient_main_keyboard() -> Any:
    """Main menu keyboard for linked patients."""
    if KeyboardButton is None or ReplyKeyboardMarkup is None:
        return None

    app_url = getattr(settings, "FRONTEND_URL", "") or "http://localhost:5173"
    web_app_btn = (
        [KeyboardButton(text="🌐 DentaCRM Veb Portal", web_app=WebAppInfo(url=app_url))]
        if (WebAppInfo is not None and app_url.startswith("https"))
        else []
    )

    kb = [
        [
            KeyboardButton(text="📅 Navbatlarim"),
            KeyboardButton(text="💊 Retseptlarim"),
        ],
        [
            KeyboardButton(text="🦷 Muolajalarim"),
            KeyboardButton(text="🧾 To'lovlar va Cheklar"),
        ],
        [
            KeyboardButton(text="📝 Qabulga Yozilish"),
            KeyboardButton(text="🏥 Klinika Haqida"),
        ],
    ]
    if web_app_btn:
        kb.append(web_app_btn)
    kb.append([KeyboardButton(text="📞 Bog'lanish")])

    return ReplyKeyboardMarkup(
        keyboard=kb,
        resize_keyboard=True,
    )


def doctor_main_keyboard() -> Any:
    """Main menu keyboard for linked doctors."""
    if KeyboardButton is None or ReplyKeyboardMarkup is None:
        return None
    return ReplyKeyboardMarkup(
        keyboard=[
            [
                KeyboardButton(text="📋 Bugungi Navbatlar"),
                KeyboardButton(text="📦 Ombor Holati"),
            ],
            [
                KeyboardButton(text="🤖 AI Yordamchi"),
                KeyboardButton(text="⚙️ Akkaunt"),
            ],
        ],
        resize_keyboard=True,
    )


def admin_main_keyboard() -> Any:
    """Main menu keyboard for Bosh Shifokor and Administrators."""
    if KeyboardButton is None or ReplyKeyboardMarkup is None:
        return None
    return ReplyKeyboardMarkup(
        keyboard=[
            [
                KeyboardButton(text="📊 Kunlik Tushum"),
                KeyboardButton(text="📊 Oylik Tushum va Reyting"),
            ],
            [
                KeyboardButton(text="📋 Barcha Navbatlar"),
                KeyboardButton(text="📦 Ombor Qoldig'i"),
            ],
            [
                KeyboardButton(text="🤖 AI Yordamchi"),
                KeyboardButton(text="⚙️ Akkaunt"),
            ],
        ],
        resize_keyboard=True,
    )


def ai_mode_keyboard() -> Any:
    """Keyboard active during interactive AI chat mode."""
    if KeyboardButton is None or ReplyKeyboardMarkup is None:
        return None
    return ReplyKeyboardMarkup(
        keyboard=[
            [
                KeyboardButton(text="❌ AI Chat Rejimini Yakunlash"),
            ]
        ],
        resize_keyboard=True,
    )


def appointment_actions_inline(appointment_id: str | int, current_status: str = "scheduled") -> Any:
    """Inline action buttons for appointment notification (Confirm / Cancel)."""
    if InlineKeyboardButton is None or InlineKeyboardMarkup is None:
        return None

    buttons = []
    if current_status != "confirmed":
        buttons.append(
            InlineKeyboardButton(text="✅ Tasdiqlash", callback_data=f"app_confirm:{appointment_id}")
        )
    if current_status != "cancelled":
        buttons.append(
            InlineKeyboardButton(text="❌ Bekor qilish", callback_data=f"app_cancel:{appointment_id}")
        )

    return InlineKeyboardMarkup(inline_keyboard=[buttons]) if buttons else None


def doctor_appointment_status_inline(appointment_id: str | int, current_status: str = "scheduled") -> Any:
    """Inline action buttons for Doctor to manage appointment status."""
    if InlineKeyboardButton is None or InlineKeyboardMarkup is None:
        return None

    row = []
    if current_status not in ["in_progress", "completed", "cancelled"]:
        row.append(InlineKeyboardButton(text="🩺 Jarayonda", callback_data=f"doc_app_progress:{appointment_id}"))
    if current_status != "completed":
        row.append(InlineKeyboardButton(text="✔️ Yakunlash", callback_data=f"doc_app_complete:{appointment_id}"))
    if current_status not in ["completed", "no_show", "cancelled"]:
        row.append(InlineKeyboardButton(text="⚠️ Kelmadi", callback_data=f"doc_app_noshow:{appointment_id}"))

    return InlineKeyboardMarkup(inline_keyboard=[row]) if row else None


def department_select_inline(departments: list[dict[str, Any]]) -> Any:
    """Inline buttons to select a department for booking."""
    if InlineKeyboardButton is None or InlineKeyboardMarkup is None:
        return None

    keyboard = []
    for dept in departments:
        name = dept.get("name", "Bo'lim")
        dept_id = dept.get("id")
        keyboard.append([
            InlineKeyboardButton(text=f"🏥 {name}", callback_data=f"book_dept:{dept_id}")
        ])

    keyboard.append([InlineKeyboardButton(text="❌ Bekor qilish", callback_data="book_cancel")])
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


def doctor_select_inline(doctors: list[dict[str, Any]]) -> Any:
    """Inline buttons to select a doctor for booking."""
    if InlineKeyboardButton is None or InlineKeyboardMarkup is None:
        return None

    keyboard = []
    for doc in doctors:
        name = doc.get("name", "Shifokor")
        specialty = doc.get("specialty", "")
        spec_text = f" ({specialty})" if specialty else ""
        doc_id = doc.get("id")
        keyboard.append([
            InlineKeyboardButton(text=f"👨‍⚕️ Dr. {name}{spec_text}", callback_data=f"book_doc:{doc_id}")
        ])

    keyboard.append([InlineKeyboardButton(text="❌ Bekor qilish", callback_data="book_cancel")])
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


def date_select_inline(dates: list[tuple[str, str]]) -> Any:
    """Inline buttons to select booking date [(date_str, label), ...]."""
    if InlineKeyboardButton is None or InlineKeyboardMarkup is None:
        return None

    keyboard = []
    for date_str, label in dates:
        keyboard.append([
            InlineKeyboardButton(text=f"📅 {label}", callback_data=f"book_date:{date_str}")
        ])

    keyboard.append([InlineKeyboardButton(text="❌ Bekor qilish", callback_data="book_cancel")])
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


def time_slot_inline(slots: list[str]) -> Any:
    """Inline buttons to select available time slots."""
    if InlineKeyboardButton is None or InlineKeyboardMarkup is None:
        return None

    keyboard = []
    row = []
    for slot in slots:
        row.append(InlineKeyboardButton(text=f"🕒 {slot}", callback_data=f"book_slot:{slot}"))
        if len(row) == 3:
            keyboard.append(row)
            row = []
    if row:
        keyboard.append(row)

    keyboard.append([InlineKeyboardButton(text="❌ Bekor qilish", callback_data="book_cancel")])
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


__all__ = [
    "share_phone_keyboard",
    "remove_keyboard",
    "patient_main_keyboard",
    "doctor_main_keyboard",
    "admin_main_keyboard",
    "ai_mode_keyboard",
    "appointment_actions_inline",
    "doctor_appointment_status_inline",
    "department_select_inline",
    "doctor_select_inline",
    "date_select_inline",
    "time_slot_inline",
]
