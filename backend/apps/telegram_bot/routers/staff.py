"""Staff bot routes — links a User's telegram_chat_id to their account.

Flow:

1. Staff sends ``/start`` → bot asks for phone number via one-time
   keyboard.
2. Staff shares contact → bot creates an OTP tied to the matching User.
3. Staff sends ``/link <otp-code>`` → bot links ``telegram_chat_id`` to
   the User and confirms.

All handlers use synchronous ORM inside :func:`sync_to_async` so the
router remains fully async-compatible.
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
from ..states import PhoneVerification  # noqa: E402


def build_router():
    """Return a configured aiogram :class:`Router` for staff handlers.

    Returns ``None`` when aiogram is not installed so the function is
    safe to import from environments that only need the sender helpers.
    """
    if Router is None:
        return None
    router = Router(name="staff")

    @router.message(Command("start"))
    async def on_start(message: Message, state) -> None:  # type: ignore[valid-type]
        await state.set_state(PhoneVerification.waiting_for_phone)
        await message.answer(
            "Assalomu alaykum! DentaCRM xodimlar bot'ida ro'yxatdan o'tish "
            "uchun telefon raqamingizni ulashing.",
            reply_markup=share_phone_keyboard(),
        )

    @router.message(F.contact)  # type: ignore[union-attr]
    async def on_contact(message: Message, state) -> None:  # type: ignore[valid-type]
        contact = message.contact
        phone_raw = getattr(contact, "phone_number", "") or ""
        chat_id = getattr(message.chat, "id", None)

        result = await sync_to_async(_start_otp_link)(phone_raw, chat_id)
        if result.get("status") == "not_found":
            await message.answer(
                "Bu raqam bilan foydalanuvchi topilmadi. Iltimos, administrator bilan bog'laning.",
                reply_markup=remove_keyboard(),
            )
            await state.clear()
            return

        await state.update_data(user_id=result["user_id"])
        await state.set_state(PhoneVerification.waiting_for_otp)
        await message.answer(
            "Telefonga OTP kod yubordik. Iltimos, ``/link <kod>`` ko'rinishida yuboring.",
            reply_markup=remove_keyboard(),
        )

    @router.message(Command("link"))
    async def on_link(message: Message, state) -> None:  # type: ignore[valid-type]
        text = (message.text or "").strip()
        parts = text.split(maxsplit=1)
        if len(parts) < 2:
            await message.answer("Foydalanish: /link <OTP-kod>")
            return

        code = parts[1].strip()
        data = await state.get_data()
        user_id = data.get("user_id")
        chat_id = getattr(message.chat, "id", None)

        result = await sync_to_async(_confirm_otp_link)(user_id, code, chat_id)
        if result["status"] == "ok":
            await message.answer(
                f"Ro'yxatdan o'tdingiz! Xush kelibsiz, {result['name']}."
            )
        elif result["status"] == "expired":
            await message.answer("OTP muddati o'tgan. /start bilan qayta boshlang.")
        elif result["status"] == "invalid":
            await message.answer("Kod noto'g'ri. Qayta urinib ko'ring.")
        else:
            await message.answer("Xatolik yuz berdi. Administrator bilan bog'laning.")
        await state.clear()

    @router.message(Command("stock"))
    async def on_stock(message: Message) -> None:
        chat_id = getattr(message.chat, "id", None)
        text = await sync_to_async(_get_telegram_stock_report)(chat_id)
        await message.answer(text)

    @router.message(Command("appointments"))
    async def on_appointments(message: Message) -> None:
        chat_id = getattr(message.chat, "id", None)
        text = await sync_to_async(_get_telegram_appointments_report)(chat_id)
        await message.answer(text)

    @router.message(Command("ai"))
    async def on_ai_query(message: Message) -> None:
        chat_id = getattr(message.chat, "id", None)
        text_raw = (message.text or "").strip()
        parts = text_raw.split(maxsplit=1)
        query = parts[1].strip() if len(parts) > 1 else "Ombor holati haqida ma'lumot bering"
        answer = await sync_to_async(_process_telegram_ai_query)(chat_id, query)
        await message.answer(answer)

    return router


# ---------------------------------------------------------------------------
# Sync helpers wrapped by ``sync_to_async`` above
# ---------------------------------------------------------------------------
def _start_otp_link(phone_raw: str, chat_id: int | None) -> dict:
    """Create an OTP for a User matching ``phone_raw``. Returns status dict."""
    from apps.accounts.models import OTPCode, User, generate_otp_code

    try:
        user = User.objects.get(phone_number__endswith=_normalise_phone(phone_raw))
    except User.DoesNotExist:
        logger.info("telegram_bot: staff phone %s did not match any user", phone_raw)
        return {"status": "not_found"}

    code = generate_otp_code(6)
    OTPCode.objects.create(user=user, code=code, purpose=OTPCode.Purpose.LOGIN)
    logger.info(
        "telegram_bot: OTP %s generated for user=%s chat=%s (dev mock)",
        code,
        user.pk,
        chat_id,
    )
    return {"status": "ok", "user_id": str(user.pk), "otp": code}


def _confirm_otp_link(user_id: str | None, code: str, chat_id: int | None) -> dict:
    from django.utils import timezone

    from apps.accounts.models import OTPCode, User

    if not user_id or not code:
        return {"status": "invalid"}
    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return {"status": "invalid"}

    otp = (
        OTPCode.objects.filter(
            user=user,
            code=code,
            is_used=False,
            purpose=OTPCode.Purpose.LOGIN,
        )
        .order_by("-id")
        .first()
    )
    if otp is None:
        return {"status": "invalid"}
    if otp.expires_at and otp.expires_at < timezone.now():
        return {"status": "expired"}

    otp.is_used = True
    otp.save(update_fields=["is_used"])
    if chat_id:
        user.telegram_chat_id = chat_id
        user.save(update_fields=["telegram_chat_id"])
    return {"status": "ok", "name": user.full_name}


def _normalise_phone(raw: str) -> str:
    """Strip separators; return last 9-10 digits for ``endswith`` matching."""
    digits = "".join(ch for ch in (raw or "") if ch.isdigit())
    return digits[-9:] if len(digits) >= 9 else digits


def _get_telegram_stock_report(chat_id: int | None) -> str:
    """Return a formatted Telegram message of current inventory stock alerts."""
    from apps.ai_assistant.services import get_inventory_analytics

    analytics = get_inventory_analytics()
    low_count = analytics["low_stock_count"]
    out_count = analytics["out_of_stock_count"]
    total = analytics["total_materials_count"]

    if low_count == 0 and out_count == 0:
        return f"✅ Ombor holati a'lo: barcha {total} ta material yetarli miqdorda mavjud."

    lines = [f"⚠️ <b>Ombor zaxirasi bo'yicha ogohlantirish:</b>", f"• Jami materiallar: {total} ta", f"• Kam qolgan: {low_count} ta", f"• Tugagan: {out_count} ta\n"]
    for item in analytics["low_stock_items"]:
        status_icon = "❌" if item["is_out_of_stock"] else "⚠️"
        lines.append(
            f"{status_icon} <b>{item['name']}</b>: {item['quantity_in_stock']} {item['unit']} (minimal: {item['minimum_threshold']})"
        )

    return "\n".join(lines)


def _get_telegram_appointments_report(chat_id: int | None) -> str:
    """Return today's appointments report for the staff member."""
    from django.utils import timezone
    from apps.accounts.models import User
    from apps.scheduling.models import Appointment

    if not chat_id:
        return "Tizimga ulangan akkaunt topilmadi. /start bilan ro'yxatdan o'ting."

    try:
        user = User.objects.get(telegram_chat_id=chat_id)
    except User.DoesNotExist:
        return "Tizimga ulangan akkaunt topilmadi. /start bilan ro'yxatdan o'ting."

    today = timezone.localdate()
    appts = Appointment.objects.filter(scheduled_start__date=today)
    if user.role == User.Role.DOCTOR:
        appts = appts.filter(doctor__user=user)

    count = appts.count()
    if count == 0:
        return f"📅 Bugun ({today}) hech qanday navbat mavjud emas."

    lines = [f"📅 <b>Bugungi navbatlar ro'yxati ({count} ta):</b>\n"]
    for appt in appts[:10]:
        time_str = timezone.localtime(appt.scheduled_start).strftime("%H:%M")
        pat_name = appt.patient.full_name if appt.patient else "Bemor"
        lines.append(f"• <b>{time_str}</b> — {pat_name} [{appt.get_status_display()}]")

    return "\n".join(lines)


def _process_telegram_ai_query(chat_id: int | None, query: str) -> str:
    """Process an AI query for the staff member using CRM context."""
    from apps.accounts.models import User
    from apps.ai_assistant.services import generate_ai_chat_response

    if not chat_id:
        return "Tizimga ulangan akkaunt topilmadi. /start bilan ro'yxatdan o'ting."

    try:
        user = User.objects.get(telegram_chat_id=chat_id)
    except User.DoesNotExist:
        return "Tizimga ulangan akkaunt topilmadi. /start bilan ro'yxatdan o'ting."

    res = generate_ai_chat_response(query=query, user=user)
    return res["answer"]


__all__ = ["build_router"]
