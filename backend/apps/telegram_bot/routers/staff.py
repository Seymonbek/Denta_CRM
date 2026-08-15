"""Staff Telegram Bot Router — Role-based menus for Doctors & Admins, Interactive AI Chat Mode, Stock & Finance reports."""
from __future__ import annotations

import logging
from typing import Any

from asgiref.sync import sync_to_async
from django.utils import timezone

logger = logging.getLogger(__name__)

try:
    from aiogram import F, Router
    from aiogram.filters import Command, StateFilter
    from aiogram.fsm.context import FSMContext
    from aiogram.types import Message
except Exception:  # pragma: no cover - aiogram absent
    F = None  # type: ignore[assignment,misc]
    Router = None  # type: ignore[assignment,misc]
    Command = None  # type: ignore[assignment,misc]
    StateFilter = None  # type: ignore[assignment,misc]
    Message = object  # type: ignore[assignment,misc]
    FSMContext = Any  # type: ignore[misc]

from ..helpers import (  # noqa: E402
    format_appointments_list,
    format_daily_financial_summary,
    format_stock_report,
    get_chat_identity,
)
from ..keyboards import (  # noqa: E402
    admin_main_keyboard,
    ai_mode_keyboard,
    doctor_main_keyboard,
    remove_keyboard,
    share_phone_keyboard,
)
from ..states import AIChatState, PhoneVerification  # noqa: E402


