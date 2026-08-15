"""Helper functions for Telegram Bot — role resolution & HTML formatting.

Safe to import in any environment (handles missing dependencies gracefully).
"""
from __future__ import annotations

import logging
from typing import Any

from django.db.models import QuerySet
from django.utils import timezone

logger = logging.getLogger(__name__)


def get_chat_identity(chat_id: int | None) -> dict[str, Any]:
    """Return user/patient object and role for a given telegram ``chat_id``.

    Returns:
        dict with keys:
            - 'type': 'staff' | 'patient' | 'unlinked'
            - 'object': User | Patient | None
            - 'role': 'bosh_shifokor' | 'doctor' | 'administrator' | 'patient' | 'unlinked'
            - 'name': str
    """
    if not chat_id:
        return {"type": "unlinked", "object": None, "role": "unlinked", "name": "Mehmon"}

    from apps.accounts.models import User
    from apps.patients.models import Patient

    staff_user = User.objects.filter(telegram_chat_id=chat_id, is_active=True).first()
    if staff_user:
        return {
            "type": "staff",
            "object": staff_user,
            "role": staff_user.role,
            "name": staff_user.get_full_name() or staff_user.phone_number,
        }

    patient = Patient.objects.filter(telegram_chat_id=chat_id, is_active=True).first()
    if patient:
        return {
            "type": "patient",
            "object": patient,
            "role": "patient",
            "name": patient.full_name,
        }

    return {"type": "unlinked", "object": None, "role": "unlinked", "name": "Mehmon"}


def format_appointments_list(appointments: QuerySet | list[Any], title: str = "📅 Navbatlar Ro'yxati") -> str:
    """Format a list of Appointment objects into clean HTML for Telegram."""
    if not appointments:
        return f"<b>{title}</b>\n\nHozircha navbatlar mavjud emas. 📭"

    status_emojis = {
        "scheduled": "⏳ Rejalashtirilgan",
        "confirmed": "✅ Tasdiqlangan",
        "in_progress": "🩺 Jarayonda",
        "completed": "✔️ Yakunlangan",
        "cancelled": "❌ Bekor qilingan",
        "no_show": "⚠️ Kelmadi",
    }

    lines = [f"<b>{title}</b>\n"]
    for idx, app in enumerate(appointments, start=1):
        dt = getattr(app, "scheduled_start", None)
        start = dt.strftime("%H:%M") if dt and hasattr(dt, "strftime") else "-"
        date_str = dt.strftime("%d.%m.%Y") if dt and hasattr(dt, "strftime") else "-"
        
        doctor_name = app.doctor.user.get_full_name() if (app.doctor and getattr(app.doctor, "user", None)) else "Shifokor"
        patient_name = app.patient.full_name if app.patient else "Bemor"
        status_str = status_emojis.get(app.status, app.status)
        notes = f"\n   📝 <i>Izoh: {app.notes}</i>" if getattr(app, "notes", None) else ""

        lines.append(
            f"<b>{idx}. 🕒 {start}</b> ({date_str})\n"
            f"   👤 <b>Bemor:</b> {patient_name}\n"
            f"   👨‍⚕️ <b>Shifokor:</b> {doctor_name}\n"
            f"   📌 <b>Holat:</b> {status_str}"
            f"{notes}\n"
        )

    return "\n".join(lines)


def format_prescriptions_list(prescriptions: QuerySet | list[Any]) -> str:
    """Format patient prescriptions into clean HTML."""
    if not prescriptions:
        return "<b>💊 Retseptlaringiz</b>\n\nHozircha sizga retseptlar biriktirilmagan. 📭"

    lines = ["<b>💊 Retseptlaringiz Ro'yxati</b>\n"]
    for idx, presc in enumerate(prescriptions, start=1):
        created = presc.created_at.strftime("%d.%m.%Y") if hasattr(presc.created_at, "strftime") else str(presc.created_at)
        doc_name = presc.doctor.user.get_full_name() if (presc.doctor and presc.doctor.user) else "Shifokor"
        notes = f" (<i>{presc.notes}</i>)" if presc.notes else ""
        
        items_str = ""
        if hasattr(presc, "items") and presc.items.exists():
            item_lines = []
            for item in presc.items.all():
                item_lines.append(f"     • <b>{item.medication_name}</b> — {item.dosage} ({item.frequency})")
            items_str = "\n" + "\n".join(item_lines)

        lines.append(
            f"<b>{idx}. 📋 {created}</b> — {doc_name}{notes}{items_str}\n"
        )

    return "\n".join(lines)


