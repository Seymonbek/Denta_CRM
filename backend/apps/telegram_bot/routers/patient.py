"""Patient bot flow — patient interactive features and notification receiver.

Features:
* Patient links account via phone number.
* `/my_appointments` — View upcoming appointments.
* `/my_prescriptions` — View received prescriptions.
"""
from __future__ import annotations

import logging

from asgiref.sync import sync_to_async

logger = logging.getLogger(__name__)

try:
    from aiogram import F, Router
    from aiogram.filters import Command
    from aiogram.types import Message
except Exception:  # pragma: no cover - aiogram absent
    F = None  # type: ignore[assignment,misc]
    Router = None  # type: ignore[assignment,misc]
    Command = None  # type: ignore[assignment,misc]
    Message = object  # type: ignore[assignment,misc]

from ..keyboards import remove_keyboard, share_phone_keyboard  # noqa: E402


def build_router():
    """Return a configured aiogram Router for patient handlers."""
    if Router is None:
        return None
    router = Router(name="patient")

    @router.message(Command("start"))
    async def on_start(message: Message) -> None:  # type: ignore[valid-type]
        await message.answer(
            "Assalomu alaykum! DentaCRM bemorlar botiga xush kelibsiz.\n"
            "Navbatlar va retseptlaringizni ko'rish uchun telefon raqamingizni ulashing.",
            reply_markup=share_phone_keyboard(),
        )

    @router.message(F.contact)  # type: ignore[union-attr]
    async def on_contact(message: Message) -> None:  # type: ignore[valid-type]
        contact = message.contact
        phone_raw = getattr(contact, "phone_number", "") or ""
        chat_id = getattr(message.chat, "id", None)

        result = await sync_to_async(_link_patient_chat)(phone_raw, chat_id)
        if result["status"] == "ok":
            await message.answer(
                f"Xush kelibsiz, {result['name']}! Akkauntingiz muvaffaqiyatli ulandi.\n\n"
                "Mavjud buyruqlar:\n"
                "• /my_appointments — Navbatlaringiz ro'yxati\n"
                "• /my_prescriptions — Retseptlaringiz ro'yxati",
                reply_markup=remove_keyboard(),
            )
        else:
            await message.answer(
                "Telefon raqamingiz bo'yicha bemor topilmadi. "
                "Iltimos, klinika administratsiyasi bilan bog'laning.",
                reply_markup=remove_keyboard(),
            )

    @router.message(Command("my_appointments"))
    async def on_my_appointments(message: Message) -> None:  # type: ignore[valid-type]
        chat_id = getattr(message.chat, "id", None)
        text = await sync_to_async(_get_patient_appointments)(chat_id)
        await message.answer(text)

    @router.message(Command("my_prescriptions"))
    async def on_my_prescriptions(message: Message) -> None:  # type: ignore[valid-type]
        chat_id = getattr(message.chat, "id", None)
        text = await sync_to_async(_get_patient_prescriptions)(chat_id)
        await message.answer(text)

    return router


def _link_patient_chat(phone_raw: str, chat_id: int | None) -> dict:
    from apps.patients.models import Patient

    digits = "".join(ch for ch in (phone_raw or "") if ch.isdigit())
    suffix = digits[-9:] if len(digits) >= 9 else digits

    try:
        patient = Patient.objects.get(phone_number__endswith=suffix)
    except Patient.DoesNotExist:
        return {"status": "not_found"}

    if chat_id:
        patient.telegram_chat_id = str(chat_id)
        patient.save(update_fields=["telegram_chat_id"])
    return {"status": "ok", "name": patient.full_name}


def _get_patient_appointments(chat_id: int | None) -> str:
    from django.utils import timezone
    from apps.patients.models import Patient
    from apps.scheduling.models import Appointment

    if not chat_id:
        return "Akkaunt topilmadi. /start bilan telefon raqamingizni yuboring."

    try:
        patient = Patient.objects.get(telegram_chat_id=str(chat_id))
    except Patient.DoesNotExist:
        return "Akkaunt topilmadi. /start bilan telefon raqamingizni yuboring."

    appts = Appointment.objects.filter(
        patient=patient,
        scheduled_start__gte=timezone.now() - timezone.timedelta(days=1),
    ).order_by("scheduled_start")[:5]

    if not appts.exists():
        return "Sizda kutilayotgan navbatlar yo'q."

    lines = ["📅 <b>Sizning navbatlaringiz:</b>\n"]
    for appt in appts:
        dt = timezone.localtime(appt.scheduled_start).strftime("%Y-%m-%d %H:%M")
        doc_name = appt.doctor.user.full_name if appt.doctor and appt.doctor.user else "Shifokor"
        lines.append(f"• <b>{dt}</b> — {doc_name} [{appt.get_status_display()}]")

    return "\n".join(lines)


def _get_patient_prescriptions(chat_id: int | None) -> str:
    from apps.patients.models import Patient
    from apps.prescriptions.models import Prescription

    if not chat_id:
        return "Akkaunt topilmadi. /start bilan telefon raqamingizni yuboring."

    try:
        patient = Patient.objects.get(telegram_chat_id=str(chat_id))
    except Patient.DoesNotExist:
        return "Akkaunt topilmadi. /start bilan telefon raqamingizni yuboring."

    prescriptions = Prescription.objects.filter(
        treatment__patient=patient,
        is_active=True,
    ).order_by("-created_at")[:5]

    if not prescriptions.exists():
        return "Sizda retseptlar mavjud emas."

    lines = ["💊 <b>Sizga yozilgan retseptlar:</b>\n"]
    for p in prescriptions:
        dt = p.created_at.strftime("%Y-%m-%d")
        lines.append(f"• <b>{dt}</b>: {p.content[:100]}...")

    return "\n".join(lines)


__all__ = ["build_router"]