def build_router():
    """Return configured Router for staff (doctor/admin) handlers."""
    if Router is None:
        return None
    router = Router(name="staff")

    # -----------------------------------------------------------------------
    # Helper to send role keyboard
    # -----------------------------------------------------------------------
    async def _send_role_main_menu(message: Message, role: str, name: str) -> None:
        role_titles = {
            "bosh_shifokor": "👨‍⚕️ Bosh Shifokor",
            "doctor": "🩺 Shifokor",
            "administrator": "👔 Administrator",
        }
        title = role_titles.get(role, "Xodim")
        kb = admin_main_keyboard() if role in ["bosh_shifokor", "administrator"] else doctor_main_keyboard()

        await message.answer(
            f"Assalomu alaykum, <b>{name}</b> ({title})!\n\nDentaCRM xodimlar paneliga xush kelibsiz.",
            reply_markup=kb,
            parse_mode="HTML",
        )

    # -----------------------------------------------------------------------
    # /start & Phone linking
    # -----------------------------------------------------------------------
    @router.message(Command("start"))
    async def on_start(message: Message, state: FSMContext) -> None:
        await state.clear()
        chat_id = getattr(message.chat, "id", None)
        identity = await sync_to_async(get_chat_identity)(chat_id)

        if identity["type"] == "staff":
            await _send_role_main_menu(message, identity["role"], identity["name"])
        else:
            await state.set_state(PhoneVerification.waiting_for_phone)
            await message.answer(
                "Assalomu alaykum! DentaCRM xodimlar bot'ida ro'yxatdan o'tish "
                "uchun telefon raqamingizni ulashing.",
                reply_markup=share_phone_keyboard(),
                parse_mode="HTML",
            )

    @router.message(F.contact)
    async def on_contact(message: Message, state: FSMContext) -> None:
        contact = message.contact
        phone_raw = getattr(contact, "phone_number", "") or ""
        chat_id = getattr(message.chat, "id", None)

        result = await sync_to_async(_link_staff_chat)(phone_raw, chat_id)
        result = await sync_to_async(_link_staff_chat, thread_sensitive=False)(phone_raw, chat_id)
        if result["status"] == "ok":
            await state.clear()
            await _send_role_main_menu(message, result["role"], result["name"])
        else:
            await message.answer(
                "⚠️ Ushbu raqam bilan xodim topilmadi.\nIltimos, administrator bilan bog'laning.",
                reply_markup=remove_keyboard(),
            )

    # -----------------------------------------------------------------------
    # Menu Actions: Appointments & Stock
    # -----------------------------------------------------------------------
    @router.message(Command("appointments"))
    @router.message(F.text.in_(["📋 Bugungi Navbatlar", "📋 Barcha Navbatlar"]))
    async def on_appointments(message: Message) -> None:
        chat_id = getattr(message.chat, "id", None)
        text = await sync_to_async(_get_telegram_appointments_report_html, thread_sensitive=False)(chat_id)
        identity = await sync_to_async(get_chat_identity, thread_sensitive=False)(chat_id)
        kb = admin_main_keyboard() if identity.get("role") in ["bosh_shifokor", "administrator"] else doctor_main_keyboard()
        await message.answer(text, reply_markup=kb, parse_mode="HTML")

    @router.message(Command("stock"))
    @router.message(F.text.in_(["📦 Ombor Holati", "📦 Ombor Qoldig'i"]))
    async def on_stock(message: Message) -> None:
        chat_id = getattr(message.chat, "id", None)
        text = await sync_to_async(_get_telegram_stock_report_html, thread_sensitive=False)(chat_id)
        identity = await sync_to_async(get_chat_identity, thread_sensitive=False)(chat_id)
        kb = admin_main_keyboard() if identity.get("role") in ["bosh_shifokor", "administrator"] else doctor_main_keyboard()
        await message.answer(text, reply_markup=kb, parse_mode="HTML")

    @router.message(F.text & (F.text.contains("Tushum") | F.text.contains("Reyting")))
    async def on_financial_report(message: Message) -> None:
        chat_id = getattr(message.chat, "id", None)
        text_raw = (message.text or "")
        if "Oylik" in text_raw or "Reyting" in text_raw:
            text = await sync_to_async(_get_telegram_monthly_financial_html, thread_sensitive=False)(chat_id)
        else:
            text = await sync_to_async(_get_telegram_daily_financial_html, thread_sensitive=False)(chat_id)
        await message.answer(text, reply_markup=admin_main_keyboard(), parse_mode="HTML")

    # -----------------------------------------------------------------------
    # Doctor Inline Appointment Status Callbacks
    # -----------------------------------------------------------------------
    @router.callback_query(F.data.startswith("doc_app_progress:"))
    async def on_doc_set_in_progress(callback: CallbackQuery) -> None:
        await callback.answer("Jarayonga o'tkazildi.")
        app_id = callback.data.split(":")[1]
        ok = await sync_to_async(_update_appointment_status, thread_sensitive=False)(app_id, "in_progress")
        if ok:
            await callback.message.edit_text(f"🩺 Navbat <b>Jarayonda</b> holatiga o'tkazildi. (ID: #{app_id})", parse_mode="HTML")
        else:
            await callback.message.edit_text("⚠️ Navbat topilmadi.")

    @router.callback_query(F.data.startswith("doc_app_noshow:"))
    async def on_doc_set_no_show(callback: CallbackQuery) -> None:
        await callback.answer("Kelmadi sifatida belgilandi.")
        app_id = callback.data.split(":")[1]
        ok = await sync_to_async(_update_appointment_status, thread_sensitive=False)(app_id, "no_show")
        if ok:
            await callback.message.edit_text(f"⚠️ Navbat <b>Kelmadi</b> sifatida belgilandi. (ID: #{app_id})", parse_mode="HTML")
        else:
            await callback.message.edit_text("⚠️ Navbat topilmadi.")

    @router.callback_query(F.data.startswith("doc_app_complete:"))
    async def on_doc_set_complete(callback: CallbackQuery) -> None:
        await callback.answer("Yakunlandi.")
        app_id = callback.data.split(":")[1]
        ok = await sync_to_async(_update_appointment_status, thread_sensitive=False)(app_id, "completed")
        if ok:
            await callback.message.edit_text(f"✔️ Navbat muvaffaqiyatli <b>Yakunlandi</b>! (ID: #{app_id})", parse_mode="HTML")
        else:
            await callback.message.edit_text("⚠️ Navbat topilmadi.")

    @router.message(F.text == "⚙️ Akkaunt")
    async def on_account_info(message: Message) -> None:
        chat_id = getattr(message.chat, "id", None)
        identity = await sync_to_async(get_chat_identity, thread_sensitive=False)(chat_id)
        if identity["type"] != "staff":
            await message.answer("Akkaunt ulanmagan.", reply_markup=share_phone_keyboard())
            return
        
        user = identity["object"]
        text = (
            f"<b>⚙️ Akkaunt Ma'lumotlari</b>\n\n"
            f"👤 <b>F.I.SH:</b> {user.get_full_name()}\n"
            f"📞 <b>Telefon:</b> {user.phone_number}\n"
            f"📌 <b>Rol:</b> {user.get_role_display()}\n"
            f"💬 <b>Telegram ID:</b> <code>{user.telegram_chat_id}</code>"
        )
        kb = admin_main_keyboard() if identity.get("role") in ["bosh_shifokor", "administrator"] else doctor_main_keyboard()
        await message.answer(text, reply_markup=kb, parse_mode="HTML")

    # -----------------------------------------------------------------------
    # Interactive AI Assistant Chat Mode (FSM)
    # -----------------------------------------------------------------------
    @router.message(Command("ai"))
    @router.message(F.text == "🤖 AI Yordamchi")
    async def start_ai_chat_mode(message: Message, state: FSMContext) -> None:
        text_raw = (message.text or "").strip()
        chat_id = getattr(message.chat, "id", None)

        if text_raw in ["🤖 AI Yordamchi", "/ai"]:
            await state.set_state(AIChatState.in_chat)
            await message.answer(
                "🤖 <b>AI Yordamchi Chat Rejimi Faollashtirildi!</b>\n\n"
                "Klinika ombori, bemorlar, navbatlar va moliya bo'yicha har qanday savolingizni yozing.\n"
                "<i>(Tugatish uchun quyidagi '❌ AI Chat Rejimini Yakunlash' tugmasini bosing)</i>",
                reply_markup=ai_mode_keyboard(),
                parse_mode="HTML",
            )
            return

        parts = text_raw.split(maxsplit=1)
        if len(parts) > 1 and parts[0].lower() in ["/ai", "ai"]:
            query = parts[1].strip()
            answer = await sync_to_async(_process_telegram_ai_query, thread_sensitive=False)(chat_id, query)
            await message.answer(answer, parse_mode="HTML")
            return

        await state.set_state(AIChatState.in_chat)
        await message.answer(
            "🤖 <b>AI Yordamchi Chat Rejimi Faollashtirildi!</b>\n\n"
            "Klinika ombori, bemorlar, navbatlar va moliya bo'yicha har qanday savolingizni yozing.\n"
            "<i>(Tugatish uchun quyidagi '❌ AI Chat Rejimini Yakunlash' tugmasini bosing)</i>",
            reply_markup=ai_mode_keyboard(),
            parse_mode="HTML",
        )

    @router.message(F.text == "❌ AI Chat Rejimini Yakunlash", StateFilter(AIChatState.in_chat))
    async def exit_ai_chat_mode(message: Message, state: FSMContext) -> None:
        await state.clear()
        chat_id = getattr(message.chat, "id", None)
        identity = await sync_to_async(get_chat_identity, thread_sensitive=False)(chat_id)
        kb = admin_main_keyboard() if identity.get("role") in ["bosh_shifokor", "administrator"] else doctor_main_keyboard()
        await message.answer("AI Chat rejimi yakunlandi. Asosiy menyuga qaytdingiz.", reply_markup=kb)

    @router.message(F.text, StateFilter(AIChatState.in_chat))
    async def on_ai_continuous_query(message: Message) -> None:
        text_raw = (message.text or "").strip()
        if text_raw.startswith("/"):
            return
        chat_id = getattr(message.chat, "id", None)

        # Show typing status feel
        answer = await sync_to_async(_process_telegram_ai_query, thread_sensitive=False)(chat_id, text_raw)
        await message.answer(answer, reply_markup=ai_mode_keyboard(), parse_mode="HTML")

    # -----------------------------------------------------------------------
    # Text fallback for Phone Verification
    # -----------------------------------------------------------------------
    @router.message(F.text, StateFilter(PhoneVerification.waiting_for_phone))
    async def on_text_phone(message: Message, state: FSMContext) -> None:
        text_raw = (message.text or "").strip()
        if text_raw.startswith("/"):
            return
        digits = "".join(ch for ch in text_raw if ch.isdigit())
        if len(digits) < 9:
            await message.answer(
                "Iltimos, telefon raqamingizni to'liq kiriting (masalan: +998901234567).",
                reply_markup=share_phone_keyboard(),
            )
            return

        chat_id = getattr(message.chat, "id", None)
        result = await sync_to_async(_link_staff_chat, thread_sensitive=False)(text_raw, chat_id)
        if result["status"] == "ok":
            await state.clear()
            await _send_role_main_menu(message, result["role"], result["name"])
        else:
            await message.answer(
                "⚠️ Ushbu raqam bilan xodim topilmadi.\nIltimos, administrator bilan bog'laning.",
                reply_markup=remove_keyboard(),
            )

    return router


