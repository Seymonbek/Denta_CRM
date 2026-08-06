"""Django management command to populate DentaCRM with realistic Uzbek demo data."""
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


class Command(BaseCommand):
    help = "Populate database with rich realistic fake data for DentaCRM testing."

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS("Starting DentaCRM data seeding process..."))

        # 1. USERS
        self.stdout.write("1. Creating Users...")

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

        # 3. DOCTOR PROFILES & WORKING HOURS
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

        # Working hours (Dushanba - Shanba 09:00 - 18:00)
        for doc in doctors:
            for day in range(6):  # 0 to 5
                WorkingHours.objects.get_or_create(
                    doctor=doc,
                    weekday=day,
                    defaults={"start_time": "09:00", "end_time": "18:00"},
                )

        # 4. PROCEDURE TYPES
        self.stdout.write("4. Creating Procedure Types...")
        procedures_data = [
            ("Kompozit plomba qo'yish", departments[0], 45, Decimal("250000.00")),
            ("Tish kanalini tozalash (Endodontiya)", departments[0], 60, Decimal("350000.00")),
            ("Tish oldirish (Ekstraktsiya)", departments[2], 30, Decimal("200000.00")),
            ("Stomatologik implantatsiya", departments[2], 90, Decimal("1800000.00")),
            ("Metall-keramika koronka", departments[1], 45, Decimal("600000.00")),
            ("Ultra-tovushli tozalash va polirovka", departments[0], 30, Decimal("180000.00")),
            ("Metall breket o'rnatish", departments[3], 60, Decimal("3500000.00")),
        ]

        procedure_types = []
        for name, dept, dur, price in procedures_data:
            pt, _ = ProcedureType.objects.get_or_create(
                name=name,
                department=dept,
                defaults={"default_duration_minutes": dur, "default_price": price},
            )
            procedure_types.append(pt)

        # 5. PATIENTS
        self.stdout.write("5. Creating Patients...")
        patients_data = [
            ("Jamshid", "Alimov", "+998901112233", "male", "Toshkent sh., Yunusobod t.", 901112233),
            ("Malika", "Sharipova", "+998902223344", "female", "Toshkent sh., Chilonzor t.", 902223344),
            ("Bobur", "Karimov", "+998903334455", "male", "Toshkent sh., Mirzo Ulug'bek t.", 903334455),
            ("Nigora", "Yusupova", "+998904445566", "female", "Toshkent sh., Yakkasaroy t.", 904445566),
            ("Sardor", "Raximov", "+998905556677", "male", "Toshkent sh., Sergeli t.", 905556677),
            ("Zuxra", "Ahmedova", "+998906667788", "female", "Toshkent sh., Shayxontohur t.", 906667788),
            ("Otabek", "Umarov", "+998907778899", "male", "Toshkent sh., Olmazor t.", 907778899),
            ("Gulnora", "Mahmudova", "+998908889900", "female", "Toshkent sh., Yashnobod t.", 908889900),
            ("Jasur", "Tursunov", "+998909990011", "male", "Toshkent sh., Uchtepa t.", 909990011),
            ("Dildora", "Ismoilova", "+998911112244", "female", "Toshkent sh., Bektemir t.", 911112244),
        ]

        patients = []
        for fn, ln, ph, g, addr, chat_id in patients_data:
            p, _ = Patient.objects.get_or_create(
                phone_number=ph,
                defaults={
                    "first_name": fn,
                    "last_name": ln,
                    "gender": g,
                    "address": addr,
                    "notes": "Penitsillinga allergiyasi yo'q. Muntazam profilaktika ko'rigidan o'tadi.",
                    "telegram_chat_id": chat_id,
                    "created_by": admin_user,
                },
            )
            patients.append(p)

        # 6. APPOINTMENTS & TREATMENTS
        self.stdout.write("6. Creating Appointments & Treatments...")
        now = timezone.now()
        statuses = ["completed", "confirmed", "scheduled", "in_progress", "completed"]

        appointments = []
        treatments = []

        for i, patient in enumerate(patients):
            doc = doctors[i % len(doctors)]
            pt = procedure_types[i % len(procedure_types)]
            status = statuses[i % len(statuses)]

            # Spread dates over past days and upcoming days
            offset_days = (i % 7) - 3  # -3, -2, -1, 0, 1, 2, 3 days
            start_time = (now + timedelta(days=offset_days)).replace(hour=9 + (i % 8), minute=0, second=0)
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

                # Create Treatment for completed/in_progress appointments
                if status in ["completed", "in_progress"]:
                    t = Treatment.objects.create(
                        appointment=appt,
                        doctor=doc,
                        patient=patient,
                        department=pt.department,
                        procedure_type=pt,
                        diagnosis=f"O'tkir {pt.name} tashxisi qo'yildi.",
                        description=f"Bemorga {pt.name} muolajasi muvaffaqiyatli o'tkazildi.",
                        price=pt.default_price,
                        payment_status="paid" if status == "completed" else "unpaid",
                        stage=status,
                    )
                    treatments.append(t)
            except Exception as e:
                self.stdout.write(f"Skipping appt creation note: {e}")

        # 7. ODONTOGRAM (ToothRecords)
        self.stdout.write("7. Creating Odontogram ToothRecords...")
        tooth_numbers = ["11", "16", "24", "36", "46"]
        procedures = ["filling", "root_canal", "crown", "extraction", "cleaning"]

        for tr in treatments:
            for idx, tn in enumerate(tooth_numbers[:3]):
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
            name="Pulpitdan keyingi gigiyena tavsiyasi",
            defaults={
                "content": "1. Xlorgeksidin 0.2% - og'izni chayqash (kuniga 3 mahal)\n2. Paratsetamol 500mg - og'riq bo'lganda",
                "created_by": doctor_user1,
            },
        )

        for tr in treatments[:5]:
            Prescription.objects.get_or_create(
                treatment=tr,
                defaults={
                    "template": tpl1,
                    "content": tpl1.content,
                    "sent_to_telegram_at": timezone.now() if random.choice([True, False]) else None,
                },
            )

        # 9. INVENTORY (Materials & Usage)
        self.stdout.write("9. Creating Inventory Materials & Logs...")
        materials_data = [
            ("Stomatologik Kompozit Plomba (Filtek Z250)", "piece", Decimal("45.00"), Decimal("10.00"), Decimal("120000.00")),
            ("Lidokain 2% Anesteziya Ampula", "piece", Decimal("8.00"), Decimal("25.00"), Decimal("5000.00")),
            ("Stomatologik bir martalik ignalar", "piece", Decimal("150.00"), Decimal("30.00"), Decimal("1500.00")),
            ("Antiseptik sprey (Xlorgeksidin)", "ml", Decimal("6.00"), Decimal("15.00"), Decimal("25000.00")),
            ("Alginat qolip kukuni", "gram", Decimal("900.00"), Decimal("200.00"), Decimal("85000.00")),
        ]

        materials = []
        for name, unit, q_stock, threshold, cost in materials_data:
            mat, _ = Material.objects.get_or_create(
                name=name,
                defaults={
                    "unit": unit,
                    "quantity_in_stock": q_stock,
                    "minimum_threshold": threshold,
                    "unit_cost": cost,
                },
            )
            materials.append(mat)

        for tr in treatments[:4]:
            mat = materials[0]
            MaterialUsage.objects.get_or_create(
                treatment=tr,
                material=mat,
                defaults={"quantity_used": Decimal("1.00")},
            )

        # 10. PAYMENTS & COMMISSIONS
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
                },
            )

            # Commission Record
            doc = tr.doctor
            comm_rate = doc.default_commission_rate
            comm_amount = (tr.price * comm_rate) / Decimal("100.00")

            CommissionRecord.objects.get_or_create(
                treatment=tr,
                defaults={
                    "doctor": doc,
                    "amount": comm_amount,
                    "basis": doc.commission_basis,
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

        for doc in doctors:
            ScoreLog.objects.create(
                doctor=doc,
                points=random.randint(50, 200),
                reason="treatment_completed",
            )
            DoctorBadge.objects.get_or_create(
                doctor=doc,
                badge=badge1,
                period="2026-08",
            )

        # 12. NOTIFICATIONS
        self.stdout.write("12. Creating Notification Logs...")
        for p in patients[:5]:
            NotificationLog.objects.create(
                patient=p,
                type="appointment_reminder_1d",
                channel="telegram",
                message=f"Hukmatli {p.full_name}, ertaga soat 10:00 da DentaCRM klinikasida qabulingiz bor.",
                status="sent",
                sent_at=timezone.now(),
            )

        self.stdout.write(self.style.SUCCESS("Successfully populated DentaCRM database with rich Uzbek demo data!"))
