"""Patient Telegram Bot Router — Interactive appointment booking, prescriptions, notifications, and keyboards."""
from __future__ import annotations

import datetime
import logging
from typing import Any

from asgiref.sync import sync_to_async
from django.utils import timezone

logger = logging.getLogger(__name__)

try:
    from aiogram import F, Router
    from aiogram.filters import Command, StateFilter
    from aiogram.fsm.context import FSMContext
    from aiogram.types import CallbackQuery, Message
except Exception:  # pragma: no cover - aiogram absent
    F = None  # type: ignore[assignment,misc]
    Router = None  # type: ignore[assignment,misc]
    Command = None  # type: ignore[assignment,misc]
    StateFilter = None  # type: ignore[assignment,misc]
    CallbackQuery = object  # type: ignore[assignment,misc]
    Message = object  # type: ignore[assignment,misc]
    FSMContext = Any  # type: ignore[misc]

from ..helpers import (  # noqa: E402
    format_appointments_list,
    format_prescriptions_list,
    get_chat_identity,
)
from ..keyboards import (  # noqa: E402
    date_select_inline,
    doctor_select_inline,
    patient_main_keyboard,
    remove_keyboard,
    share_phone_keyboard,
    time_slot_inline,
)
from ..states import BookingFlow, PhoneVerification  # noqa: E402