# ---------------------------------------------------------------------------
# Sync Helpers for ORM Operations with Caching
# ---------------------------------------------------------------------------
def _normalise_phone(raw: str) -> str:
    digits = "".join(ch for ch in raw if ch.isdigit())
    return digits[-9:] if len(digits) >= 9 else digits


def _link_staff_chat(phone_raw: str, chat_id: int | None) -> dict[str, Any]:
    from apps.accounts.models import User

    try:
        user = User.objects.get(phone_number__endswith=_normalise_phone(phone_raw), is_active=True)
    except User.DoesNotExist:
        return {"status": "not_found"}

    if chat_id:
        user.telegram_chat_id = chat_id
        user.save(update_fields=["telegram_chat_id"])
    return {"status": "ok", "name": user.get_full_name() or user.phone_number, "role": user.role}


def _get_telegram_appointments_report_html(chat_id: int | None) -> str:
    from apps.accounts.models import User
    from apps.scheduling.models import Appointment

    user = User.objects.filter(telegram_chat_id=chat_id, is_active=True).first()
    if not user:
        return "Xodim akkaunti topilmadi."

    today = timezone.now().date()
    qs = Appointment.objects.filter(is_active=True, scheduled_start__date=today).select_related("doctor__user", "patient")

    if user.role == "doctor":
        qs = qs.filter(doctor__user=user)
        title = f"📋 Bugungi Navbatlaringiz ({today.strftime('%d.%m.%Y')})"
    else:
        title = f"📋 Klinikaning Bugungi Barcha Navbatlari ({today.strftime('%d.%m.%Y')})"

    return format_appointments_list(list(qs.order_by("scheduled_start")), title=title)


