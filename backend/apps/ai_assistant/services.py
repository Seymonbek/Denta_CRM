"""Services for AI Assistant, Dynamic RBAC Context, and CRM Intelligence.

Provides real-time database context extraction (ombor zaxirasi, navbatlar,
moliya va klinik tahlil) and AI language model response generation in Uzbek,
scoped according to Bosh Shifokor's dynamic permission settings.
"""
from __future__ import annotations

import logging
import os
from decimal import Decimal
from typing import Any

from django.conf import settings
from django.db.models import F, Sum
from django.utils import timezone

logger = logging.getLogger(__name__)


def get_inventory_analytics(include_costs: bool = False) -> dict[str, Any]:
    """Extract real-time inventory statistics and low-stock alerts."""
    from apps.inventory.models import Material

    all_materials = Material.objects.filter(is_active=True)
    total_count = all_materials.count()

    low_stock_qs = all_materials.filter(
        quantity_in_stock__lte=F("minimum_threshold")
    )
    out_of_stock_qs = all_materials.filter(quantity_in_stock__lte=0)

    low_stock_items = []
    for item in low_stock_qs:
        data = {
            "id": str(item.pk),
            "name": item.name,
            "unit": item.unit,
            "quantityInStock": str(item.quantity_in_stock),
            "minimumThreshold": str(item.minimum_threshold),
            "quantity_in_stock": str(item.quantity_in_stock),
            "minimum_threshold": str(item.minimum_threshold),
            "is_out_of_stock": item.quantity_in_stock <= 0,
        }
        low_stock_items.append(data)

    if low_stock_items:
        items_str = ", ".join([f"{i['name']} ({i['quantityInStock']} {i['unit']})" for i in low_stock_items])
        ai_recommendation = (
            f"Diqqat! Omborda {len(low_stock_items)} ta kritik sarflash materiali minimal chegaradan kam qolgan: "
            f"{items_str}. Klinika uzluksiz ishlashi uchun ushbu materiallarni zudlik bilan qayta to'ldirish tavsiya etiladi."
        )
    else:
        ai_recommendation = "Barcha zaxira materiallari yetarli darajada. Sklad holati a'lo!"

    return {
        "total_materials_count": total_count,
        "low_stock_count": len(low_stock_items),
        "out_of_stock_count": out_of_stock_qs.count(),
        "low_stock_items": low_stock_items,
        "ai_recommendation": ai_recommendation,
    }


