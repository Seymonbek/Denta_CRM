from django.core.management.base import BaseCommand
from decimal import Decimal
from django.utils import timezone
from django.contrib.auth import get_user_model
from apps.patients.models import Patient
from apps.doctors.models import DoctorProfile
from apps.departments.models import Department
from apps.treatments.models import Treatment, PaymentStatus, TreatmentStage
from apps.payments.models import CommissionRecord
from apps.payments.services import record_payment
from apps.reports.selectors import dashboard_payload

User = get_user_model()

class Command(BaseCommand):
    def handle(self, *args, **options):
        self.stdout.write("--- Starting Financial Flow Test ---")
        
        user, _ = User.objects.get_or_create(phone_number="+998900000001", defaults={"first_name": "Test Admin", "role": "admin"})
        doctor_user, _ = User.objects.get_or_create(phone_number="+998900000002", defaults={"first_name": "Test Doc", "role": "doctor"})
        department, _ = Department.objects.get_or_create(name="Therapy")
        
        doctor_profile, _ = DoctorProfile.objects.get_or_create(user=doctor_user, defaults={"default_commission_rate": Decimal("30.00")})
        doctor_profile.departments.add(department)
        
        patient, _ = Patient.objects.get_or_create(first_name="John", last_name="Doe", phone_number="+998901234567")
        
        treatment = Treatment.objects.create(
            patient=patient,
            doctor=doctor_profile,
            department=department,
            price=Decimal("150000.00"),
            stage=TreatmentStage.COMPLETED,
            payment_status=PaymentStatus.UNPAID,
            created_by=doctor_user
        )
        self.stdout.write(f"Treatment Created: ID={treatment.id}, Price={treatment.price}")
        
        self.stdout.write("Recording payment...")
        payment = record_payment(
            treatment=treatment,
            amount=Decimal("150000.00"),
            method="cash",
            received_by=user
        )
        self.stdout.write(f"Payment Recorded: ID={payment.id}, Amount={payment.amount}")
        
        treatment.refresh_from_db()
        
        commission = CommissionRecord.objects.filter(treatment=treatment).first()
        if commission:
            self.stdout.write(f"Commission Created: Amount={commission.amount}, Rate={commission.rate}%, Base={commission.base_amount}")
            expected_commission = treatment.price * doctor_profile.default_commission_rate / Decimal("100")
            if commission.amount == expected_commission:
                self.stdout.write("=> Commission calculation is mathematically CORRECT.")
            else:
                self.stdout.write(f"=> ERROR: Commission mismatch. Expected {expected_commission}, got {commission.amount}")
        else:
            self.stdout.write("=> ERROR: No commission record found.")
            
        payload = dashboard_payload("day")
        self.stdout.write(f"Dashboard Revenue for 'day': {payload['kpi']['revenue']}")
        
        self.stdout.write("--- Financial Flow Test Completed ---")