def format_stock_report(materials: QuerySet | list[Any]) -> str:
    """Format inventory material stock levels for staff."""
    if not materials:
        return "<b>📦 Ombor Qoldig'i</b>\n\nOmborda materiallar topilmadi."

    lines = ["<b>📦 Ombor Qoldig'i Holati</b>\n"]
    low_stock_count = 0
    for mat in materials:
        qty = getattr(mat, "quantity_in_stock", getattr(mat, "quantity", 0))
        min_qty = getattr(mat, "minimum_threshold", getattr(mat, "min_quantity", 0)) or 0
        unit = mat.unit or "dona"
        
        if qty <= 0:
            badge = "🔴 TUGAGAN"
            low_stock_count += 1
        elif qty <= min_qty:
            badge = "⚠️ KAM QOLGAN"
            low_stock_count += 1
        else:
            badge = "🟢 YETARLI"

        lines.append(f"• <b>{mat.name}</b>: <code>{qty} {unit}</code> [{badge}]")

    lines.append(f"\nJami materiallar: <b>{len(materials)}</b> ta | Kam qolganlar: <b>{low_stock_count}</b> ta")
    return "\n".join(lines)


def format_daily_financial_summary(summary_data: dict[str, Any]) -> str:
    """Format financial breakdown for admin/bosh shifokor."""
    today_str = timezone.now().strftime("%d.%m.%Y")
    total_income = summary_data.get("total_income", 0)
    payments_count = summary_data.get("payments_count", 0)
    total_expense = summary_data.get("total_expense", 0)
    expenses_count = summary_data.get("expenses_count", 0)
    
    net_profit = total_income - total_expense

    return (
        f"<b>📊 Kunlik Moliya va Tushum Hisoboti</b>\n"
        f"Sana: <b>{today_str}</b>\n\n"
        f"💰 <b>Bugungi Jami Tushum:</b> <code>{total_income:,.0f} so'm</code>\n"
        f"💳 <b>Amalga Oshirilgan To'lovlar:</b> <b>{payments_count}</b> ta\n\n"
        f"📉 <b>Bugungi Jami Xarajatlar:</b> <code>{total_expense:,.0f} so'm</code>\n"
        f"🧾 <b>Kiritilgan Xarajatlar Soni:</b> <b>{expenses_count}</b> ta\n\n"
        f"💵 <b>Kunlik Sof Qoldiq (Foyda):</b> <code>{net_profit:,.0f} so'm</code>\n"
    )


def format_patient_treatments_list(treatments: QuerySet | list[Any]) -> str:
    """Format patient's treatment history and medical card into clean HTML."""
    if not treatments:
        return "<b>🦷 Muolajalaringiz Ro'yxati</b>\n\nHozircha sizda bajarilgan muolajalar topilmadi. 📭"

    lines = ["<b>🦷 Tibbiy Kartangiz va Muolajalarim</b>\n"]
    for idx, tr in enumerate(treatments, start=1):
        dt = getattr(tr, "created_at", None)
        date_str = dt.strftime("%d.%m.%Y") if dt and hasattr(dt, "strftime") else "-"
        proc_name = tr.procedure_type.name if (hasattr(tr, "procedure_type") and tr.procedure_type) else "Stomatologik muolaja"
        tooth_str = f" (Tish №: {tr.tooth_number})" if getattr(tr, "tooth_number", None) else ""
        doc_name = tr.doctor.user.get_full_name() if (tr.doctor and tr.doctor.user) else "Shifokor"
        price_str = f"{tr.price:,.0f}" if hasattr(tr, "price") else "0"

        lines.append(
            f"<b>{idx}. 🩺 {proc_name}{tooth_str}</b>\n"
            f"   📅 Sana: {date_str}\n"
            f"   👨‍⚕️ Shifokor: Dr. {doc_name}\n"
            f"   💰 Qiymati: <code>{price_str} so'm</code>\n"
        )

    return "\n".join(lines)


def format_patient_payments_list(payments: QuerySet | list[Any]) -> str:
    """Format patient's receipts and payments into clean HTML."""
    if not payments:
        return "<b>🧾 To'lovlar va Cheklarim</b>\n\nHozircha to'lovlar va cheklar tarixi mavjud emas. 📭"

    lines = ["<b>🧾 Barcha To'lovlar va Elektron Cheklaringiz</b>\n"]
    total_paid = 0
    for idx, pay in enumerate(payments, start=1):
        dt = getattr(pay, "created_at", None)
        date_str = dt.strftime("%d.%m.%Y %H:%M") if dt and hasattr(dt, "strftime") else "-"
        amt = getattr(pay, "amount", 0)
        total_paid += amt
        amt_str = f"{amt:,.0f}"
        method_str = getattr(pay, "payment_method", "Naqd")
        receipt_no = getattr(pay, "receipt_number", None) or f"CHK-{pay.pk}"

        lines.append(
            f"<b>{idx}. 🧾 Chek #{receipt_no}</b>\n"
            f"   📅 Sana: {date_str}\n"
            f"   💰 Summa: <code>{amt_str} so'm</code>\n"
            f"   💳 Usul: <i>{method_str}</i>\n"
        )

    lines.append(f"\n<b>Jami Amalga Oshirilgan To'lovlar:</b> <code>{total_paid:,.0f} so'm</code>")
    return "\n".join(lines)


__all__ = [
    "get_chat_identity",
    "format_appointments_list",
    "format_prescriptions_list",
    "format_stock_report",
    "format_daily_financial_summary",
    "format_patient_treatments_list",
    "format_patient_payments_list",
]
