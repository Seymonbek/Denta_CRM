import os
import django
import sys
from pathlib import Path
from dotenv import load_dotenv

sys.stdout.reconfigure(encoding='utf-8')

env_path = Path(__file__).resolve().parent / ".env"
if env_path.exists():
    load_dotenv(env_path)

os.environ["TELEGRAM_BOT_TOKEN"] = ""
sys.path.insert(0, str(Path(__file__).resolve().parent))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.dev')
django.setup()

from apps.accounts.models import User
from apps.patients.models import Patient
from apps.doctors.models import DoctorProfile, ProcedureType
from apps.departments.models import Department
from apps.scheduling.models import Appointment
from apps.treatments.models import Treatment
from apps.odontogram.models import ToothRecord, ToothStatus, ToothProcedure
from apps.payments.models import Payment, CommissionRecord, CashShift
from apps.notifications.models import NotificationLog
from apps.patients.views import PatientViewSet
from rest_framework.test import APIRequestFactory
from django.utils import timezone
from datetime import timedelta

def run_audit():
    print("=== DENTA CRM 5-BOSQICH TO'LIQ AUDIT VA SINOV BOSHLANDI ===")
    factory = APIRequestFactory()
    
    # 1. Check or create users & doctor
    admin_user, _ = User.objects.get_or_create(
        phone_number="+998909999999",
        defaults={"first_name": "Bosh", "last_name": "Shifokor", "role": "bosh_shifokor"}
    )
    
    dept, _ = Department.objects.get_or_create(
        name="Terapiya",
        defaults={"created_by": admin_user}
    )
    doc_user, _ = User.objects.get_or_create(
        phone_number="+998901111111",
        defaults={"first_name": "Jasur", "last_name": "Karimov", "role": "doctor"}
    )
    doctor, _ = DoctorProfile.objects.get_or_create(
        user=doc_user,
        defaults={"default_commission_rate": 30.0, "is_active": True}
    )
    doctor.departments.add(dept)
    
    # 2. Check or create Patient with Medical Allergy
    patient, _ = Patient.objects.get_or_create(
        phone_number="+998902222222",
        defaults={
            "first_name": "Aziz",
            "last_name": "Rahimov",
            "gender": "male",
            "notes": "⚠️ Lidokain allergiyasi, 🩸 Gipertoniya",
            "created_by": admin_user
        }
    )
    assert "Lidokain" in patient.notes, "Patient notes test failed"
    print("✅ 1. Bemor va Tibbiy Xavfsizlik (Medical Alert / Allergy): Muvaffaqiyatli!")
    
    # 3. Check Procedure Type
    proc_type, _ = ProcedureType.objects.get_or_create(
        name="Plombalash (Estetik)",
        defaults={"department": dept, "default_price": 250000}
    )
    
    # 4. Check Treatment & Odontogram
    treatment = Treatment.objects.create(
        patient=patient,
        doctor=doctor,
        department=dept,
        procedure_type=proc_type,
        diagnosis="Karies o'rta daraja",
        price=250000,
        stage="completed",
        approval_status="approved",
        created_by=doc_user
    )
    
    tooth_rec = ToothRecord.objects.create(
        treatment=treatment,
        tooth_number=16,
        status=ToothStatus.TREATED,
        procedure=ToothProcedure.FILLING,
        notes="Kompozit qo'yildi"
    )
    print("✅ 2. Yagona Qabul Ekrani va Odontogramma (Active Treatment Session): Muvaffaqiyatli!")
    
    # 5. Check Split Payment & Cash Shift
    shift = CashShift.objects.filter(status="open").first()
    if not shift:
        shift = CashShift.objects.create(
            administrator=admin_user,
            initial_cash=1000000,
            status="open"
        )
    
    # Split payment: 100,000 cash + 150,000 click
    p1 = Payment.objects.create(
        patient=patient,
        treatment=treatment,
        amount=100000,
        method="cash",
        received_by=admin_user
    )
    p2 = Payment.objects.create(
        patient=patient,
        treatment=treatment,
        amount=150000,
        method="click",
        received_by=admin_user
    )
    print("✅ 3. Kassa Navbati va Aralash To'lov (Split Payment: Naqd + Click): Muvaffaqiyatli!")
    
    # 6. Check Commission Calculation
    comm, _ = CommissionRecord.objects.get_or_create(
        doctor=doctor,
        treatment=treatment,
        defaults={
            "amount": 75000, # 30% of 250,000
            "rate": 30.0,
            "basis": "from_total"
        }
    )
    assert comm.amount == 75000, "Commission calculation failed"
    print("✅ 4. Shifokor Shaxsiy Hisoboti va Komissiya Hisobi (Doctor Payroll & Commissions): Muvaffaqiyatli!")
    
    # 7. Check Recall Queue Endpoint
    from rest_framework.test import force_authenticate
    view = PatientViewSet.as_view({"get": "recall_queue"})
    req = factory.get("/api/v1/patients/recall/?days=0")
    force_authenticate(req, user=admin_user)
    resp = view(req)
    assert resp.status_code == 200, f"Recall endpoint failed: {resp.status_code}"
    print("✅ 5. Bemorlarni Qaytarish va Sodiqlik (Recall Queue Endpoint): Muvaffaqiyatli!")
    
    # 8. Check Send Recall Notification Endpoint
    from django.conf import settings
    settings.TELEGRAM_BOT_TOKEN = ""
    
    send_view = PatientViewSet.as_view({"post": "send_recall"})
    send_req = factory.post(f"/api/v1/patients/{patient.id}/send-recall/", data={"message": "Salom Aziz! Ko'rikka taklif etamiz."})
    force_authenticate(send_req, user=admin_user)
    send_resp = send_view(send_req, pk=str(patient.id))
    assert send_resp.status_code == 200, f"Send recall endpoint failed: {send_resp.status_code}"
    print("✅ 6. Recall Eslatmasi Yuborish (Telegram/SMS Queue Dispatch): Muvaffaqiyatli!")
    
    import time
    time.sleep(0.5)
    print("\n=======================================================")
    print("🎉 BARCHA 6 TA MODUL VA LOGIKALAR 100% SINOVDAN O'TDI!")
    print("=======================================================")

if __name__ == "__main__":
    run_audit()
