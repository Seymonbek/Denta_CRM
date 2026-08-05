"""Tests for the ``notifications`` app (T21).

Covers:

* ``services.enqueue`` — creates pending row, dispatches signal, honours
  target-constraint (needs user OR patient).
* ``services.mark_sent`` / ``services.mark_failed`` — state-machine
  transitions and idempotence.
* ``services.bulk_enqueue`` — fans out to multiple targets.
* Read API — RBAC visibility, ``?status=``, ``?unread_only=true``
  filter, and standard error envelope for anonymous access.
* Integration — inventory low-stock signal enqueues a
  ``inventory.low_stock`` notification for every active bosh_shifokor.
"""
from __future__ import annotations

from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from apps.inventory.models import MaterialUnit
from apps.inventory.services import (
    adjust_stock,
    create_material,
    record_usage,
)
from apps.notifications import services as notifications_services
from apps.notifications.models import (
    NotificationChannel,
    NotificationLog,
    NotificationStatus,
    NotificationType,
)
from apps.notifications.signals import notification_enqueued
from apps.patients.services import create_patient

pytestmark = pytest.mark.django_db

User = get_user_model()

NOTIFS_URL = "/api/v1/notifications/"


# ===========================================================================
# Fixtures
# ===========================================================================
@pytest.fixture
def head_doctor(db):
    return User.objects.create_user(
        phone_number="+998900000101",
        password="pass12345",
        first_name="Bosh",
        last_name="Shifokor",
        role="bosh_shifokor",
    )


@pytest.fixture
def doctor(db):
    return User.objects.create_user(
        phone_number="+998900000102",
        password="pass12345",
        first_name="Doktor",
        last_name="Karimov",
        role="doctor",
    )


@pytest.fixture
def administrator(db):
    return User.objects.create_user(
        phone_number="+998900000103",
        password="pass12345",
        first_name="Admin",
        last_name="Ismoilova",
        role="administrator",
    )


@pytest.fixture
def patient(db, administrator):
    return create_patient(
        first_name="Bemor",
        last_name="Testov",
        phone_number="+998900000201",
        created_by=administrator,
    )