def search_specific_entity_data(query: str) -> str:
    """Dynamically search CRM database for matching Patients, Doctors, or Treatments."""
    from django.db.models import Q
    from apps.patients.models import Patient
    from apps.scheduling.models import Appointment
    from apps.treatments.models import Treatment
    from apps.payments.models import Payment

    ignore_words = {
        "menga", "bemor", "bemorlar", "haqida", "malumot", "ma'lumot", "ber", "kartasi",
        "karta", "davolanish", "tarixi", "va", "telefon", "raqami", "qabuli",
        "tashxis", "to'lov", "shifokor", "doktor", "muolaja", "to'liq", "bir",
        "tizim", "hamma", "barcha", "nechta", "qachon"
    }
    words = [
        w.strip() for w in query.split()
        if len(w.strip()) >= 2 and w.strip().lower() not in ignore_words
    ]
    if not words:
        return ""

    # Priority 1: Try strict AND match if 2+ query words provided (e.g. "Bobur Ahmedov")
    patients = Patient.objects.none()
    if len(words) >= 2:
        q_and = Q()
        for w in words:
            q_and &= (Q(first_name__icontains=w) | Q(last_name__icontains=w) | Q(phone_number__icontains=w))
        patients = Patient.objects.filter(q_and, is_active=True)[:5]

    # Priority 2: Fallback to OR match only if strict AND match returned no results
    if not patients.exists():
        q_or = Q()
        for w in words:
            q_or |= Q(first_name__icontains=w) | Q(last_name__icontains=w) | Q(phone_number__icontains=w)
        patients = Patient.objects.filter(q_or, is_active=True)[:5]

    if not patients.exists():
        return ""

    results = []
    for p in patients:
        appts = Appointment.objects.filter(patient=p).order_by("-scheduled_start")[:5]
        treatments = Treatment.objects.filter(patient=p).order_by("-created_at")[:5]
        payments = Payment.objects.filter(patient=p, is_active=True).order_by("-created_at")[:5]

        appt_list = []
        for a in appts:
            doc_name = a.doctor.user.get_full_name() if a.doctor and a.doctor.user else "Shifokor"
            dt_str = a.scheduled_start.strftime("%Y-%m-%d %H:%M")
            appt_list.append(f"  • {dt_str} | Shifokor: {doc_name} | Holati: {a.status}")

        treat_list = []
        for t in treatments:
            doc_name = t.doctor.user.get_full_name() if t.doctor and t.doctor.user else "Shifokor"
            proc_name = t.procedure_type.name if t.procedure_type else "Muolaja"
            treat_list.append(f"  • {proc_name} | Narxi: {t.price} so'm | To'lov: {t.payment_status} | Shifokor: {doc_name}")

        pay_list = []
        for pay in payments:
            dt_str = pay.created_at.strftime("%Y-%m-%d")
            pay_list.append(f"  • {pay.amount} so'm ({dt_str})")

        p_details = (
            f"=== BEMOR MA'LUMOTLARI: {p.first_name} {p.last_name} ===\n"
            f"• Telefon: {p.phone_number}\n"
            f"• Manzil: {p.address or 'Kiritilmagan'}\n"
            f"• Tibbiy anamnez / Izoh: {p.notes or 'Yoq'}\n"
            f"• Qabullar/Navbatlar ({len(appts)} ta):\n" + ("\n".join(appt_list) if appt_list else "  • Qabullar yo'q") + "\n"
            f"• Davolash tarixi/Muolajalar ({len(treatments)} ta):\n" + ("\n".join(treat_list) if treat_list else "  • Muolajalar yo'q") + "\n"
            f"• To'lovlar ({len(payments)} ta):\n" + ("\n".join(pay_list) if pay_list else "  • To'lovlar yo'q")
        )
        results.append(p_details)

    return "\n\n".join(results)


# Module-level singleton for GenAI client reuse
_genai_client_instance: Any = None
_genai_client_key: str | None = None


def get_genai_client(api_key: str) -> Any:
    """Return a reusable GenAI client instance to eliminate SSL handshake overhead."""
    global _genai_client_instance, _genai_client_key
    if _genai_client_instance is not None and _genai_client_key == api_key:
        return _genai_client_instance

    try:
        from google import genai
        _genai_client_instance = genai.Client(api_key=api_key)
        _genai_client_key = api_key
        return _genai_client_instance
    except Exception as err:
        logger.warning("Could not initialize google.genai client: %s", err)
        return None