def _get_telegram_stock_report_html(chat_id: int | None) -> str:
    from django.core.cache import cache
    cache_key = "tg_stock_report_html"
    cached = cache.get(cache_key)
    if cached:
        return cached

    from apps.inventory.models import Material

    materials = list(Material.objects.filter(is_active=True).order_by("quantity_in_stock"))
    result = format_stock_report(materials)
    cache.set(cache_key, result, timeout=15)
    return result


def _get_telegram_daily_financial_html(chat_id: int | None) -> str:
    from django.core.cache import cache
    cache_key = f"tg_financial_report_html_{chat_id}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    from django.db.models import Sum

    from apps.accounts.models import User
    from apps.payments.models import Payment, Expense

    user = User.objects.filter(telegram_chat_id=chat_id, is_active=True).first()
    if not user or user.role not in ["bosh_shifokor", "administrator"]:
        return "⚠️ Bu hisobotni faqat Bosh Shifokor va Administratorlar ko'ra oladi."

    today = timezone.now().date()
    payments = Payment.objects.filter(is_active=True, created_at__date=today)
    total_income = payments.aggregate(sum=Sum("amount"))["sum"] or 0
    
    expenses = Expense.objects.filter(is_active=True, created_at__date=today)
    total_expense = expenses.aggregate(sum=Sum("amount"))["sum"] or 0

    result = format_daily_financial_summary({
        "total_income": float(total_income),
        "payments_count": payments.count(),
        "total_expense": float(total_expense),
        "expenses_count": expenses.count(),
    })
    cache.set(cache_key, result, timeout=15)
    return result