def build_router():
    """Return configured Router for patient handlers."""
    if Router is None:
        return None
    router = Router(name="patient")

    # -----------------------------------------------------------------------
    # /start & Phone linking
    # -----------------------------------------------------------------------
    @router.message(Command("start"))
    async def on_start(message: Message, state: FSMContext) -> None:
        await state.clear()
        chat_id = getattr(message.chat, "id", None)
        identity = await sync_to_async(get_chat_identity, thread_sensitive=False)(chat_id)

        if identity["type"] == "patient":
            await message.answer(
                f"Assalomu alaykum, <b>{identity['name']}</b>! DentaCRM bemorlar botiga xush kelibsiz. 😊\n\n"
                "Quyidagi menyu orqali navbatlaringiz va retseptlaringizni ko'rishingiz hamda yangi qabulga yozilishingiz mumkin.",
                reply_markup=patient_main_keyboard(),
                parse_mode="HTML",
            )
        else:
            await state.set_state(PhoneVerification.waiting_for_phone)
            await message.answer(
                "Assalomu alaykum! DentaCRM bemorlar botiga xush kelibsiz. 🦷\n\n"
                "Akkauntingizni ulash va xizmatlardan foydalanish uchun telefon raqamingizni yuboring.",
                reply_markup=share_phone_keyboard(),
                parse_mode="HTML",
            )

    @router.message(F.contact)
    async def on_contact(message: Message, state: FSMContext) -> None:
        contact = message.contact
        phone_raw = getattr(contact, "phone_number", "") or ""
        chat_id = getattr(message.chat, "id", None)

        result = await sync_to_async(_link_patient_chat, thread_sensitive=False)(phone_raw, chat_id)
        if result["status"] == "ok":
            await state.clear()
            await message.answer(
                f"🎉 Xush kelibsiz, <b>{result['name']}</b>!\nAkkauntingiz muvaffaqiyatli ulandi.",
                reply_markup=patient_main_keyboard(),
                parse_mode="HTML",
            )
        else:
            await message.answer(
                "⚠️ Ushbu telefon raqami bo'yicha bemor topilmadi.\n"
                "Iltimos, klinika administratsiyasi bilan bog'laning yoki qayta urinib ko'ring.",
                reply_markup=share_phone_keyboard(),
                parse_mode="HTML",
            )

    # -----------------------------------------------------------------------
    # Patient Main Menu Actions
    # -----------------------------------------------------------------------
    @router.message(Command("my_appointments"))
    @router.message(F.text == "📅 Navbatlarim")
    async def on_my_appointments(message: Message) -> None:
        chat_id = getattr(message.chat, "id", None)
        text = await sync_to_async(_get_patient_appointments_html, thread_sensitive=False)(chat_id)
        await message.answer(text, reply_markup=patient_main_keyboard(), parse_mode="HTML")

    @router.message(Command("my_prescriptions"))
    @router.message(F.text == "💊 Retseptlarim")
    async def on_my_prescriptions(message: Message) -> None:
        chat_id = getattr(message.chat, "id", None)
        text = await sync_to_async(_get_patient_prescriptions_html, thread_sensitive=False)(chat_id)
        await message.answer(text, reply_markup=patient_main_keyboard(), parse_mode="HTML")

    @router.message(F.text == "🦷 Muolajalarim")
    async def on_my_treatments(message: Message) -> None:
        chat_id = getattr(message.chat, "id", None)
        text = await sync_to_async(_get_patient_treatments_html, thread_sensitive=False)(chat_id)
        await message.answer(text, reply_markup=patient_main_keyboard(), parse_mode="HTML")

    @router.message(F.text == "🧾 To'lovlar va Cheklar")
    async def on_my_payments(message: Message) -> None:
        chat_id = getattr(message.chat, "id", None)
        text = await sync_to_async(_get_patient_payments_html, thread_sensitive=False)(chat_id)
        await message.answer(text, reply_markup=patient_main_keyboard(), parse_mode="HTML")

    @router.message(F.text == "🏥 Klinika Haqida")
    async def on_about_clinic(message: Message) -> None:
        text = (
            "<b>🏥 DentaCRM Stomatologiya Klinikasi</b>\n\n"
            "📍 <b>Manzil:</b> Toshkent sh., Chilonzor tumani, 5-mavze, 12-uy\n"
            "🕒 <b>Ish vaqti:</b> Dushanba - Shanba, 09:00 - 18:00\n"
            "⭐️ <b>Xizmatlarimiz:</b> Implantologiya, Ortodontiya, Terapevtik davolash, Estetik stomatologiya.\n\n"
            "<i>Biz sizning tabassumingiz haqida qayg'uramiz! ✨</i>"
        )
        await message.answer(text, reply_markup=patient_main_keyboard(), parse_mode="HTML")

    @router.message(F.text == "📞 Bog'lanish")
    async def on_contact_clinic(message: Message) -> None:
        text = (
            "<b>📞 Klinika Ma'muriyati bilan Aloqa</b>\n\n"
            "☎️ <b>Telefon:</b> +998 71 200 00 00\n"
            "📱 <b>Telegram:</b> @dentacrm_admin\n"
            "🌐 <b>Veb-sayt:</b> https://dentacrm.uz\n\n"
            "Savol va takliflaringiz bo'lsa bemalol bog'lanishingiz mumkin!"
        )
        await message.answer(text, reply_markup=patient_main_keyboard(), parse_mode="HTML")

    # -----------------------------------------------------------------------
    # Interactive Booking Flow (FSM)
    # -----------------------------------------------------------------------
    @router.message(F.text == "📝 Qabulga Yozilish")
    async def start_booking_flow(message: Message, state: FSMContext) -> None:
        chat_id = getattr(message.chat, "id", None)
        identity = await sync_to_async(get_chat_identity, thread_sensitive=False)(chat_id)
        if identity["type"] != "patient":
            await message.answer(
                "Qabulga yozilish uchun avval telefon raqamingizni ulashingiz kerak.",
                reply_markup=share_phone_keyboard(),
            )
            return

        doctors = await sync_to_async(_get_active_doctors, thread_sensitive=False)()
        if not doctors:
            await message.answer("Hozirda qabul qiluvchi shifokorlar topilmadi.")
            return

        await state.set_state(BookingFlow.selecting_doctor)
        await message.answer(
            "<b>📝 Qabulga Yozilish (1/3)</b>\n\nIltimos, ko'rikdan o'tmoqchi bo'lgan shifokoringizni tanlang:",
            reply_markup=doctor_select_inline(doctors),
            parse_mode="HTML",
        )

    @router.callback_query(F.data == "book_cancel")
    async def on_cancel_booking(callback: CallbackQuery, state: FSMContext) -> None:
        await state.clear()
        await callback.message.edit_text("❌ Qabulga yozilish bekor qilindi.")
        await callback.answer()

    @router.callback_query(F.data.startswith("book_doc:"))
    async def on_doctor_selected(callback: CallbackQuery, state: FSMContext) -> None:
        await callback.answer()
        doc_id = callback.data.split(":")[1]
        await state.update_data(doctor_id=doc_id)
        await state.set_state(BookingFlow.selecting_date)

        dates = await sync_to_async(_get_upcoming_dates, thread_sensitive=False)()
        await callback.message.edit_text(
            "<b>📅 Qabulga Yozilish (2/3)</b>\n\nIltimos, o'zingizga qulay sanani tanlang:",
            reply_markup=date_select_inline(dates),
            parse_mode="HTML",
        )

    @router.callback_query(F.data.startswith("book_date:"))
    async def on_date_selected(callback: CallbackQuery, state: FSMContext) -> None:
        await callback.answer()
        date_str = callback.data.split(":")[1]
        await state.update_data(date_str=date_str)
        data = await state.get_data()
        doc_id = data.get("doctor_id")

        slots = await sync_to_async(_get_available_slots, thread_sensitive=False)(doc_id, date_str)
        if not slots:
            await callback.message.edit_text(
                "Ushbu sanada bo'sh vaqt slotlari qolmagan. Iltimos, boshqa sanani tanlang.",
                reply_markup=date_select_inline(await sync_to_async(_get_upcoming_dates, thread_sensitive=False)()),
            )
            return

        await state.set_state(BookingFlow.selecting_slot)
        await callback.message.edit_text(
            f"<b>🕒 Qabulga Yozilish (3/3)</b>\nSana: <b>{date_str}</b>\n\nIltimos, qabul vaqtini tanlang:",
            reply_markup=time_slot_inline(slots),
            parse_mode="HTML",
        )
        await callback.answer()

    @router.callback_query(F.data.startswith("book_slot:"))
    async def on_slot_selected(callback: CallbackQuery, state: FSMContext) -> None:
        slot_time = callback.data.split(":")[1]
        data = await state.get_data()
        doc_id = data.get("doctor_id")
        date_str = data.get("date_str")
        chat_id = getattr(callback.message.chat, "id", None)

        res = await sync_to_async(_create_appointment_from_bot)(chat_id, doc_id, date_str, slot_time)
        await state.clear()

        if res["status"] == "ok":
            await callback.message.edit_text(
                f"🎉 <b>Qabulga Muvaffaqiyatli Yozildingiz!</b>\n\n"
                f"👨‍⚕️ <b>Shifokor:</b> {res['doctor_name']}\n"
                f"📅 <b>Sana:</b> {date_str}\n"
                f"🕒 <b>Vaqt:</b> {slot_time}\n\n"
                f"<i>Klinikamiz sizni kutmoqda! Qabul vaqti yaqinlashganda bot eslatma yuboradi.</i>",
                parse_mode="HTML",
            )
        else:
            err_msg = res.get("message", "Qabulga yozilib bo'lmadi.")
            await callback.message.edit_text(
                f"⚠️ Xatolik yuz berdi: {err_msg}"
            )
        await callback.answer()

    # -----------------------------------------------------------------------
    # Inline Confirmation & Cancellation Callbacks
    # -----------------------------------------------------------------------
    @router.callback_query(F.data.startswith("app_confirm:"))
    async def on_app_confirm(callback: CallbackQuery) -> None:
        app_id = callback.data.split(":")[1]
        res = await sync_to_async(_update_appointment_status)(app_id, "confirmed")
        if res:
            await callback.message.edit_text(
                callback.message.text + "\n\n<b>✅ Navbatingiz tasdiqlandi. Rahmat!</b>",
                parse_mode="HTML",
            )
        await callback.answer("Tasdiqlandi!")

    @router.callback_query(F.data.startswith("app_cancel:"))
    async def on_app_cancel(callback: CallbackQuery) -> None:
        app_id = callback.data.split(":")[1]
        res = await sync_to_async(_update_appointment_status)(app_id, "cancelled")
        if res:
            await callback.message.edit_text(
                callback.message.text + "\n\n<b>❌ Navbat bekor qilindi.</b>",
                parse_mode="HTML",
            )
        await callback.answer("Bekor qilindi!")

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
        result = await sync_to_async(_link_patient_chat)(text_raw, chat_id)
        if result["status"] == "ok":
            await state.clear()
            await message.answer(
                f"🎉 Xush kelibsiz, <b>{result['name']}</b>!\nAkkauntingiz muvaffaqiyatli ulandi.",
                reply_markup=patient_main_keyboard(),
                parse_mode="HTML",
            )
        else:
            await message.answer(
                "⚠️ Ushbu telefon raqami bo'yicha bemor topilmadi.\nIltimos, klinika administratsiyasi bilan bog'laning.",
                reply_markup=share_phone_keyboard(),
                parse_mode="HTML",
            )

    return router


