"""``manage.py seed_demo_data`` — populate the DB with demo records.

Creates a deterministic set of fixtures matching PROJECT_BRIEF §
"Acceptance Criteria" #17:

* 1 bosh_shifokor (+998900000001 / password ``demo12345``)
* 2 doctors     (+998900000002, +998900000003)
* 1 administrator (+998900000010)
* 10 patients   (+998900010001 … +998900010010)
* 2 departments (Terapiya, Ortopediya)
* 4 procedure types (2 per department)
* Working hours Mon–Fri 09:00–18:00 for both doctors
* 5 upcoming appointments spread across the next 3 days

The command is IDEMPOTENT: a second run detects the fixed
bosh_shifokor phone and short-circuits (unless ``--wipe`` is given).
Use ``--dry-run`` to print the plan without touching the DB.
"""
from __future__ import annotations

import argparse
from datetime import datetime, time, timedelta
from decimal import Decimal
from typing import Any

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

# ---------------------------------------------------------------------------
# Fixed identifiers so the command is deterministic + idempotent
# ---------------------------------------------------------------------------
BOSH_SHIFOKOR_PHONE = "+998900000001"
DEMO_PASSWORD = "demo12345"  # noqa: S105 — documented seed value

DOCTORS: list[dict[str, Any]] = [
    {
        "phone": "+998900000002",
        "first_name": "Dilshod",
        "last_name": "Karimov",
        "specialization": "Terapevt-stomatolog",
        "commission_rate": Decimal("35.00"),
    },
    {
        "phone": "+998900000003",
        "first_name": "Zilola",
        "last_name": "Ismoilova",
        "specialization": "Ortopediya",
        "commission_rate": Decimal("30.00"),
    },
]

ADMIN_PHONE = "+998900000010"

PATIENTS: list[dict[str, str]] = [
    {"phone": f"+99890001000{i}", "first_name": f"Bemor{i}", "last_name": f"Familiya{i}"}
    for i in range(1, 10)
] + [
    {"phone": "+998900010010", "first_name": "Bemor10", "last_name": "Familiya10"}
]

DEPARTMENTS: list[dict[str, str]] = [
    {"name": "Terapiya", "description": "Umumiy tish davolash bo'limi"},
    {"name": "Ortopediya", "description": "Protezlash va estetika bo'limi"},
]

PROCEDURES: list[dict[str, Any]] = [
    {"name": "Plomba", "department": "Terapiya", "duration": 30, "price": "300000"},
    {"name": "Kanal davolash", "department": "Terapiya", "duration": 60, "price": "600000"},
    {"name": "Koronka", "department": "Ortopediya", "duration": 45, "price": "1200000"},
    {"name": "Implant", "department": "Ortopediya", "duration": 90, "price": "3500000"},
]


