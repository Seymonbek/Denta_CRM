"""PDF and Printable HTML generation service for DentaCRM receipts and treatment acts."""
from __future__ import annotations

from decimal import Decimal
from typing import Any


def generate_payment_receipt_html(payment_data: dict[str, Any]) -> str:
    """Generate printable HTML for a payment receipt."""
    receipt_no = str(payment_data.get("id", ""))[:8].upper()
    amount = Decimal(str(payment_data.get("amount", "0.00")))
    payment_method = payment_data.get("payment_method", "cash")
    method_label = {
        "cash": "Naqd Pul",
        "card": "Terminal (Karta)",
        "payme": "Payme",
        "click": "Click",
        "bank_transfer": "Bank O'tkazmasi",
    }.get(payment_method, payment_method)

    patient_name = payment_data.get("patient_name", "Bemor")
    patient_phone = payment_data.get("patient_phone", "-")
    doctor_name = payment_data.get("doctor_name", "Shifokor")
    date_str = payment_data.get("paid_at", payment_data.get("created_at", ""))[:19].replace("T", " ")
    treatment_procedure = payment_data.get("treatment_procedure")
    treatment_diagnosis = payment_data.get("treatment_diagnosis")
    treatment_description = payment_data.get("treatment_description")
    treatment_price = payment_data.get("treatment_price")
    tooth_records = payment_data.get("tooth_records", []) or []

    treatment_html = ""
    if treatment_procedure or tooth_records:
        rows_html = ""
        if tooth_records:
            rows_html = "\n".join(
                f"""                <tr>
                    <td style="text-align: center;"><strong>{r.get('tooth_number', '-')}</strong></td>
                    <td>{r.get('procedure', '-')}</td>
                    <td>{r.get('status', '-')}</td>
                    <td>{r.get('notes', '') or '-'}</td>
                </tr>"""
                for r in tooth_records
            )
        diagnosis_line = f"<strong style='display: block; color: #0f172a;'>Tashxis:</strong> <span>{treatment_diagnosis}</span>" if treatment_diagnosis else ""
        description_line = f"<strong style='display: block; color: #0f172a; margin-top: 6px;'>Tavsif:</strong> <span>{treatment_description}</span>" if treatment_description else ""
        treatment_html = f"""
        <div style="border-top: 1px dashed #e2e8f0; padding-top: 14px; margin-bottom: 16px;">
            <strong style="display: block; color: #0f172a; font-size: 13px; margin-bottom: 8px;">Bajarilgan Muolaja: {treatment_procedure}</strong>
            {diagnosis_line}
            {description_line}
            {f"""
            <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px;">
                <thead>
                    <tr>
                        <th style="border: 1px solid #e2e8f0; padding: 8px; background: #f8fafc; text-align: center;">Tish №</th>
                        <th style="border: 1px solid #e2e8f0; padding: 8px; background: #f8fafc; text-align: left;">Muolaja</th>
                        <th style="border: 1px solid #e2e8f0; padding: 8px; background: #f8fafc; text-align: left;">Holat</th>
                        <th style="border: 1px solid #e2e8f0; padding: 8px; background: #f8fafc; text-align: left;">Izoh</th>
                    </tr>
                </thead>
                <tbody>
{rows_html}
                </tbody>
            </table>""" if rows_html else ""}
        </div>"""
    elif treatment_price is not None:
        treatment_html = f"""
        <div style="border-top: 1px dashed #e2e8f0; padding-top: 14px; margin-bottom: 16px; font-size: 13px;">
            <strong style="display: block; color: #0f172a;">Bajarilgan Muolaja: {treatment_procedure}</strong>
            <span style="color: #334155;">{treatment_diagnosis or ''}</span>
        </div>"""

    return f"""<!DOCTYPE html>
<html lang="uz">
<head>
    <meta charset="UTF-8">
    <title>To'lov Cheki #{receipt_no}</title>
    <style>
        body {{
            font-family: 'Segoe UI', Arial, sans-serif;
            margin: 0;
            padding: 20px;
            color: #1e293b;
            background: #fff;
        }}
        .receipt-card {{
            max-width: 480px;
            margin: 0 auto;
            border: 1px solid #cbd5e1;
            border-radius: 12px;
            padding: 24px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.05);
        }}
        .header {{
            text-align: center;
            border-bottom: 2px dashed #e2e8f0;
            padding-bottom: 16px;
            margin-bottom: 16px;
        }}
        .header h1 {{
            margin: 0;
            font-size: 20px;
            color: #0f172a;
        }}
        .header p {{
            margin: 4px 0 0;
            font-size: 12px;
            color: #64748b;
        }}
        .details {{
            font-size: 13px;
            line-height: 1.6;
            margin-bottom: 16px;
        }}
        .details-row {{
            display: flex;
            justify-content: space-between;
            margin-bottom: 6px;
        }}
        .amount-box {{
            background: #f1f5f9;
            border-radius: 8px;
            padding: 12px;
            text-align: center;
            margin-bottom: 20px;
        }}
        .amount-box .label {{
            font-size: 11px;
            color: #64748b;
            text-transform: uppercase;
        }}
        .amount-box .value {{
            font-size: 22px;
            font-weight: bold;
            color: #059669;
        }}
        .footer {{
            border-top: 1px solid #e2e8f0;
            padding-top: 16px;
            text-align: center;
            font-size: 11px;
            color: #94a3b8;
        }}
        @media print {{
            body {{ padding: 0; }}
            .receipt-card {{ border: none; box-shadow: none; width: 100%; }}
        }}
    </style>
</head>
<body>
    <div class="receipt-card">
        <div class="header">
            <h1>🦷 DentaCRM Stomatologiya</h1>
            <p>Rasmiy To'lov Kvitansiyasi / Chek</p>
        </div>
        <div class="details">
            <div class="details-row"><strong>Chek №:</strong> <span>#{receipt_no}</span></div>
            <div class="details-row"><strong>Sana:</strong> <span>{date_str}</span></div>
            <div class="details-row"><strong>Bemor:</strong> <span>{patient_name}</span></div>
            <div class="details-row"><strong>Telefon:</strong> <span>{patient_phone}</span></div>
            <div class="details-row"><strong>Shifokor:</strong> <span>{doctor_name}</span></div>
            <div class="details-row"><strong>To'lov shakli:</strong> <span>{method_label}</span></div>
        </div>
        {treatment_html}
        <div class="amount-box">
            <div class="label">Qabul Qilingan Summa</div>
            <div class="value">{amount:,.2f} so'm</div>
        </div>
        <div class="footer">
            <p>Xaridingiz uchun rahmat! Salomat bo'ling! ✨</p>
            <p>DentaCRM Avtomatlashtirilgan Tizimi</p>
        </div>
    </div>
</body>
</html>"""