# ---------------------------------------------------------------------------
# Sync Helpers for ORM Operations
# ---------------------------------------------------------------------------
def _normalise_phone(raw: str) -> str:
    digits = "".join(ch for ch in raw if ch.isdigit())
    return digits[-9:] if len(digits) >= 9 else digits


def _link_patient_chat(phone_raw: str, chat_id: int | None) -> dict[str, Any]:
    from apps.patients.models import Patient

    try:
        patient = Patient.objects.get(phone_number__endswith=_normalise_phone(phone_raw), is_active=True)
    except Patient.DoesNotExist:
        return {"status": "not_found"}

    if chat_id:
        patient.telegram_chat_id = chat_id
        patient.save(update_fields=["telegram_chat_id"])
    return {"status": "ok", "name": patient.full_name}


def _get_patient_appointments_html(chat_id: int | None) -> str:
    if not chat_id:
        return "Akkaunt ulanmagan."
    from apps.patients.models import Patient
    from apps.scheduling.models import Appointment

    patient = Patient.objects.filter(telegram_chat_id=chat_id, is_active=True).first()
    if not patient:
        return "Bemor akkaunti topilmadi."

    apps = Appointment.objects.filter(patient=patient, is_active=True).select_related("doctor__user").order_by("-scheduled_start")[:10]
    return format_appointments_list(list(apps), title=f"📅 {patient.full_name} — Navbatlaringiz")