def _api(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


# ===========================================================================
# services.enqueue
# ===========================================================================
class TestEnqueue:
    def test_creates_pending_row_and_dispatches_signal(self, head_doctor):
        received: list[dict] = []

        def _handler(sender, instance, context, **kwargs):
            received.append({"instance": instance, "context": context})

        notification_enqueued.connect(_handler, dispatch_uid="test-enqueue")
        try:
            log = notifications_services.enqueue(
                notification_type=NotificationType.LOW_STOCK,
                message="Material X kam qoldi",
                user=head_doctor,
                context={"material_id": "abc"},
            )
        finally:
            notification_enqueued.disconnect(dispatch_uid="test-enqueue")

        assert isinstance(log, NotificationLog)
        assert log.status == NotificationStatus.PENDING
        assert log.channel == NotificationChannel.TELEGRAM
        assert log.type == NotificationType.LOW_STOCK
        assert log.user_id == head_doctor.id
        assert log.context == {"material_id": "abc"}
        assert log.sent_at is None
        assert received and received[0]["instance"].pk == log.pk

    def test_requires_target(self, head_doctor):
        with pytest.raises(Exception) as exc:
            notifications_services.enqueue(
                notification_type=NotificationType.GENERIC,
                message="No target",
            )
        # DRF ValidationError inherits from django's; str check for stability.
        assert "manzil" in str(exc.value) or "user yoki patient" in str(exc.value)

    def test_rejects_empty_message(self, head_doctor):
        with pytest.raises(Exception):
            notifications_services.enqueue(
                notification_type=NotificationType.GENERIC,
                message="   ",
                user=head_doctor,
            )

    def test_rejects_unknown_channel(self, head_doctor):
        with pytest.raises(Exception):
            notifications_services.enqueue(
                notification_type=NotificationType.GENERIC,
                message="Hi",
                user=head_doctor,
                channel="pigeon",
            )


# ===========================================================================
# mark_sent / mark_failed
# ===========================================================================
class TestStateMachine:
    def test_mark_sent_transitions_and_stamps_time(self, head_doctor):
        log = notifications_services.enqueue(
            notification_type=NotificationType.GENERIC,
            message="Hi",
            user=head_doctor,
        )
        updated = notifications_services.mark_sent(log, external_message_id="tg-42")
        assert updated.status == NotificationStatus.SENT
        assert updated.sent_at is not None
        assert updated.external_message_id == "tg-42"

    def test_mark_sent_is_idempotent(self, head_doctor):
        log = notifications_services.enqueue(
            notification_type=NotificationType.GENERIC,
            message="Hi",
            user=head_doctor,
        )
        first = notifications_services.mark_sent(log)
        second = notifications_services.mark_sent(log)
        assert first.pk == second.pk
        assert second.sent_at == first.sent_at

    def test_mark_failed_transitions(self, head_doctor):
        log = notifications_services.enqueue(
            notification_type=NotificationType.GENERIC,
            message="Hi",
            user=head_doctor,
        )
        updated = notifications_services.mark_failed(
            log, error_detail="Chat is closed"
        )
        assert updated.status == NotificationStatus.FAILED
        assert updated.error_detail == "Chat is closed"

    def test_sent_cannot_flip_to_failed(self, head_doctor):
        log = notifications_services.enqueue(
            notification_type=NotificationType.GENERIC,
            message="Hi",
            user=head_doctor,
        )
        notifications_services.mark_sent(log)
        with pytest.raises(Exception):
            notifications_services.mark_failed(log, error_detail="oops")


# ===========================================================================
# bulk_enqueue
# ===========================================================================
class TestBulkEnqueue:
    def test_creates_row_per_target(self, head_doctor, doctor):
        rows = notifications_services.bulk_enqueue(
            notification_type=NotificationType.RATING_MILESTONE,
            message="Yangi yutuq!",
            targets=[{"user": head_doctor}, {"user": doctor}],
            context={"badge": "gold"},
        )
        assert len(rows) == 2
        assert {row.user_id for row in rows} == {head_doctor.id, doctor.id}
        assert all(row.context == {"badge": "gold"} for row in rows)


# ===========================================================================
# Read API — RBAC + filters
# ===========================================================================
class TestReadApi:
    def _seed(self, head_doctor, doctor, patient):
        head_log = notifications_services.enqueue(
            notification_type=NotificationType.LOW_STOCK,
            message="Material X kam qoldi",
            user=head_doctor,
        )
        doctor_log = notifications_services.enqueue(
            notification_type=NotificationType.APPOINTMENT_REMINDER_1D,
            message="Ertaga navbat bor",
            user=doctor,
        )
        patient_log = notifications_services.enqueue(
            notification_type=NotificationType.PRESCRIPTION_SENT,
            message="Retseptingiz yuborildi",
            patient=patient,
        )
        return head_log, doctor_log, patient_log

    def test_bosh_shifokor_sees_all(self, head_doctor, doctor, patient):
        self._seed(head_doctor, doctor, patient)
        resp = _api(head_doctor).get(NOTIFS_URL)
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["count"] == 3

    def test_doctor_sees_own_and_patient_rows(self, head_doctor, doctor, patient):
        head_log, doctor_log, patient_log = self._seed(head_doctor, doctor, patient)
        resp = _api(doctor).get(NOTIFS_URL)
        assert resp.status_code == status.HTTP_200_OK
        ids = {row["id"] for row in resp.data["results"]}
        assert str(head_log.id) not in ids
        assert str(doctor_log.id) in ids
        assert str(patient_log.id) in ids

    def test_administrator_sees_own_and_patient_rows(
        self, head_doctor, doctor, patient, administrator
    ):
        head_log, doctor_log, patient_log = self._seed(head_doctor, doctor, patient)
        # Also give admin their own row so we can prove RBAC filtering.
        admin_log = notifications_services.enqueue(
            notification_type=NotificationType.NEW_PATIENT,
            message="Yangi bemor ro'yxatga olindi",
            user=administrator,
        )
        resp = _api(administrator).get(NOTIFS_URL)
        assert resp.status_code == status.HTTP_200_OK
        ids = {row["id"] for row in resp.data["results"]}
        assert str(admin_log.id) in ids
        assert str(patient_log.id) in ids
        assert str(head_log.id) not in ids
        assert str(doctor_log.id) not in ids

    def test_unread_only_filter(self, head_doctor, doctor, patient):
        head_log, _, _ = self._seed(head_doctor, doctor, patient)
        # Mark one row as sent so it drops from ``unread_only``.
        notifications_services.mark_sent(head_log)
        resp = _api(head_doctor).get(f"{NOTIFS_URL}?unread_only=true")
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["count"] == 2
        assert all(
            row["status"] == NotificationStatus.PENDING
            for row in resp.data["results"]
        )

    def test_type_filter(self, head_doctor, doctor, patient):
        self._seed(head_doctor, doctor, patient)
        resp = _api(head_doctor).get(f"{NOTIFS_URL}?type=inventory.low_stock")
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["count"] == 1
        assert resp.data["results"][0]["type"] == NotificationType.LOW_STOCK

    def test_writes_are_forbidden(self, head_doctor):
        resp = _api(head_doctor).post(
            NOTIFS_URL,
            {
                "type": NotificationType.GENERIC,
                "message": "hi",
                "userId": str(head_doctor.id),
            },
            format="json",
        )
        # NotificationPermission blocks non-safe methods.
        assert resp.status_code in {
            status.HTTP_403_FORBIDDEN,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        }

    def test_anonymous_gets_standard_error_envelope(self):
        resp = APIClient().get(NOTIFS_URL)
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED
        assert "error" in resp.data
        assert resp.data["error"]["code"] == "NOT_AUTHENTICATED"


# ===========================================================================
# Inventory integration — low_stock alert
# ===========================================================================
class TestInventoryLowStockIntegration:
    """Guarantees the guarded hook in ``inventory.services`` now
    actually enqueues a real NotificationLog per bosh_shifokor."""

    def test_low_stock_via_usage_fires_notification(
        self,
        head_doctor,
        doctor,
        administrator,
        patient,
    ):
        from datetime import timedelta

        from django.utils import timezone

        from apps.departments.models import Department
        from apps.doctors.models import CommissionBasis, DoctorProfile
        from apps.scheduling.services import create_appointment
        from apps.treatments.services import create_treatment

        department = Department.objects.create(
            name="Terapiya", description="", created_by=head_doctor
        )
        profile = DoctorProfile.objects.create(
            user=doctor,
            specialization="Terapevt",
            commission_basis=CommissionBasis.FROM_TOTAL,
            default_commission_rate=Decimal("30.00"),
        )
        profile.departments.add(department)

        start = timezone.now() + timedelta(days=1)
        start = start.replace(hour=10, minute=0, second=0, microsecond=0)
        appt = create_appointment(
            patient=patient,
            doctor=profile,
            department=department,
            scheduled_start=start,
            scheduled_end=start + timedelta(minutes=30),
            created_by=head_doctor,
        )
        treatment = create_treatment(
            appointment=appt,
            doctor=profile,
            patient=patient,
            department=department,
            diagnosis="Karies",
            description="Muvaqqat plomba",
            price=Decimal("120000"),
        )

        material = create_material(
            name="Anestetik",
            unit=MaterialUnit.ML,
            quantity_in_stock=Decimal("2.000"),
            minimum_threshold=Decimal("1.000"),
        )

        # Consuming 1.5 ml drops stock to 0.5 which is < 1 threshold.
        assert (
            NotificationLog.objects.filter(type=NotificationType.LOW_STOCK).count()
            == 0
        )
        record_usage(
            treatment=treatment,
            material=material,
            quantity_used=Decimal("1.500"),
            recorded_by=doctor,
        )
        material.refresh_from_db()
        assert material.quantity_in_stock == Decimal("0.500")

        alerts = NotificationLog.objects.filter(
            type=NotificationType.LOW_STOCK,
            user=head_doctor,
        )
        assert alerts.exists()
        alert = alerts.first()
        assert alert.status == NotificationStatus.PENDING
        assert alert.context["material_id"] == str(material.pk)

    def test_above_threshold_does_not_notify(self, head_doctor):
        material = create_material(
            name="Rulon paxta",
            unit=MaterialUnit.PIECE,
            quantity_in_stock=Decimal("50.000"),
            minimum_threshold=Decimal("10.000"),
        )
        # Positive adjustment keeps stock high — no low-stock alert.
        adjust_stock(material, delta=Decimal("5.000"), performed_by=head_doctor)
        assert not NotificationLog.objects.filter(
            type=NotificationType.LOW_STOCK
        ).exists()