def _process_telegram_ai_query(chat_id: int | None, query: str) -> str:
    from apps.accounts.models import User
    from apps.ai_assistant.services import generate_ai_chat_response

    user = User.objects.filter(telegram_chat_id=chat_id, is_active=True).first()
    if not user:
        return "🤖 AI yordamchisidan foydalanish uchun akkauntingiz ulangan bo'lishi kerak."

    try:
        result = generate_ai_chat_response(query=query, user=user)
        answer = result.get("answer", "Javob tayyorlashda xatolik yuz berdi.")
        source = result.get("source", "ai")
        source_label = "💡 <i>AI Tahlil</i>" if source in ["gemini-ai", "ai"] else "🔍 <i>DB Qidiruv</i>"
        return f"🤖 <b>AI Yordamchi Javobi:</b>\n\n{answer}\n\n{source_label}"
    except Exception as err:
        logger.exception("telegram_bot: error processing AI query")
        return f"⚠️ AI servisida xatolik yuz berdi: {err}"


def _update_appointment_status(appointment_id: str, new_status: str) -> bool:
    from apps.scheduling.models import Appointment

    try:
        app = Appointment.objects.get(pk=appointment_id)
        app.status = new_status
        app.save(update_fields=["status"])
        return True
    except Appointment.DoesNotExist:
        return False


def _get_telegram_monthly_financial_html(chat_id: int | None) -> str:
    from django.db.models import Count, Sum
    from apps.accounts.models import User
    from apps.payments.models import Payment, Expense

    user = User.objects.filter(telegram_chat_id=chat_id, is_active=True).first()
    if not user or user.role not in ["bosh_shifokor", "administrator"]:
        return "⚠️ Bu hisobotni faqat Bosh Shifokor ko'ra oladi."

    now = timezone.now()
    start_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    payments = Payment.objects.filter(is_active=True, created_at__gte=start_month)

    total_income = payments.aggregate(sum=Sum("amount"))["sum"] or 0
    count = payments.count()

    expenses = Expense.objects.filter(is_active=True, created_at__gte=start_month)
    total_expense = expenses.aggregate(sum=Sum("amount"))["sum"] or 0
    expenses_count = expenses.count()
    net_profit = total_income - total_expense

    doc_breakdown = (
        payments.values("treatment__doctor__user__first_name", "treatment__doctor__user__last_name")
        .annotate(total=Sum("amount"), cnt=Count("id"))
        .order_by("-total")[:5]
    )

    lines = [
        f"<b>📊 Oylik Tushum va Xarajatlar Hisoboti</b>",
        f"Oydan: <b>01.{now.strftime('%m.%Y')}</b> — Bugungacha\n",
        f"💰 <b>Jami Oylik Tushum:</b> <code>{total_income:,.0f} so'm</code>",
        f"💳 <b>Jami To'lovlar Soni:</b> <b>{count}</b> ta\n",
        f"📉 <b>Jami Oylik Xarajat:</b> <code>{total_expense:,.0f} so'm</code>",
        f"🧾 <b>Xarajatlar Soni:</b> <b>{expenses_count}</b> ta\n",
        f"💵 <b>Sof Qoldiq (Foyda):</b> <code>{net_profit:,.0f} so'm</code>\n",
        f"<b>👨‍⚕️ Shifokorlar Tushum Reytingi:</b>",
    ]

    for idx, doc in enumerate(doc_breakdown, start=1):
        fn = doc.get("treatment__doctor__user__first_name") or ""
        ln = doc.get("treatment__doctor__user__last_name") or ""
        name = f"{fn} {ln}".strip() or "Shifokor"
        tot = doc.get("total", 0)
        cnt = doc.get("cnt", 0)
        lines.append(f"{idx}. <b>Dr. {name}</b> — <code>{tot:,.0f} so'm</code> ({cnt} ta muolaja)")

    if not doc_breakdown:
        lines.append("<i>Hali bu oyda to'lovlar kiritilmagan.</i>")

    return "\n".join(lines)
