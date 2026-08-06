"""Tests for the ``seed_demo_data`` management command."""
from __future__ import annotations

from io import StringIO

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command

pytestmark = pytest.mark.django_db


User = get_user_model()


def test_dry_run_does_not_write_to_db():
    call_command("seed_demo_data", "--dry-run")
    assert User.objects.count() == 0


def test_seed_creates_expected_counts():
    call_command("seed_demo_data")
    # 1 bosh + 2 doctors + 1 admin = 4 users; patients & departments live in
    # their own models — check user roles directly.
    assert User.objects.filter(role=User.Role.BOSH_SHIFOKOR).count() == 1
    assert User.objects.filter(role=User.Role.DOCTOR).count() == 2
    assert User.objects.filter(role=User.Role.ADMINISTRATOR).count() == 1

    from apps.departments.models import Department
    from apps.doctors.models import DoctorProfile, ProcedureType, WorkingHours
    from apps.patients.models import Patient
    from apps.scheduling.models import Appointment

    assert Department.objects.count() == 2
    assert DoctorProfile.objects.count() == 2
    assert ProcedureType.objects.count() == 4
    assert Patient.objects.count() == 10
    # Working hours: 2 doctors × 5 weekdays = 10 rows.
    assert WorkingHours.objects.count() == 10
    # 5 appointments scheduled.
    assert Appointment.objects.count() == 5


def test_seed_is_idempotent():
    out = StringIO()
    call_command("seed_demo_data")
    call_command("seed_demo_data", stdout=out)
    # Second run must short-circuit and not create extra users.
    assert "already exists" in out.getvalue()
    assert User.objects.filter(role=User.Role.DOCTOR).count() == 2


def test_seed_wipe_flag_resets_and_recreates():
    call_command("seed_demo_data")
    call_command("seed_demo_data", "--wipe")
    assert User.objects.filter(role=User.Role.BOSH_SHIFOKOR).count() == 1
