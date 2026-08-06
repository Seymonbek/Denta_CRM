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
            "quantity_in_stock": str(item.quantity_in_stock),
            "minimum_threshold": str(item.minimum_threshold),
            "is_out_of_stock": item.quantity_in_stock <= 0,
        }
        low_stock_items.append(data)

    return {
        "total_materials_count": total_count,
        "low_stock_count": len(low_stock_items),
        "out_of_stock_count": out_of_stock_qs.count(),
        "low_stock_items": low_stock_items,
    }


def get_clinic_crm_context(user: Any) -> dict[str, Any]:
    """Gather role-aware CRM context for the AI prompt builder, honoring dynamic permissions."""
    from apps.core.permissions import ROLE_ADMINISTRATOR, ROLE_BOSH_SHIFOKOR, ROLE_DOCTOR
    from apps.patients.models import Patient
    from apps.scheduling.models import Appointment, AppointmentStatus
    from .models import AIPermissionConfig

    role = getattr(user, "role", None)
    today = timezone.localdate()

    # Determine dynamic permissions
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
    context: dict[str, Any] = {
        "user_name": getattr(user, "get_full_name", lambda: "Foydalanuvchi")(),
        "user_role": role,
        "inventory_analytics": inv,
        "date": str(today),
    }

    # Appointments summary
    today_appts = Appointment.objects.filter(scheduled_start__date=today)
    if role == ROLE_DOCTOR and not can_other_doctors:
        today_appts = today_appts.filter(doctor__user=user)

    context["today_appointments_count"] = today_appts.count()
    context["today_completed_count"] = today_appts.filter(
        status=AppointmentStatus.COMPLETED
    ).count()
    context["today_scheduled_count"] = today_appts.filter(
        status=AppointmentStatus.SCHEDULED
    ).count()

    # Patients count
    if can_all_patients or role == ROLE_BOSH_SHIFOKOR or role == ROLE_ADMINISTRATOR:
        context["total_patients_count"] = Patient.objects.filter(is_active=True).count()
    else:
        context["total_patients_count"] = "Faqat biriktirilgan bemorlar"

    # Financial summary
    if can_finance or role == ROLE_BOSH_SHIFOKOR:
        from apps.payments.models import Payment

        today_income = (
            Payment.objects.filter(
                is_active=True,
                created_at__date=today,
            ).aggregate(total=Sum("amount"))["total"]
            or Decimal("0.00")
        )
        context["today_income_sum"] = str(today_income)

    return context


def generate_ai_chat_response(query: str, user: Any) -> dict[str, Any]:
    """Generate an AI response using Google Gemini API or intelligent fallback."""
    crm_ctx = get_clinic_crm_context(user)
    api_key = (
        getattr(settings, "GEMINI_API_KEY", None)
        or os.getenv("GEMINI_API_KEY")
        or os.getenv("GOOGLE_API_KEY")
    )

    inv = crm_ctx["inventory_analytics"]
    low_stock_str = ", ".join(
        [f"{item['name']} ({item['quantity_in_stock']} {item['unit']})" for item in inv["low_stock_items"]]
    ) or "Mavjud emas (barcha materiallar yetarli)"

    system_instructions = (
        "Siz DentaCRM klinika boshqaruv tizimining aqlli AI assistantisiz. "
        "Foydalanuvchi savollariga aniq, xushmuomala va o'zbek tilida javob bering.\n"
        f"Joriy sana: {crm_ctx['date']}\n"
        f"Foydalanuvchi: {crm_ctx['user_name']} ({crm_ctx['user_role']})\n"
        f"Omborda kam qolgan materiallar ({inv['low_stock_count']} ta): {low_stock_str}\n"
        f"Bugungi navbatlar soni: {crm_ctx['today_appointments_count']} ta "
        f"(Yakunlangan: {crm_ctx['today_completed_count']}, Rejalashtirilgan: {crm_ctx['today_scheduled_count']})\n"
        f"Jami bemorlar soni: {crm_ctx['total_patients_count']}\n"
    )

    if api_key:
        try:
            from google import genai

            client = genai.Client(api_key=api_key)
            prompt = f"{system_instructions}\n\nFoydalanuvchi savoli: {query}"
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
            )
            if response and hasattr(response, "text") and response.text:
                return {
                    "answer": response.text.strip(),
                    "context_summary": crm_ctx,
                    "source": "gemini-ai",
                }
        except Exception as exc:
            logger.warning("Gemini AI API call failed, using fallback assistant: %s", exc)

    fallback_answer = _build_rule_based_fallback(query, crm_ctx)
    return {
        "answer": fallback_answer,
        "context_summary": crm_ctx,
        "source": "crm-smart-assistant",
    }


def _build_rule_based_fallback(query: str, ctx: dict[str, Any]) -> str:
    """Provide structured smart fallback responses based on CRM data."""
    q_lower = query.lower()
    inv = ctx["inventory_analytics"]

    if any(k in q_lower for k in ["ombor", "material", "zaxira", "kam", "tugagan", "stock"]):
        if inv["low_stock_count"] == 0:
            return (
                "Omborda barcha materiallar etarli miqdorda mavjud. "
                "Kam qolgan yoki tugagan materiallar aniqlanmadi."
            )
        items_desc = "\n".join(
            [
                f"• {item['name']}: {item['quantity_in_stock']} {item['unit']} (minimal: {item['minimum_threshold']})"
                for item in inv["low_stock_items"]
            ]
        )
        return (
            f"Omborda {inv['low_stock_count']} ta material minimal chegaradan kam qolgan:\n\n"
            f"{items_desc}\n\n"
            "Iltimos, ushbu materiallarni qayta to'ldirish uchun mas'ul xodimga xabar bering."
        )

    if any(k in q_lower for k in ["navbat", "bemor", "bemorlar", "bugun", "appointment"]):
        return (
            f"Bugun ({ctx['date']}) jami {ctx['today_appointments_count']} ta navbat bor.\n"
            f"• Yakunlangan: {ctx['today_completed_count']} ta\n"
            f"• Kutilayotgan: {ctx['today_scheduled_count']} ta\n"
            f"Tizimda bemorlar ma'lumoti: {ctx['total_patients_count']}."
        )

    if any(k in q_lower for k in ["moliya", "tushum", "puli", "daromad", "payment"]):
        income = ctx.get("today_income_sum")
        if income is None:
            return "Kechirasiz, sizda moliyaviy hisobotlarni ko'rish uchun ruxsat mavjud emas."
        return (
            f"Bugungi ({ctx['date']}) jami qabul qilingan to'lovlar summasi: {income} so'm."
        )

    return (
        f"Assalomu alaykum, {ctx['user_name']}! "
        f"Omborda {inv['low_stock_count']} ta material kam qolgan. "
        f"Bugun {ctx['today_appointments_count']} ta navbat rejalashtirilgan. "
        "Ombor, navbatlar yoki moliya bo'yicha batafsil ma'lumot olishingiz mumkin."
    )