def generate_treatment_act_html(treatment_data: dict[str, Any]) -> str:
    """Generate printable HTML for a treatment act summary."""
    act_no = str(treatment_data.get("id", ""))[:8].upper()
    patient_name = treatment_data.get("patient_name", "Bemor")
    doctor_name = treatment_data.get("doctor_name", "Shifokor")
    procedure_name = treatment_data.get("procedure_name", "Muolaja")
    price = Decimal(str(treatment_data.get("price", "0.00")))
    diagnosis = treatment_data.get("diagnosis", "-")
    description = treatment_data.get("description", "")
    tooth_number = treatment_data.get("tooth_number", "-")
    notes = treatment_data.get("notes", "Muolaja muvaffaqiyatli yakunlandi.")
    tooth_records = treatment_data.get("tooth_records", []) or []
    date_str = treatment_data.get("created_at", "")[:19].replace("T", " ")

    if tooth_records:
        rows_html = "\n".join(
            f"""                <tr>
                    <td style="text-align: center;"><strong>{r.get('tooth_number', '-')}</strong></td>
                    <td>{r.get('procedure', '-')}</td>
                    <td>{r.get('status', '-')}</td>
                    <td>{r.get('notes', '') or '-'}</td>
                </tr>"""
            for r in tooth_records
        )
        table_html = f"""
        <table>
            <thead>
                <tr>
                    <th style="text-align: center; width: 70px;">Tish №</th>
                    <th>Bajarilgan Muolaja</th>
                    <th>Holati</th>
                    <th>Izoh</th>
                </tr>
            </thead>
            <tbody>
{rows_html}
            </tbody>
        </table>"""
    else:
        table_html = f"""
        <table>
            <thead>
                <tr>
                    <th>Bajarilgan Muolaja Nomi</th>
                    <th style="text-align: center;">Tish №</th>
                    <th style="text-align: right;">Qiymati</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td><strong>{procedure_name}</strong><br><small style="color: #64748b;">{notes}</small></td>
                    <td style="text-align: center;"><strong>{tooth_number}</strong></td>
                    <td style="text-align: right;"><strong>{price:,.2f} so'm</strong></td>
                </tr>
            </tbody>
        </table>"""

    diagnosis_html = (
        f"""
        <div class="info-item">
            <strong>TASHXIS</strong>
            <span>{diagnosis}</span>
        </div>"""
        if diagnosis != "-"
        else ""
    )

    description_html = (
        f"""
        <div style="margin-bottom: 24px; font-size: 13px; color: #334155; background: #f8fafc; border-radius: 8px; padding: 10px 14px;">
            <strong style="color: #475569; display: block; font-size: 11px; margin-bottom: 2px;">DAVOLASH TAVSIFI</strong>
            {description}
        </div>"""
        if description
        else ""
    )

    return f"""<!DOCTYPE html>
<html lang="uz">
<head>
    <meta charset="UTF-8">
    <title>Davolash Dalolatnomasi #{act_no}</title>
    <style>
        body {{
            font-family: 'Segoe UI', Arial, sans-serif;
            margin: 0;
            padding: 30px;
            color: #0f172a;
            background: #fff;
        }}
        .container {{
            max-width: 680px;
            margin: 0 auto;
            border: 1px solid #cbd5e1;
            border-radius: 12px;
            padding: 32px;
        }}
        .header {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #0284c7;
            padding-bottom: 16px;
            margin-bottom: 24px;
        }}
        .header h1 {{
            margin: 0;
            font-size: 22px;
            color: #0284c7;
        }}
        .info-grid {{
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
            margin-bottom: 24px;
            font-size: 13px;
        }}
        .info-item {{
            background: #f8fafc;
            padding: 10px 14px;
            border-radius: 8px;
        }}
        .info-item strong {{ color: #475569; display: block; font-size: 11px; margin-bottom: 2px; }}
        table {{
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 24px;
            font-size: 13px;
        }}
        th, td {{
            padding: 12px;
            border: 1px solid #e2e8f0;
            text-align: left;
        }}
        th {{ background: #f1f5f9; font-weight: 600; color: #334155; }}
        .signatures {{
            display: flex;
            justify-content: space-between;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e2e8f0;
            font-size: 12px;
        }}
        .signature-block {{
            text-align: center;
            width: 200px;
        }}
        .signature-line {{
            border-bottom: 1px solid #94a3b8;
            margin-top: 40px;
            margin-bottom: 4px;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div>
                <h1>🦷 DentaCRM Stomatologiya</h1>
                <span style="font-size: 12px; color: #64748b;">Davolash Muolajasi Dalolatnomasi</span>
            </div>
            <div style="text-align: right; font-size: 12px; color: #64748b;">
                <strong>№:</strong> #{act_no}<br>
                <strong>Sana:</strong> {date_str}
            </div>
        </div>

        <div class="info-grid">
            <div class="info-item">
                <strong>BEMOR MA'LUMOTLARI</strong>
                <span>{patient_name}</span>
            </div>
            <div class="info-item">
                <strong>SHIFOKOR</strong>
                <span>{doctor_name}</span>
            </div>
            {diagnosis_html}
        </div>

        {description_html}

        {table_html}

        <div style="margin-bottom: 24px; font-size: 13px; color: #334155;">
            <strong>Umumiy qiymati:</strong> <span style="font-weight: 600;">{price:,.2f} so'm</span>
        </div>

        <div class="signatures">
            <div class="signature-block">
                <div class="signature-line"></div>
                <strong>Shifokor Imzosi</strong>
            </div>
            <div class="signature-block">
                <div class="signature-line"></div>
                <strong>Bemor Imzosi</strong>
            </div>
        </div>
    </div>
</body>
</html>"""
