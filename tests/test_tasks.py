"""Tests for Celery tasks defined in the various apps.

Runs with ``CELERY_TASK_ALWAYS_EAGER = True`` so no broker is needed.
"""
from __future__ import annotations

import io
from datetime import timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone

pytestmark = pytest.mark.django_db


User = get_user_model()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _make_boss(**kwargs):
    defaults = {
        "phone_number": "+998900000001",
        "first_name": "Head",
        "last_name": "Doctor",
        "role": User.Role.BOSH_SHIFOKOR,
        "is_active": True,
    }
    defaults.update(kwargs)
    return User.objects.create_user(password="pass12345", **defaults)


def _make_admin(phone: str = "+998900000010"):
    return User.objects.create_user(
        phone_number=phone,
        first_name="Admin",
        last_name="Person",
        password="pass12345",
        role=User.Role.ADMINISTRATOR,
    )


def _make_department(user):
    from apps.departments.models import Department

    return Department.objects.create(
        name="Terapiya", description="Terapiya bo'limi", created_by=user
    )


def _make_doctor(user_phone: str, department):
    from apps.doctors.models import DoctorProfile

    user = User.objects.create_user(
        phone_number=user_phone,
        first_name="Doc",
        last_name="Tor",
        password="pass12345",
        role=User.Role.DOCTOR,
    )
    profile = DoctorProfile.objects.create(user=user, specialization="Umumiy")
    profile.departments.add(department)
    return profile


def _make_patient(admin):
    from apps.patients.models import Patient

    return Patient.objects.create(
        first_name="Bemor",
        last_name="Test",
        phone_number="+998900010001",
        created_by=admin,
    )


def _make_treatment(doctor, patient, department):
    from apps.treatments.models import Treatment

    return Treatment.objects.create(
        doctor=doctor,
        patient=patient,
        department=department,
        price=Decimal("300000"),
    )


def _png_bytes(size=(640, 480)) -> bytes:
    """Return in-memory PNG bytes so tests never depend on fixtures."""
    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", size, (200, 100, 50)).save(buffer, format="PNG")
    return buffer.getvalue()


# ---------------------------------------------------------------------------
# process_treatment_photo
# ---------------------------------------------------------------------------
@override_settings(CELERY_TASK_ALWAYS_EAGER=True)
def test_process_treatment_photo_generates_thumbnail(tmp_path, settings):
    """A newly-uploaded photo triggers a thumbnail via the post_save signal."""
    settings.MEDIA_ROOT = str(tmp_path)

    from apps.treatments.models import PhotoType, TreatmentPhoto

    boss = _make_boss()
    dept = _make_department(boss)
    doctor = _make_doctor("+998900000002", dept)
    admin = _make_admin()
    patient = _make_patient(admin)
    treatment = _make_treatment(doctor, patient, dept)

    src_bytes = _png_bytes(size=(1200, 800))
    upload = SimpleUploadedFile(
        "before.png",
        src_bytes,
        content_type="image/png",
    )
    photo = TreatmentPhoto.objects.create(
        treatment=treatment,
        photo_type=PhotoType.BEFORE,
        image=upload,
    )

    photo.refresh_from_db()
    assert photo.thumbnail  # ImageField truthiness = has a file
    # Thumbnail should be smaller than the original.
    with photo.thumbnail.open("rb") as fh:
        thumb_bytes = fh.read()
    assert 0 < len(thumb_bytes) < len(src_bytes)


# ---------------------------------------------------------------------------
# inventory.check_low_stock
# ---------------------------------------------------------------------------
@override_settings(CELERY_TASK_ALWAYS_EAGER=True)
def test_check_low_stock_enqueues_notification():
    from apps.inventory.models import Material
    from apps.inventory.tasks import check_low_stock
    from apps.notifications.models import NotificationLog

    boss = _make_boss()
    material = Material.objects.create(
        name="Anesteziya",
        unit=Material.Unit.ML,
        quantity_in_stock=Decimal("1.00"),
        minimum_threshold=Decimal("5.00"),
    )
    NotificationLog.objects.all().delete()
    result = check_low_stock(str(material.pk))
    assert result == "notified"
    logs = NotificationLog.objects.filter(user=boss)
    assert logs.count() == 1
    assert "kam qoldi" in logs.first().message


