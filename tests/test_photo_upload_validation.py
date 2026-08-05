"""T130 — Treatment photo upload validation tests.

Verifies :func:`apps.treatments.services.upload_treatment_photo`
rejects unsafe uploads:

* Oversized files (> ``settings.MAX_PHOTO_MB`` MiB).
* Denied MIME types (SVG explicitly — it can carry inline scripts).
* Non-image MIME types (application/pdf, text/html).
* Disallowed extensions (.gif, .bmp, ...).
* Corrupted / fake-header bytes (extension says .png but bytes are junk).
* Accepts valid JPEG, PNG, WEBP uploads.
"""
from __future__ import annotations

import io
from decimal import Decimal
from datetime import datetime, time, timedelta

import pytest
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from PIL import Image

from apps.departments.models import Department
from apps.doctors.models import CommissionBasis, DoctorProfile, ProcedureType
from apps.patients.services import create_patient
from apps.treatments.services import (
    ALLOWED_PHOTO_EXTENSIONS,
    ALLOWED_PHOTO_MIME_TYPES,
    DENIED_PHOTO_MIME_TYPES,
    create_treatment,
    upload_treatment_photo,
)


User = get_user_model()

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Fixtures — a treatment ready to attach a photo to.
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


# ---------------------------------------------------------------------------
# Image helpers
# ---------------------------------------------------------------------------
def _real_image(
    fmt: str,
    name: str,
    content_type: str,
    *,
    size: tuple[int, int] = (16, 16),
) -> SimpleUploadedFile:
    """Return a genuine Pillow-generated image bytes wrapped in a file."""
    buf = io.BytesIO()
    Image.new("RGB", size, color=(0, 128, 200)).save(buf, format=fmt)
    buf.seek(0)
    return SimpleUploadedFile(name, buf.read(), content_type=content_type)


def _junk_bytes(name: str, content_type: str) -> SimpleUploadedFile:
    """Fake header — extension/content-type claim image, bytes are junk."""
    return SimpleUploadedFile(name, b"not-a-real-image-payload", content_type=content_type)


# ---------------------------------------------------------------------------
# Happy path — JPEG / PNG / WEBP
# ---------------------------------------------------------------------------
def test_upload_accepts_valid_jpeg(treatment):
    upload = _real_image("JPEG", "before.jpg", "image/jpeg")
    photo = upload_treatment_photo(
        treatment, photo_type="before", image=upload, caption="OK"
    )
    assert photo.pk is not None
    assert photo.photo_type == "before"


def test_upload_accepts_valid_png(treatment):
    upload = _real_image("PNG", "after.png", "image/png")
    photo = upload_treatment_photo(
        treatment, photo_type="after", image=upload
    )
    assert photo.pk is not None


def test_upload_accepts_valid_webp(treatment):
    upload = _real_image("WEBP", "shot.webp", "image/webp")
    photo = upload_treatment_photo(
        treatment, photo_type="xray", image=upload
    )
    assert photo.pk is not None


# ---------------------------------------------------------------------------
# Rejections
# ---------------------------------------------------------------------------
def test_upload_rejects_svg_by_mime(treatment):
    """SVG is explicitly denied even though it starts with valid XML."""
    body = (
        b'<?xml version="1.0"?>'
        b'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">'
        b'<script>alert(1)</script></svg>'
    )
    upload = SimpleUploadedFile("evil.svg", body, content_type="image/svg+xml")
    with pytest.raises(ValidationError) as excinfo:
        upload_treatment_photo(
            treatment, photo_type="before", image=upload
        )
    # Message mentions the file type or is under the image field.
    assert "image" in excinfo.value.message_dict


def test_upload_rejects_pdf_disguised_as_image(treatment):
    body = b"%PDF-1.4\n%fake content"
    upload = SimpleUploadedFile("resume.pdf", body, content_type="application/pdf")
    with pytest.raises(ValidationError):
        upload_treatment_photo(
            treatment, photo_type="before", image=upload
        )


def test_upload_rejects_html_bomb(treatment):
    body = b"<html><script>alert(1)</script></html>"
    upload = SimpleUploadedFile("evil.html", body, content_type="text/html")
    with pytest.raises(ValidationError):
        upload_treatment_photo(
            treatment, photo_type="before", image=upload
        )


def test_upload_rejects_wrong_extension(treatment):
    """GIF bytes ≠ allow-list. Even a real GIF must be refused."""
    upload = _real_image("GIF", "anim.gif", "image/gif")
    with pytest.raises(ValidationError):
        upload_treatment_photo(
            treatment, photo_type="before", image=upload
        )


def test_upload_rejects_fake_header_bytes(treatment):
    """Extension + content-type claim image/jpeg but bytes are junk."""
    upload = _junk_bytes("fake.jpg", "image/jpeg")
    with pytest.raises(ValidationError) as excinfo:
        upload_treatment_photo(
            treatment, photo_type="before", image=upload
        )
    assert "image" in excinfo.value.message_dict


def test_upload_rejects_oversized_photo(treatment, settings):
    """A > MAX_PHOTO_MB body is rejected before storage."""
    # Reduce cap to 1 MiB and push a 2 MiB payload through.
    settings.MAX_PHOTO_MB = 1
    # Random noise defeats JPEG compression, so the encoded output is
    # comfortably above 1 MiB even for modest dimensions.
    import random
    random.seed(42)
    from PIL import Image as _Image
    noise = _Image.new("RGB", (1200, 1200))
    noise.putdata(
        [(random.randint(0, 255), random.randint(0, 255), random.randint(0, 255))
         for _ in range(1200 * 1200)]
    )
    buf = io.BytesIO()
    noise.save(buf, format="JPEG", quality=100, subsampling=0)
    buf.seek(0)
    body = buf.read()
    assert len(body) > 1 * 1024 * 1024, (
        f"test fixture must exceed cap; got {len(body)} bytes"
    )
    upload = SimpleUploadedFile("big.jpg", body, content_type="image/jpeg")
    with pytest.raises(ValidationError) as excinfo:
        upload_treatment_photo(
            treatment, photo_type="before", image=upload
        )
    assert "image" in excinfo.value.message_dict


def test_upload_rejects_empty_image(treatment):
    with pytest.raises(ValidationError):
        upload_treatment_photo(
            treatment, photo_type="before", image=None
        )


# ---------------------------------------------------------------------------
# Constants — guards against accidental widening.
# ---------------------------------------------------------------------------
def test_allowed_mime_set_is_closed_and_safe():
    assert ALLOWED_PHOTO_MIME_TYPES == frozenset(
        {"image/jpeg", "image/png", "image/webp"}
    )


def test_denied_mime_set_includes_svg():
    assert "image/svg+xml" in DENIED_PHOTO_MIME_TYPES


def test_allowed_extensions_all_lowercase():
    for ext in ALLOWED_PHOTO_EXTENSIONS:
        assert ext.startswith(".")
        assert ext.lower() == ext
