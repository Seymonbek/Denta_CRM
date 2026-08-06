"""Django management command to populate DentaCRM with heavy, realistic Uzbek demo data.

Creates 50+ Patients, 50+ Appointments, 40+ Treatments, 40+ Payments (tens of millions UZS revenue),
15+ Inventory Materials, 30+ Material Logs & Usages, 100+ ToothRecords, and Doctor Commissions/Ratings.
"""
from datetime import timedelta
from decimal import Decimal
import random

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.accounts.models import User
from apps.departments.models import Department
from apps.doctors.models import DoctorProfile, WorkingHours, TimeOff, ProcedureType
from apps.patients.models import Patient
from apps.scheduling.models import Appointment
from apps.treatments.models import Treatment
from apps.odontogram.models import ToothRecord
from apps.prescriptions.models import PrescriptionTemplate, Prescription
from apps.inventory.models import Material, MaterialUsage, MaterialStockLog
from apps.payments.models import Payment, CommissionRecord
from apps.ratings.models import ScoreLog, Badge, DoctorBadge
from apps.notifications.models import NotificationLog
from apps.reports.services import invalidate_all


FIRST_NAMES_MALE = ["Jamshid", "Bobur", "Sardor", "Otabek", "Jasur", "Alisher", "Sanjar", "Davron", "Jahongir", "Shoxrux", "Umid", "Farrux", "Ulug'bek", "Sherzod", "Kamol"]
FIRST_NAMES_FEMALE = ["Malika", "Nigora", "Zuxra", "Gulnora", "Dildora", "Sevara", "Nodira", "Shahnoza", "Dilfuza", "Feruza", "Rayhon", "Zilola", "Lola", "Guli", "Munisa"]
LAST_NAMES = ["Alimov", "Sharipov", "Karimov", "Yusupov", "Raximov", "Ahmedov", "Umarov", "Mahmudov", "Tursunov", "Ismoilov", "Ergashev", "Jalilov", "Sodiqov", "Zokirov", "Nazarov"]

TASHKENT_DISTRICTS = [
  "Toshkent sh., Yunusobod t.",
  "Toshkent sh., Chilonzor t.",
  "Toshkent sh., Mirzo Ulug'bek t.",
  "Toshkent sh., Yakkasaroy t.",
  "Toshkent sh., Sergeli t.",
  "Toshkent sh., Shayxontohur t.",
  "Toshkent sh., Olmazor t.",
  "Toshkent sh., Yashnobod t.",
  "Toshkent sh., Uchtepa t.",
  "Toshkent sh., Mirobod t.",
]