def _get_patient_prescriptions_html(chat_id: int | None) -> str:
    if not chat_id:
        return "Akkaunt ulanmagan."
    from apps.patients.models import Patient
    from apps.prescriptions.models import Prescription

    patient = Patient.objects.filter(telegram_chat_id=chat_id, is_active=True).first()
    if not patient:
        return "Bemor akkaunti topilmadi."

    prescs = Prescription.objects.filter(patient=patient, is_active=True).select_related("doctor__user").prefetch_related("items").order_by("-created_at")[:10]
    return format_prescriptions_list(list(prescs))


def _get_active_doctors() -> list[dict[str, Any]]:
    from apps.doctors.models import DoctorProfile

    docs = DoctorProfile.objects.filter(is_active=True).select_related("user")
    res = []
    for d in docs:
        if d.user:
            res.append({
                "id": str(d.pk),
                "name": d.user.get_full_name() or d.user.phone_number,
                "specialty": getattr(d, "specialty", "Stomatolog"),
            })
    return res


def _get_upcoming_dates() -> list[tuple[str, str]]:
    today = timezone.now().date()
    dates = []
    weekdays_uz = ["Dush", "Sesh", "Chor", "Pay", "Jum", "Shan", "Yak"]
    for i in range(5):
        dt = today + datetime.timedelta(days=i)
        day_label = "Bugun" if i == 0 else ("Ertaga" if i == 1 else weekdays_uz[dt.weekday()])
        dates.append((dt.isoformat(), f"{day_label} ({dt.strftime('%d.%m')})"))
    return dates


