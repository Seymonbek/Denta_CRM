"""T133 — Orphan photo cleanup management command tests.

Verifies:

* Files with no matching :class:`TreatmentPhoto` row are removed.
* Files referenced by a live TreatmentPhoto row are preserved.
* Dry-run mode (default) doesn't touch disk.
* Soft-deleted TreatmentPhotos are still considered "live" (their
  files stay so the audit trail can recover them).
"""
from __future__ import annotations

import io
from decimal import Decimal
from pathlib import Path

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import override_settings
from PIL import Image

from apps.departments.models import Department
from apps.doctors.models import CommissionBasis, DoctorProfile, ProcedureType
from apps.patients.services import create_patient
from apps.treatments.models import PhotoType, TreatmentPhoto
from apps.treatments.services import create_treatment, upload_treatment_photo

pytestmark = pytest.mark.django_db

User = get_user_model()


# ---------------------------------------------------------------------------
# Fixtures — a treatment + one real photo file on disk
# ---------------------------------------------------------------------------
@pytest.fixture
def head_doctor():
    return User.objects.create_user(
        phone_number="+998900000001",
        password="StrongPass!123",
        first_name="Bosh",
        last_name="Shifokor",
        role=User.Role.BOSH_SHIFOKOR,
    )


@pytest.fixture
def doctor_user():
    return User.objects.create_user(
        phone_number="+998900000003",
        password="StrongPass!123",
        first_name="Doc",
        last_name="Tor",
        role=User.Role.DOCTOR,
    )


@pytest.fixture
def department(head_doctor):
    return Department.objects.create(
        name="Terapiya", description="", created_by=head_doctor
    )


@pytest.fixture
def doctor(doctor_user, department):
    profile = DoctorProfile.objects.create(
        user=doctor_user,
        specialization="Terapevt",
        commission_basis=CommissionBasis.FROM_TOTAL,
        default_commission_rate=Decimal("30.00"),
    )
    profile.departments.add(department)
    return profile


@pytest.fixture
def procedure_type(department):
    return ProcedureType.objects.create(
        name="Plomba",
        department=department,
        default_duration_minutes=30,
        default_price=Decimal("100000.00"),
    )


@pytest.fixture
def patient(head_doctor):
    return create_patient(
        first_name="Ali",
        last_name="Valiyev",
        phone_number="+998901111111",
        created_by=head_doctor,
    )


@pytest.fixture
def treatment(doctor, patient, department, procedure_type, head_doctor):
    return create_treatment(
        doctor=doctor,
        patient=patient,
        department=department,
        procedure_type=procedure_type,
        diagnosis="Karies",
        description="Test",
        created_by=head_doctor,
    )


def _real_png(name: str = "shot.png") -> SimpleUploadedFile:
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), color=(0, 128, 200)).save(buf, format="PNG")
    buf.seek(0)
    return SimpleUploadedFile(name, buf.read(), content_type="image/png")


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
def test_orphan_cleanup_removes_only_orphans(tmp_path, treatment, settings):
    """A file without a DB row is deleted; a file with one is preserved."""
    # Point MEDIA_ROOT at our local tmp dir so the test is self-contained.
    settings.MEDIA_ROOT = str(tmp_path)

    # 1. Upload a legitimate photo — creates a live TreatmentPhoto row.
    live_photo = upload_treatment_photo(
        treatment, photo_type=PhotoType.BEFORE, image=_real_png("live.png")
    )
    live_path = Path(settings.MEDIA_ROOT) / live_photo.image.name
    assert live_path.exists(), "live photo must exist on disk"

    # 2. Plant an orphan directory + file (no matching row).
    orphan_dir = Path(settings.MEDIA_ROOT) / "treatments" / "ffffffff-orphan"
    orphan_dir.mkdir(parents=True, exist_ok=True)
    orphan_file = orphan_dir / "orphan.png"
    orphan_file.write_bytes(b"junk")
    assert orphan_file.exists()

    # 3. Run cleanup in --apply mode.
    call_command("orphan_photo_cleanup", "--apply", verbosity=0)

    # Live photo survives.
    assert live_path.exists(), "live photo must NOT be deleted"
    # Orphan is gone.
    assert not orphan_file.exists(), "orphan file must be deleted"
    assert not orphan_dir.exists(), "empty orphan directory must be removed"


def test_orphan_cleanup_dry_run_is_noop(tmp_path, settings):
    """Without --apply the command must not touch disk."""
    settings.MEDIA_ROOT = str(tmp_path)
    orphan_dir = Path(settings.MEDIA_ROOT) / "treatments" / "aaaa-orphan"
    orphan_dir.mkdir(parents=True, exist_ok=True)
    orphan_file = orphan_dir / "still-here.png"
    orphan_file.write_bytes(b"junk")

    # Dry-run (default).
    call_command("orphan_photo_cleanup", verbosity=0)

    assert orphan_file.exists()
    assert orphan_dir.exists()


def test_orphan_cleanup_preserves_soft_deleted_photo(tmp_path, treatment, settings):
    """Soft-deleted photos (is_active=False) are considered live."""
    settings.MEDIA_ROOT = str(tmp_path)

    photo = upload_treatment_photo(
        treatment,
        photo_type=PhotoType.AFTER,
        image=_real_png("soft.png"),
    )
    # Soft delete the row (but keep the file).
    photo.is_active = False
    photo.save(update_fields=["is_active", "updated_at"])
    live_path = Path(settings.MEDIA_ROOT) / photo.image.name
    assert live_path.exists()

    call_command("orphan_photo_cleanup", "--apply", verbosity=0)

    assert live_path.exists(), "soft-deleted photos must be preserved"


def test_orphan_cleanup_handles_missing_target_dir(tmp_path, settings):
    """No-op with a friendly message when MEDIA_ROOT/treatments is absent."""
    settings.MEDIA_ROOT = str(tmp_path)
    # Do NOT create /treatments/ under tmp_path.
    # The command must run without raising.
    call_command("orphan_photo_cleanup", "--apply", verbosity=0)