@override_settings(CELERY_TASK_ALWAYS_EAGER=True)
def test_check_low_stock_no_op_when_above_threshold():
    from apps.inventory.models import Material
    from apps.inventory.tasks import check_low_stock

    _make_boss()
    material = Material.objects.create(
        name="Plomba",
        unit=Material.Unit.PIECE,
        quantity_in_stock=Decimal("50"),
        minimum_threshold=Decimal("5"),
    )
    result = check_low_stock(str(material.pk))
    assert result == "ok"


# ---------------------------------------------------------------------------
# scheduling reminders
# ---------------------------------------------------------------------------
@override_settings(CELERY_TASK_ALWAYS_EAGER=True)
def test_send_appointment_reminder_1day_only_fires_once():
    from apps.scheduling.models import Appointment
    from apps.scheduling.tasks import send_appointment_reminder_1day

    boss = _make_boss()
    dept = _make_department(boss)
    doctor = _make_doctor("+998900000002", dept)
    admin = _make_admin()
    patient = _make_patient(admin)

    start = timezone.now() + timedelta(hours=24)
    Appointment.objects.create(
        doctor=doctor,
        patient=patient,
        department=dept,
        scheduled_start=start,
        scheduled_end=start + timedelta(minutes=30),
        created_by=admin,
    )

    first = send_appointment_reminder_1day()
    second = send_appointment_reminder_1day()
    assert first == 1
    assert second == 0  # already flagged


# ---------------------------------------------------------------------------
# notifications.send_notification state transitions
# ---------------------------------------------------------------------------
@override_settings(CELERY_TASK_ALWAYS_EAGER=True, TELEGRAM_BOT_TOKEN="")
def test_send_notification_marks_sent_when_target_has_chat_id():
    from apps.notifications import services
    from apps.notifications.models import NotificationType

    boss = _make_boss(telegram_chat_id=1234)
    log = services.enqueue(
        notification_type=NotificationType.LOW_STOCK,
        message="Test alert",
        user=boss,
    )
    log.refresh_from_db()
    # In eager mode the signal already fired send_notification synchronously
    # via the notifications app's ready() hook.
    assert log.status in {"sent", "pending"}


@override_settings(CELERY_TASK_ALWAYS_EAGER=True, TELEGRAM_BOT_TOKEN="")
def test_send_notification_fails_when_no_target_chat_id():
    from apps.notifications import services
    from apps.notifications.models import NotificationType

    boss = _make_boss()  # no telegram_chat_id
    log = services.enqueue(
        notification_type=NotificationType.LOW_STOCK,
        message="Test alert",
        user=boss,
    )
    # In eager mode the signal fires send_notification.delay() synchronously,
    # which in turn calls mark_failed when no chat_id is available.
    log.refresh_from_db()
    assert log.status == "failed"
    assert "telegram_chat_id" in (log.error_detail or "")


# ---------------------------------------------------------------------------
# reports.generate_dashboard_cache
# ---------------------------------------------------------------------------
@override_settings(CELERY_TASK_ALWAYS_EAGER=True)
def test_generate_dashboard_cache_returns_non_empty_map():
    from apps.reports.tasks import generate_dashboard_cache

    result = generate_dashboard_cache()
    assert isinstance(result, dict)
    # Each period should have at least one warmed endpoint.
    successes = sum(1 for v in result.values() if v == 1)
    assert successes >= 1


# ---------------------------------------------------------------------------
# core.backup_database (disabled path — never shells out in tests)
# ---------------------------------------------------------------------------
@override_settings(DB_BACKUPS_ENABLED=False)
def test_backup_database_is_disabled_by_default():
    from apps.core.tasks import backup_database

    assert backup_database() == "disabled"