def get_clinic_crm_context(user: Any, query: str = "") -> dict[str, Any]:
    """Gather role-aware CRM context for the AI prompt builder, honoring dynamic permissions with caching."""
    from django.core.cache import cache
    from apps.core.permissions import ROLE_ADMINISTRATOR, ROLE_BOSH_SHIFOKOR, ROLE_DOCTOR
    from apps.patients.models import Patient
    from apps.scheduling.models import Appointment, AppointmentStatus
    from .models import AIPermissionConfig

    role = getattr(user, "role", None)
    today = timezone.localdate()
    cache_key = f"ai_crm_context_{user.pk}_{today}"

    cached_base = cache.get(cache_key)
    if not cached_base:
        can_costs = True
        can_finance = True
        can_other_doctors = True
        can_all_patients = True

        if role != ROLE_BOSH_SHIFOKOR:
            perm_cfg = AIPermissionConfig.objects.filter(role=role).first()
            if perm_cfg:
                can_costs = perm_cfg.can_view_inventory_costs
                can_finance = perm_cfg.can_view_financial_reports
                can_other_doctors = perm_cfg.can_view_other_doctors_stats
                can_all_patients = perm_cfg.can_view_all_patients
            else:
                can_costs = False
                can_finance = False
                can_other_doctors = False
                can_all_patients = False

        inv = get_inventory_analytics(include_costs=can_costs)
        today_appts = Appointment.objects.filter(scheduled_start__date=today)
        if role == ROLE_DOCTOR and not can_other_doctors:
            today_appts = today_appts.filter(doctor__user=user)

        appts_count = today_appts.count()
        completed_count = today_appts.filter(status=AppointmentStatus.COMPLETED).count()
        scheduled_count = today_appts.filter(status=AppointmentStatus.SCHEDULED).count()

        if can_all_patients or role == ROLE_BOSH_SHIFOKOR or role == ROLE_ADMINISTRATOR:
            patients_count = Patient.objects.filter(is_active=True).count()
        else:
            patients_count = "Faqat biriktirilgan bemorlar"

        today_income_sum = None
        if can_finance or role == ROLE_BOSH_SHIFOKOR:
            from apps.payments.models import Payment
            today_income = (
                Payment.objects.filter(
                    is_active=True,
                    created_at__date=today,
                ).aggregate(total=Sum("amount"))["total"]
                or Decimal("0.00")
            )
            today_income_sum = str(today_income)

        cached_base = {
            "user_name": getattr(user, "get_full_name", lambda: "Foydalanuvchi")(),
            "user_role": role,
            "inventory_analytics": inv,
            "date": str(today),
            "today_appointments_count": appts_count,
            "today_completed_count": completed_count,
            "today_scheduled_count": scheduled_count,
            "total_patients_count": patients_count,
            "today_income_sum": today_income_sum,
            "can_all_patients": can_all_patients,
        }
        cache.set(cache_key, cached_base, timeout=10)

    context = dict(cached_base)
    # Dynamic patient lookup if query asks about specific persons
    if query and (context.get("can_all_patients") or role in [ROLE_BOSH_SHIFOKOR, ROLE_ADMINISTRATOR]):
        context["patient_records_search"] = search_specific_entity_data(query)

    return context


def generate_ai_chat_response(query: str, user: Any) -> dict[str, Any]:
    """Generate an AI response using Google Gemini API or intelligent fallback."""
    try:
        import dotenv
        dotenv.load_dotenv(override=True)
    except Exception:
        pass

    crm_ctx = get_clinic_crm_context(user, query=query)
    api_key = (
        getattr(settings, "GEMINI_API_KEY", None)
        or os.getenv("GEMINI_API_KEY")
        or os.getenv("GOOGLE_API_KEY")
    )

    inv = crm_ctx["inventory_analytics"]
    low_stock_str = ", ".join(
        [f"{item['name']} ({item['quantity_in_stock']} {item['unit']})" for item in inv["low_stock_items"]]
    ) or "Mavjud emas (barcha materiallar yetarli)"

    patient_records_str = crm_ctx.get("patient_records_search", "")
    patient_records_instruction = (
        f"\nQIDIRILGAN BEMOR MA'LUMOTLARI:\n{patient_records_str}\n"
        if patient_records_str else ""
    )

    from apps.doctors.models import DoctorProfile
    doctors = DoctorProfile.objects.filter(is_active=True)[:10]
    doctors_str_list = []
    for d in doctors:
        d_name = d.user.get_full_name() if d.user else "Shifokor"
        d_spec = d.specialization or "Stomatolog"
        doctors_str_list.append(f"👨‍⚕️ {d_name} ({d_spec})")
    doctors_summary_str = ", ".join(doctors_str_list) if doctors_str_list else "Shifokorlar ro'yxati kiritilmagan"

    system_instructions = (
        "Siz DentaCRM klinika boshqaruv tizimining aqlli AI assistantisiz. "
        "Foydalanuvchi Bosh Shifokor yoki xodim hisoblanadi.\n"
        "Foydalanuvchi so'ragan bemor va shifokor ma'lumotlari mavjud bo'lsa, ularni aniq, to'liq taqdim eting.\n"
        f"Joriy sana: {crm_ctx['date']}\n"
        f"Foydalanuvchi: {crm_ctx['user_name']} ({crm_ctx['user_role']})\n"
        f"Klinika Shifokorlari Ro'yxati ({len(doctors_str_list)} ta): {doctors_summary_str}\n"
        f"Omborda kam qolgan materiallar ({inv['low_stock_count']} ta): {low_stock_str}\n"
        f"Bugungi navbatlar soni: {crm_ctx['today_appointments_count']} ta "
        f"(Yakunlangan: {crm_ctx['today_completed_count']}, Rejalashtirilgan: {crm_ctx['today_scheduled_count']})\n"
        f"Jami bemorlar soni: {crm_ctx['total_patients_count']}\n"
        f"{patient_records_instruction}"
    )

    if api_key:
        client = get_genai_client(api_key)
        if client:
            prompt = f"{system_instructions}\n\nFoydalanuvchi savoli: {query}"
            from google.genai import types
            import concurrent.futures

            # Try fastest models with strict 3-second timeout protection
            for model_name in ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"]:
                try:
                    def _call_model():
                        return client.models.generate_content(
                            model=model_name,
                            contents=prompt,
                            config=types.GenerateContentConfig(
                                max_output_tokens=1024,
                                temperature=0.3,
                            ),
                        )

                    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                        future = executor.submit(_call_model)
                        response = future.result(timeout=3.0)

                    if response and hasattr(response, "text") and response.text:
                        return {
                            "answer": response.text.strip(),
                            "context_summary": crm_ctx,
                            "source": "gemini-ai",
                        }
                except Exception as m_exc:
                    logger.debug("Model %s call failed or timed out: %s", model_name, m_exc)
                    continue

    fallback_answer = _build_rule_based_fallback(query, crm_ctx)
    return {
        "answer": fallback_answer,
        "context_summary": crm_ctx,
        "source": "crm-smart-assistant",
    }