class Command(BaseCommand):
    help = "Populate the DB with idempotent demo data (users, patients, appts)."

    def add_arguments(self, parser: argparse.ArgumentParser) -> None:
        parser.add_argument(
            "--wipe",
            action="store_true",
            help="Delete existing demo rows before re-seeding.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print the plan without touching the DB.",
        )

    # ------------------------------------------------------------------
    # Main
    # ------------------------------------------------------------------
    def handle(self, *args, **options) -> None:
        wipe: bool = bool(options.get("wipe"))
        dry_run: bool = bool(options.get("dry_run"))

        User = get_user_model()

        if dry_run:
            self.stdout.write("DRY-RUN: no database writes.")
            self._print_plan()
            return

        with transaction.atomic():
            if wipe:
                self.stdout.write(self.style.WARNING("Wiping existing demo rows..."))
                self._wipe()

            if User.objects.filter(phone_number=BOSH_SHIFOKOR_PHONE).exists() and not wipe:
                self.stdout.write(
                    self.style.SUCCESS(
                        "Demo bosh_shifokor already exists — nothing to do."
                    )
                )
                return

            self._seed()

        self.stdout.write(self.style.SUCCESS("Demo data seeded successfully."))

    # ------------------------------------------------------------------
    # Wipe (only demo phone numbers — never touches real accounts)
    # ------------------------------------------------------------------
    def _wipe(self) -> None:
        from apps.departments.models import Department
        from apps.doctors.models import DoctorProfile, ProcedureType, WorkingHours
        from apps.patients.models import Patient
        from apps.scheduling.models import Appointment

        User = get_user_model()

        demo_phones = (
            [BOSH_SHIFOKOR_PHONE, ADMIN_PHONE]
            + [d["phone"] for d in DOCTORS]
            + [p["phone"] for p in PATIENTS]
        )
        demo_users = User.objects.filter(phone_number__in=demo_phones)
        demo_patients = Patient.objects.filter(
            phone_number__in=[p["phone"] for p in PATIENTS]
        )

        Appointment.objects.filter(patient__in=demo_patients).delete()
        WorkingHours.objects.filter(doctor__user__in=demo_users).delete()
        DoctorProfile.objects.filter(user__in=demo_users).delete()
        demo_patients.delete()
        ProcedureType.objects.filter(
            name__in=[p["name"] for p in PROCEDURES]
        ).delete()
        Department.objects.filter(
            name__in=[d["name"] for d in DEPARTMENTS]
        ).delete()
        demo_users.delete()

    # ------------------------------------------------------------------
    # Seed
    # ------------------------------------------------------------------
    def _seed(self) -> None:
        from apps.departments.models import Department
        from apps.doctors.models import DoctorProfile, ProcedureType, WorkingHours
        from apps.patients.models import Patient
        from apps.scheduling.models import Appointment, AppointmentStatus

        User = get_user_model()

        # 1. bosh_shifokor
        bosh, _created = User.objects.get_or_create(
            phone_number=BOSH_SHIFOKOR_PHONE,
            defaults={
                "first_name": "Aziza",
                "last_name": "Rahimova",
                "role": User.Role.BOSH_SHIFOKOR,
                "is_staff": True,
                "is_active": True,
            },
        )
        bosh.set_password(DEMO_PASSWORD)
        bosh.save()

        # 2. administrator
        admin, _created = User.objects.get_or_create(
            phone_number=ADMIN_PHONE,
            defaults={
                "first_name": "Diyor",
                "last_name": "Sharipov",
                "role": User.Role.ADMINISTRATOR,
                "is_active": True,
            },
        )
        admin.set_password(DEMO_PASSWORD)
        admin.save()

        # 3. departments
        dept_map: dict[str, Department] = {}
        for spec in DEPARTMENTS:
            dept, _ = Department.objects.get_or_create(
                name=spec["name"],
                defaults={"description": spec["description"], "created_by": bosh},
            )
            dept_map[dept.name] = dept

        # 4. procedure types
        proc_map: dict[str, ProcedureType] = {}
        for proc in PROCEDURES:
            dept = dept_map[proc["department"]]
            entry, _ = ProcedureType.objects.get_or_create(
                name=proc["name"],
                department=dept,
                defaults={
                    "default_duration_minutes": int(proc["duration"]),
                    "default_price": Decimal(str(proc["price"])),
                },
            )
            proc_map[proc["name"]] = entry

        # 5. doctors + working hours
        doctors: list[DoctorProfile] = []
        for spec in DOCTORS:
            user, _ = User.objects.get_or_create(
                phone_number=spec["phone"],
                defaults={
                    "first_name": spec["first_name"],
                    "last_name": spec["last_name"],
                    "role": User.Role.DOCTOR,
                    "is_active": True,
                },
            )
            user.set_password(DEMO_PASSWORD)
            user.save()

            profile, _ = DoctorProfile.objects.get_or_create(
                user=user,
                defaults={
                    "specialization": spec["specialization"],
                    "default_commission_rate": spec["commission_rate"],
                },
            )
            # Attach to both departments
            profile.departments.set(list(dept_map.values()))

            # Working hours: Mon–Fri 09:00–18:00
            for weekday in range(0, 5):
                WorkingHours.objects.get_or_create(
                    doctor=profile,
                    weekday=weekday,
                    start_time=time(9, 0),
                    defaults={"end_time": time(18, 0)},
                )
            doctors.append(profile)

        # 6. patients
        patients: list[Patient] = []
        for spec in PATIENTS:
            patient, _ = Patient.objects.get_or_create(
                phone_number=spec["phone"],
                defaults={
                    "first_name": spec["first_name"],
                    "last_name": spec["last_name"],
                    "created_by": admin,
                },
            )
            patients.append(patient)

        # 7. appointments — 5 upcoming, spread across next 3 days
        now = timezone.now().replace(minute=0, second=0, microsecond=0)
        base = now + timedelta(hours=2)
        plan = [
            (0, 10, 0),  # tomorrow-ish, doctor 0
            (0, 11, 30),
            (1, 9, 30),
            (1, 15, 0),
            (2, 14, 0),
        ]
        for i, (day_offset, hour, minute) in enumerate(plan):
            start = (base + timedelta(days=day_offset)).replace(
                hour=hour, minute=minute
            )
            end = start + timedelta(minutes=30)
            doc = doctors[i % len(doctors)]
            pat = patients[i % len(patients)]
            first_dept = next(iter(doc.departments.all()), None)
            if first_dept is None:
                continue
            Appointment.objects.get_or_create(
                doctor=doc,
                scheduled_start=start,
                defaults={
                    "patient": pat,
                    "department": first_dept,
                    "scheduled_end": end,
                    "status": AppointmentStatus.SCHEDULED,
                    "created_by": admin,
                },
            )

        # Silence lint about unused import in some branches.
        _ = datetime

    # ------------------------------------------------------------------
    # Dry-run summary
    # ------------------------------------------------------------------
    def _print_plan(self) -> None:
        rows = [
            f"- 1 bosh_shifokor  ({BOSH_SHIFOKOR_PHONE} / password '{DEMO_PASSWORD}')",
            f"- 1 administrator ({ADMIN_PHONE})",
            f"- {len(DOCTORS)} doctors",
            f"- {len(PATIENTS)} patients",
            f"- {len(DEPARTMENTS)} departments",
            f"- {len(PROCEDURES)} procedure types",
            "- 5 upcoming appointments across the next 3 days",
        ]
        for row in rows:
            self.stdout.write(row)