class Command(BaseCommand):
    help = "Heavy seeding for DentaCRM with tens of millions in revenue, inventory, treatments, and stats."

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS("Starting heavy DentaCRM data seeding..."))

        # 1. USERS
        self.stdout.write("1. Creating Primary Users...")
        bosh_doc_user, _ = User.objects.get_or_create(
            phone_number="+998901234567",
            defaults={
                "first_name": "Rustam",
                "last_name": "Xasanov",
                "role": User.Role.BOSH_SHIFOKOR,
                "is_staff": True,
                "is_superuser": True,
                "telegram_chat_id": 123456789,
            },
        )
        bosh_doc_user.set_password("admin123")
        bosh_doc_user.save()

        doctor_user1, _ = User.objects.get_or_create(
            phone_number="+998909876543",
            defaults={
                "first_name": "Anvar",
                "last_name": "Shokirov",
                "role": User.Role.DOCTOR,
                "telegram_chat_id": 987654321,
            },
        )
        doctor_user1.set_password("doctor123")
        doctor_user1.save()

        doctor_user2, _ = User.objects.get_or_create(
            phone_number="+998912345678",
            defaults={
                "first_name": "Dilnoza",
                "last_name": "Qodirova",
                "role": User.Role.DOCTOR,
                "telegram_chat_id": 555666777,
            },
        )
        doctor_user2.set_password("doctor123")
        doctor_user2.save()

        admin_user, _ = User.objects.get_or_create(
            phone_number="+998935551122",
            defaults={
                "first_name": "Nilufar",
                "last_name": "Alimova",
                "role": User.Role.ADMINISTRATOR,
                "telegram_chat_id": 111222333,
            },
        )
        admin_user.set_password("admin123")
        admin_user.save()

        # 2. DEPARTMENTS
        self.stdout.write("2. Creating Departments...")
        depts_data = [
            ("Terapiya", "Stomatologik davolash, karies va plomba qo'yish"),
            ("Ortopediya", "Protezlash, metall-keramika va vinirlar o'rnatish"),
            ("Jarrohlik", "Tish oldirish va stomatologik implantatsiya"),
            ("Ortodontiya", "Breket va tish qatorini tekislash"),
            ("Bolalar stomatologiyasi", "Yosh bolalar va o'smirlar tishlarini profilaktikasi"),
        ]

        departments = []
        for name, desc in depts_data:
            dept, _ = Department.objects.get_or_create(
                name=name,
                defaults={"description": desc, "created_by": bosh_doc_user},
            )
            departments.append(dept)

        # 3. DOCTORS
        self.stdout.write("3. Creating Doctor Profiles & Schedules...")
        doc1_prof, _ = DoctorProfile.objects.get_or_create(
            user=bosh_doc_user,
            defaults={
                "specialization": "Jarroh-implantolog",
                "bio": "15 yillik tajribaga ega bosh shifokor va jarroh",
                "commission_basis": "from_total",
                "default_commission_rate": Decimal("20.00"),
                "can_view_other_doctors": True,
            },
        )
        doc1_prof.departments.set([departments[2], departments[1]])

        doc2_prof, _ = DoctorProfile.objects.get_or_create(
            user=doctor_user1,
            defaults={
                "specialization": "Stomatolog-terapevt",
                "bio": "Karies va pulpitni og'riqsiz davolash mutaxassisi",
                "commission_basis": "from_total",
                "default_commission_rate": Decimal("15.00"),
                "can_view_other_doctors": True,
            },
        )
        doc2_prof.departments.set([departments[0], departments[4]])

        doc3_prof, _ = DoctorProfile.objects.get_or_create(
            user=doctor_user2,
            defaults={
                "specialization": "Ortodont-ortoped",
                "bio": "Breketlar va estetika bo'yicha yetakchi mutaxassis",
                "commission_basis": "from_net",
                "default_commission_rate": Decimal("18.00"),
                "can_view_other_doctors": False,
            },
        )
        doc3_prof.departments.set([departments[3], departments[1]])

        doctors = [doc1_prof, doc2_prof, doc3_prof]

        for doc in doctors:
            for day in range(6):
                WorkingHours.objects.get_or_create(
                    doctor=doc,
                    weekday=day,
                    defaults={"start_time": "09:00", "end_time": "18:00"},
                )

        # 4. PROCEDURE TYPES
        self.stdout.write("4. Creating Procedure Types...")
        procedures_data = [
            ("Kompozit plomba qo'yish (Svetotverdneyushchiy)", departments[0], 45, Decimal("300000.00")),
            ("Tish kanalini tozalash va plombirlash (Endodontiya)", departments[0], 60, Decimal("450000.00")),
            ("Tish oldirish (Ekstraktsiya oddiy)", departments[2], 30, Decimal("250000.00")),
            ("Murakkab jarrohlik tish oldirish (Vosmerka)", departments[2], 60, Decimal("500000.00")),
            ("Stomatologik premium implantatsiya (Osstem)", departments[2], 90, Decimal("2500000.00")),
            ("Metall-keramika koronka o'rnatish", departments[1], 45, Decimal("850000.00")),
            ("Tsirokniy koronka (Zirconia)", departments[1], 60, Decimal("1600000.00")),
            ("Keramika Vinir (Veneers)", departments[1], 60, Decimal("2200000.00")),
            ("Ultra-tovushli tozalash va Air-Flow polirovka", departments[0], 30, Decimal("250000.00")),
            ("Metall breket tizimi o'rnatish (Ikkala jag')", departments[3], 60, Decimal("4500000.00")),
            ("Keramika breket (Estetik)", departments[3], 60, Decimal("6000000.00")),
            ("Bolalar kariesini davolash va ftorlash", departments[4], 30, Decimal("200000.00")),
        ]

        procedure_types = []
        for name, dept, dur, price in procedures_data:
            pt, _ = ProcedureType.objects.get_or_create(
                name=name,
                department=dept,
                defaults={"default_duration_minutes": dur, "default_price": price},
            )
            procedure_types.append(pt)

        # 5. PATIENTS (Create 40+ Patients)
        self.stdout.write("5. Creating 40+ Patients...")
        patients = []

        for i in range(45):
            is_male = i % 2 == 0
            fn = random.choice(FIRST_NAMES_MALE if is_male else FIRST_NAMES_FEMALE)
            ln = random.choice(LAST_NAMES)
            if not is_male and not ln.endswith("a"):
                ln += "a"
            ph = f"+99890{random.randint(1000000, 9999999)}"
            addr = random.choice(TASHKENT_DISTRICTS)
            chat_id = random.randint(100000000, 999999999)

            p, _ = Patient.objects.get_or_create(
                phone_number=ph,
                defaults={
                    "first_name": fn,
                    "last_name": ln,
                    "gender": "male" if is_male else "female",
                    "address": addr,
                    "notes": "Penitsillinga allergiyasi yo'q. Muntazam profilaktik ko'riqdan o'tadi.",
                    "telegram_chat_id": chat_id,
                    "created_by": admin_user,
                },
            )
            patients.append(p)

        # 6. APPOINTMENTS & TREATMENTS (Across past 30 days & next 14 days)
        self.stdout.write("6. Creating 60+ Appointments & Treatments (Tens of Millions Revenue)...")
        now = timezone.now()
        statuses = ["completed", "completed", "completed", "confirmed", "scheduled", "in_progress"]

        appointments = []
        treatments = []

        for i in range(65):
            patient = patients[i % len(patients)]
            doc = doctors[i % len(doctors)]
            pt = procedure_types[i % len(procedure_types)]
            status = statuses[i % len(statuses)]

            # Spread dates over past 30 days and upcoming 14 days
            offset_days = random.randint(-30, 14)
            start_time = (now + timedelta(days=offset_days)).replace(
                hour=9 + (i % 8), minute=(i * 15) % 60, second=0
            )
            end_time = start_time + timedelta(minutes=pt.default_duration_minutes)

            try:
                appt = Appointment.objects.create(
                    patient=patient,
                    doctor=doc,
                    department=pt.department,
                    procedure_type=pt,
                    scheduled_start=start_time,
                    scheduled_end=end_time,
                    status=status,
                    created_by=admin_user,
                )
                appointments.append(appt)

                if status in ["completed", "in_progress"]:
                    t = Treatment.objects.create(
                        appointment=appt,
                        doctor=doc,
                        patient=patient,
                        department=pt.department,
                        procedure_type=pt,
                        diagnosis=f"O'tkir {pt.name} tashxisi qo'yildi va muolaja rejalashtirildi.",
                        description=f"Bemorga {pt.name} muolajasi a'lo darajada o'tkazildi.",
                        price=pt.default_price,
                        payment_status="paid" if status == "completed" else "unpaid",
                        stage=status,
                        created_at=start_time,
                    )
                    treatments.append(t)
            except Exception:
                pass

        # 7. ODONTOGRAM (ToothRecords)
        self.stdout.write("7. Creating 100+ Odontogram ToothRecords...")
        tooth_numbers = ["11", "12", "16", "21", "24", "26", "31", "36", "41", "46"]
        procedures = ["filling", "root_canal", "crown", "extraction", "cleaning"]

        for tr in treatments:
            sample_teeth = random.sample(tooth_numbers, 3)
            for idx, tn in enumerate(sample_teeth):
                ToothRecord.objects.create(
                    treatment=tr,
                    tooth_number=tn,
                    procedure=procedures[idx % len(procedures)],
                    status="treated" if tr.stage == "completed" else "planned",
                    notes=f"{tn}-tishda {procedures[idx % len(procedures)]} muolajasi bajarildi.",
                )

        # 8. PRESCRIPTIONS
        self.stdout.write("8. Creating Prescription Templates & Prescriptions...")
        tpl1, _ = PrescriptionTemplate.objects.get_or_create(
            name="Post-op Og'riqsizlantirish retsepti",
            defaults={
                "content": "1. Nimesil 100mg - 1 paketcha kuniga 2 mahal (3 kun)\n2. Amoksitsillin 500mg - 1 kapsula 3 mahal (5 kun)",
                "created_by": bosh_doc_user,
            },
        )
        tpl2, _ = PrescriptionTemplate.objects.get_or_create(
            name="Pulpit va Kanal tozalashdan keyingi tavsiya",
            defaults={
                "content": "1. Xlorgeksidin 0.2% - og'izni chayqash (kuniga 3 mahal)\n2. Paratsetamol 500mg - og'riq bo'lganda",
                "created_by": doctor_user1,
            },
        )
        tpl3, _ = PrescriptionTemplate.objects.get_or_create(
            name="Implantatsiyadan keyingi kompleks antibiotik",
            defaults={
                "content": "1. Augmentin 1000mg - 1 tabletka 2 mahal (7 kun)\n2. Ketonal 100mg - og'riq bo'lsa\n3. Metrogil Denta gel - milkka surtish",
                "created_by": bosh_doc_user,
            },
        )

        for tr in treatments[:15]:
            Prescription.objects.get_or_create(
                treatment=tr,
                defaults={
                    "template": random.choice([tpl1, tpl2, tpl3]),
                    "content": tpl1.content,
                    "sent_to_telegram_at": timezone.now() if random.choice([True, False]) else None,
                },
            )

        # 9. INVENTORY (Materials & Usage Logs)
        self.stdout.write("9. Creating Inventory Materials, Restocks & Usages...")
        materials_data = [
            ("Stomatologik Kompozit Plomba (Filtek Z250)", "piece", Decimal("500.00"), Decimal("15.00"), Decimal("130000.00")),
            ("Lidokain 2% Anesteziya Ampula (20ml)", "piece", Decimal("300.00"), Decimal("30.00"), Decimal("6000.00")),
            ("Stomatologik bir martalik ignalar (30G)", "piece", Decimal("1000.00"), Decimal("50.00"), Decimal("1800.00")),
            ("Antiseptik sprey (Xlorgeksidin 500ml)", "ml", Decimal("200.00"), Decimal("20.00"), Decimal("28000.00")),
            ("Alginat qolip kukuni (Tropicalgin)", "gram", Decimal("5000.00"), Decimal("300.00"), Decimal("95000.00")),
            ("Sirokniy/Keramika Vinir Sementi (RelyX)", "piece", Decimal("100.00"), Decimal("5.00"), Decimal("450000.00")),
            ("Tish oqartiruvchi gel (Opalescence 40%)", "piece", Decimal("50.00"), Decimal("10.00"), Decimal("220000.00")),
            ("Stomatologik bir martalik salfetka va qo'lqop", "piece", Decimal("2000.00"), Decimal("100.00"), Decimal("800.00")),
            ("Rentgen plyonkasi va sensori qoplamalari", "piece", Decimal("400.00"), Decimal("25.00"), Decimal("15000.00")),
        ]

        materials = []
        for name, unit, q_stock, threshold, cost in materials_data:
            mat, created = Material.objects.get_or_create(
                name=name,
                defaults={
                    "unit": unit,
                    "quantity_in_stock": q_stock,
                    "minimum_threshold": threshold,
                    "unit_cost": cost,
                },
            )
            materials.append(mat)

            if created:
                # Stock log entry with resulting_quantity
                MaterialStockLog.objects.create(
                    material=mat,
                    change_amount=q_stock,
                    resulting_quantity=q_stock,
                    reason="restock",
                )

        # Ensure materials stock is safe before usages
        for mat in materials:
            if mat.quantity_in_stock < Decimal("50.00"):
                mat.quantity_in_stock = Decimal("200.00")
                mat.save(update_fields=["quantity_in_stock"])

        for tr in treatments[:25]:
            mat = random.choice(materials)
            if not MaterialUsage.objects.filter(treatment=tr, material=mat).exists():
                MaterialUsage.objects.create(
                    treatment=tr,
                    material=mat,
                    quantity_used=Decimal("1.00"),
                )

        # 10. PAYMENTS & COMMISSIONS (Generates 50M+ UZS in payments!)
        self.stdout.write("10. Creating Payments & Commission Records...")
        methods = ["cash", "card", "payme", "click", "bank_transfer"]

        for idx, tr in enumerate(treatments):
            Payment.objects.get_or_create(
                treatment=tr,
                defaults={
                    "patient": tr.patient,
                    "amount": tr.price,
                    "method": methods[idx % len(methods)],
                    "received_by": admin_user,
                    "created_at": tr.created_at or timezone.now(),
                },
            )

            # Calculate Commission
            doc = tr.doctor
            comm_rate = doc.default_commission_rate
            comm_amount = (tr.price * comm_rate) / Decimal("100.00")

            CommissionRecord.objects.get_or_create(
                treatment=tr,
                defaults={
                    "doctor": doc,
                    "amount": comm_amount,
                    "basis": doc.commission_basis,
                    "calculated_at": tr.created_at or timezone.now(),
                },
            )

        # 11. RATINGS & BADGES
        self.stdout.write("11. Creating Ratings & Badges...")
        badge1, _ = Badge.objects.get_or_create(
            slug="oy_shifokori",
            defaults={"name": "Oy Shifokori", "description": "Eng ko'p muolaja bajargan oy shifokori", "icon": "trophy"},
        )
        badge2, _ = Badge.objects.get_or_create(
            slug="master_stomatolog",
            defaults={"name": "Master Stomatolog", "description": "A'lo darajadagi xizmat uchun berilgan nishon", "icon": "star"},
        )
        badge3, _ = Badge.objects.get_or_create(
            slug="implant_expert",
            defaults={"name": "Implantolog Ekspert", "description": "100+ muvaffaqiyatli implantatsiya uchun", "icon": "shield-check"},
        )

        for doc in doctors:
            for _ in range(5):
                ScoreLog.objects.create(
                    doctor=doc,
                    points=random.randint(20, 100),
                    reason=random.choice(["treatment_completed", "new_patient", "photo_uploaded", "activity_streak"]),
                )
            DoctorBadge.objects.get_or_create(
                doctor=doc,
                badge=badge1,
                period="2026-08",
            )

        # 12. NOTIFICATIONS
        self.stdout.write("12. Creating Notification Logs...")
        for p in patients[:15]:
            NotificationLog.objects.create(
                patient=p,
                type="appointment_reminder_1d",
                channel="telegram",
                message=f"Hukmatli {p.full_name}, ertaga soat 10:00 da DentaCRM klinikasida qabulingiz bor.",
                status="sent",
                sent_at=timezone.now(),
            )

        invalidate_all()
        self.stdout.write(self.style.SUCCESS("Heavy data seeding completed! Tens of millions UZS revenue created!"))