def _build_rule_based_fallback(query: str, ctx: dict[str, Any]) -> str:
    """Provide structured, rich, and accurate responses directly from CRM DB."""
    q_lower = query.lower()
    inv = ctx["inventory_analytics"]

    # 1. Doctor / Shifokorlar query
    if any(k in q_lower for k in ["doktor", "shifokor", "vrach", "mutaxassis", "doctor"]):
        from apps.doctors.models import DoctorProfile
        from apps.scheduling.models import Appointment

        today = timezone.localdate()
        doctors = DoctorProfile.objects.filter(is_active=True).select_related("user").prefetch_related("departments")
        if not doctors.exists():
            return "Hozirda klinikada faol shifokorlar topilmadi."

        doc_lines = []
        for d in doctors:
            name = d.user.get_full_name() or d.user.phone_number if d.user else "Shifokor"
            phone = d.user.phone_number if d.user else "-"
            dept_names = ", ".join([dept.name for dept in d.departments.all()]) or "Umumiy"
            appts_count = Appointment.objects.filter(doctor=d, scheduled_start__date=today, is_active=True).count()
            doc_lines.append(
                f"👨‍⚕️ <b>{name}</b> ({d.specialization or 'Stomatolog'})\n"
                f"   • Bo'lim: {dept_names}\n"
                f"   • Telefon: {phone}\n"
                f"   • Bugungi qabullar: <b>{appts_count}</b> ta"
            )

        return (
            f"<b>📋 Klinika Shifokorlari Ro'yxati (Jami: {len(doctors)} ta):</b>\n\n"
            + "\n\n".join(doc_lines)
        )

    # 2. Greeting / Salomlashuv
    if any(k in q_lower for k in ["salom", "assalom", "privet", "hello", "hi"]):
        return (
            f"Assalomu alaykum, <b>{ctx['user_name']}</b>! DentaCRM AI Yordamchisiga xush kelibsiz. 😊\n\n"
            f"📊 <b>Klinika Bugungi Qisqacha Holati:</b>\n"
            f"• Bugungi navbatlar: <b>{ctx['today_appointments_count']}</b> ta\n"
            f"• Omborda kam qolgan materiallar: <b>{inv['low_stock_count']}</b> ta\n"
            f"• Jami bemorlar: <b>{ctx['total_patients_count']}</b> ta\n\n"
            f"Quyidagi mavzulardan biri bo'yicha savol berishingiz mumkin:\n"
            f"1. 👨‍⚕️ <i>'Shifokorlar haqida ma'lumot ber'</i>\n"
            f"2. 📦 <i>'Ombor qoldig'i qanday?'</i>\n"
            f"3. 👤 <i>'Bemor [Ism] haqida ma'lumot'</i>\n"
            f"4. 💰 <i>'Bugungi kassa tushumi'</i>"
        )

    # 3. Patient specific DB search or general patient info
    patient_data = ctx.get("patient_records_search")
    if patient_data:
        return f"<b>🔎 Ma'lumotlar bazasidan topilgan bemor ma'lumoti:</b>\n\n{patient_data}"

    if any(k in q_lower for k in ["bemor", "bemorlar", "patient"]):
        from apps.patients.models import Patient
        recent_patients = Patient.objects.filter(is_active=True).order_by("-created_at")[:5]
        p_lines = [f"• <b>{p.first_name} {p.last_name}</b> ({p.phone_number})" for p in recent_patients]
        return (
            f"<b>📋 Bemorlar Ro'yxati (Jami: {ctx['total_patients_count']}):</b>\n\n"
            f"Bugun va so'nggi ro'yxatdan o'tgan bemorlar:\n"
            + "\n".join(p_lines) + "\n\n"
            f"<i>Muayyan bemor ma'lumotlarini olish uchun ism-sharifini yozing (masalan: 'Ali Valiyev').</i>"
        )

    # 4. Inventory / Ombor query
    if any(k in q_lower for k in ["ombor", "material", "zaxira", "kam", "tugagan", "stock"]):
        if inv["low_stock_count"] == 0:
            return "📦 Omborda barcha materiallar yetarli miqdorda mavjud. Sklad holati a'lo!"
        items_desc = "\n".join(
            [
                f"• <b>{item['name']}</b>: <code>{item['quantity_in_stock']} {item['unit']}</code> (minimal: {item['minimum_threshold']})"
                for item in inv["low_stock_items"]
            ]
        )
        return (
            f"<b>📦 Omborda {inv['low_stock_count']} ta material kam qolgan:</b>\n\n"
            f"{items_desc}\n\n"
            "<i>Iltimos, ushbu materiallarni to'ldirish uchun mas'ul xodimga xabar bering.</i>"
        )

    # 5. Appointments / Navbatlar query
    if any(k in q_lower for k in ["navbat", "qabul", "bugun", "appointment"]):
        return (
            f"<b>📅 Bugungi Navbatlar Statistikasi ({ctx['date']}):</b>\n\n"
            f"• Jami navbatlar: <b>{ctx['today_appointments_count']}</b> ta\n"
            f"• Yakunlangan: <b>{ctx['today_completed_count']}</b> ta\n"
            f"• Rejalashtirilgan: <b>{ctx['today_scheduled_count']}</b> ta"
        )

    # 6. Finance / Moliya query
    if any(k in q_lower for k in ["moliya", "tushum", "puli", "daromad", "payment", "kassa"]):
        income = ctx.get("today_income_sum")
        if income is None:
            return "⚠️ Kechirasiz, sizda moliyaviy hisobotlarni ko'rish uchun ruxsat mavjud emas."
        return f"<b>💰 Bugungi ({ctx['date']}) Jami Tushum:</b> <code>{income} so'm</code>"

    # Default fallback — try entity search or structured summary
    entity_result = search_specific_entity_data(query)
    if entity_result:
        return f"<b>🔎 Qidiruv bo'yicha topilgan ma'lumot:</b>\n\n{entity_result}"

    return (
        f"Assalomu alaykum, <b>{ctx['user_name']}</b>!\n\n"
        f"Savolingiz bo'yicha aniq ma'lumot topilmadi. Siz quyidagi mavzular bo'yicha so'rashingiz mumkin:\n"
        f"• <b>Shifokorlar:</b> <i>'Klinika shifokorlari haqida ma'lumot'</i>\n"
        f"• <b>Ombor:</b> <i>'Omborda nimalar kam qoldi?'</i>\n"
        f"• <b>Bemor:</b> <i>'Bemor Ism Sharif haqida'</i>\n"
        f"• <b>Navbatlar:</b> <i>'Bugungi navbatlar statistikasi'</i>"
    )
