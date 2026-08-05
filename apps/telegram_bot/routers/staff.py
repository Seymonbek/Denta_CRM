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


__all__ = ["build_router"]