def _get_available_slots(doctor_id: str, date_str: str) -> list[str]:
    from apps.scheduling.models import Appointment

    all_slots = ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00"]
    booked = Appointment.objects.filter(
        doctor_id=doctor_id,
        scheduled_start__date=date_str,
        is_active=True,
        status__in=["scheduled", "confirmed", "in_progress"],
    ).values_list("scheduled_start", flat=True)

    booked_times = [t.strftime("%H:%M") if hasattr(t, "strftime") else str(t)[:5] for t in booked]
    return [s for s in all_slots if s not in booked_times]


def _create_appointment_from_bot(chat_id: int | None, doctor_id: str, date_str: str, slot_time: str) -> dict[str, Any]:
    from apps.doctors.models import DoctorProfile
    from apps.patients.models import Patient
    from apps.scheduling.models import Appointment

    patient = Patient.objects.filter(telegram_chat_id=chat_id, is_active=True).first()
    if not patient:
        return {"status": "error", "message": "Bemor topilmadi."}

    try:
        doctor = DoctorProfile.objects.get(pk=doctor_id, is_active=True)
    except DoctorProfile.DoesNotExist:
        return {"status": "error", "message": "Shifokor topilmadi."}

    date_obj = datetime.datetime.strptime(date_str, "%Y-%m-%d").date()
    time_obj = datetime.datetime.strptime(slot_time, "%H:%M").time()
    
    start_dt = timezone.make_aware(datetime.datetime.combine(date_obj, time_obj))
    end_dt = start_dt + datetime.timedelta(minutes=45)

    app = Appointment.objects.create(
        patient=patient,
        doctor=doctor,
        department=doctor.department,
        scheduled_start=start_dt,
        scheduled_end=end_dt,
        status="scheduled",
        notes="Telegram Bot orqali yozildi",
    )
    doc_name = doctor.user.get_full_name() if doctor.user else "Shifokor"
    return {"status": "ok", "doctor_name": doc_name, "id": str(app.pk)}


def _update_appointment_status(appointment_id: str, new_status: str) -> bool:
    from apps.scheduling.models import Appointment

    try:
        app = Appointment.objects.get(pk=appointment_id)
        app.status = new_status
        app.save(update_fields=["status"])
        return True
    except Appointment.DoesNotExist:
        return False


def _get_patient_treatments_html(chat_id: int | None) -> str:
    from apps.patients.models import Patient
    from apps.telegram_bot.helpers import format_patient_treatments_list
    from apps.treatments.models import Treatment

    patient = Patient.objects.filter(telegram_chat_id=chat_id, is_active=True).first()
    if not patient:
        return "Bemor profilingiz topilmadi."

    treatments = (
        Treatment.objects.filter(patient=patient)
        .select_related("procedure_type", "doctor__user")
        .order_by("-created_at")[:15]
    )
    return format_patient_treatments_list(treatments)


def _get_patient_payments_html(chat_id: int | None) -> str:
    from apps.patients.models import Patient
    from apps.payments.models import Payment
    from apps.telegram_bot.helpers import format_patient_payments_list

    patient = Patient.objects.filter(telegram_chat_id=chat_id, is_active=True).first()
    if not patient:
        return "Bemor profilingiz topilmadi."

    payments = (
        Payment.objects.filter(treatment__patient=patient, is_active=True)
        .order_by("-created_at")[:15]
    )
    return format_patient_payments_list(payments)
