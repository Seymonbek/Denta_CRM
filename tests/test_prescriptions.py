"""Tests for the ``prescriptions`` app (T14).

Covers PROJECT_BRIEF acceptance criteria:

* #6 CRUD — templates: list/create/retrieve/update/delete.
* #10 Retsept Telegram orqali bemorga yuboriladi — the ``send`` path
  sets ``sentToTelegramAt`` when the sender succeeds and leaves it
  ``None`` otherwise.
* #4 RBAC — bosh_shifokor writes anywhere; doctor writes own; admin
  reads only; anonymous rejected.
* Standard error envelope + camelCase serialisation.
* Filters — ``?treatment=&patient=&doctor=&is_sent=``.
* Placeholder substitution — {patient_name}, {doctor_name}, {diagnosis}.
"""
from __future__ import annotations

from datetime import datetime, time, timedelta
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.departments.models import Department
from apps.doctors.models import CommissionBasis, DoctorProfile, ProcedureType
from apps.patients.services import create_patient
from apps.prescriptions.models import Prescription, PrescriptionTemplate
from apps.prescriptions.selectors import (
    active_templates,
    filter_prescriptions,
    prescriptions_for_patient,
    prescriptions_for_treatment,
    template_by_id,
    templates_for_user,
)
from apps.prescriptions.services import (
    create_prescription_for_treatment,
    create_prescription_template,
    mark_prescription_sent,
    soft_delete_prescription,
    soft_delete_template,
    update_prescription_template,
)
from apps.scheduling.services import create_appointment
from apps.treatments.services import create_treatment

pytestmark = pytest.mark.django_db

User = get_user_model()

TEMPLATES_URL = "/api/v1/prescription-templates/"
PRESCRIPTIONS_URL = "/api/v1/prescriptions/"


# ===========================================================================
# Fixtures
# ===========================================================================
@pytest.fixture
def head_doctor():
    return User.objects.create_user(
        phone_number="+998900000101",
        password="StrongPass!123",
        first_name="Bosh",
        last_name="Shifokor",
        role=User.Role.BOSH_SHIFOKOR,
    )


@pytest.fixture
def administrator():
    return User.objects.create_user(
        phone_number="+998900000102",
        password="StrongPass!123",
        first_name="Adm",
        last_name="In",
        role=User.Role.ADMINISTRATOR,
    )


@pytest.fixture
def doctor_user():
    return User.objects.create_user(
        phone_number="+998900000103",
        password="StrongPass!123",
        first_name="Doc",
        last_name="Tor",
        role=User.Role.DOCTOR,
    )


@pytest.fixture
def other_doctor_user():
    return User.objects.create_user(
        phone_number="+998900000104",
        password="StrongPass!123",
        first_name="Other",
        last_name="Doc",
        role=User.Role.DOCTOR,
    )


@pytest.fixture
def department(head_doctor):
    return Department.objects.create(
        name="Terapiya", description="Test", created_by=head_doctor
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
def other_doctor(other_doctor_user, department):
    profile = DoctorProfile.objects.create(
        user=other_doctor_user,
        specialization="Boshqa",
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
def patient(administrator):
    return create_patient(
        first_name="Ali",
        last_name="Valiyev",
        phone_number="+998901111111",
        telegram_chat_id="12345",
        created_by=administrator,
    )


@pytest.fixture
def patient_without_telegram(administrator):
    return create_patient(
        first_name="Bek",
        last_name="Karimov",
        phone_number="+998902222222",
        created_by=administrator,
    )


@pytest.fixture
def appointment(patient, doctor, department, procedure_type, administrator):
    tz = timezone.get_current_timezone()
    start = timezone.make_aware(
        datetime.combine(
            timezone.localdate() + timedelta(days=1), time(10, 0)
        ),
        tz,
    )
    end = start + timedelta(minutes=30)
    return create_appointment(
        patient=patient,
        doctor=doctor,
        department=department,
        procedure_type=procedure_type,
        scheduled_start=start,
        scheduled_end=end,
        created_by=administrator,
    )


@pytest.fixture
def treatment(patient, doctor, department, procedure_type, appointment, head_doctor):
    return create_treatment(
        doctor=doctor,
        patient=patient,
        department=department,
        procedure_type=procedure_type,
        appointment=appointment,
        diagnosis="Kariyes",
        description="Plomba qo'yildi",
        price=Decimal("120000.00"),
        created_by=head_doctor,
    )


@pytest.fixture
def treatment_no_telegram(
    patient_without_telegram, doctor, department, procedure_type, head_doctor
):
    return create_treatment(
        doctor=doctor,
        patient=patient_without_telegram,
        department=department,
        procedure_type=procedure_type,
        diagnosis="Kariyes",
        price=Decimal("100000.00"),
        created_by=head_doctor,
    )


@pytest.fixture
def other_treatment(patient, other_doctor, department, procedure_type, head_doctor):
    return create_treatment(
        doctor=other_doctor,
        patient=patient,
        department=department,
        procedure_type=procedure_type,
        diagnosis="Kariyes 2",
        price=Decimal("80000.00"),
        created_by=head_doctor,
    )


@pytest.fixture
def api_client():
    return APIClient()


def _auth(client: APIClient, user) -> APIClient:
    client.force_authenticate(user=user)
    return client


# ===========================================================================
# Model tests
# ===========================================================================
class TestPrescriptionTemplateModel:
    def test_str(self, head_doctor):
        tpl = PrescriptionTemplate.objects.create(
            name="Analgin",
            content="1 tabletka kuniga 3 marta",
            created_by=head_doctor,
        )
        assert "Analgin" in str(tpl)

    def test_unique_name_per_owner(self, head_doctor):
        from django.db import IntegrityError

        PrescriptionTemplate.objects.create(
            name="Duplicate",
            content="x",
            created_by=head_doctor,
        )
        with pytest.raises(IntegrityError):
            PrescriptionTemplate.objects.create(
                name="Duplicate",
                content="y",
                created_by=head_doctor,
            )


class TestPrescriptionModel:
    def test_is_sent_property(self, treatment):
        p = Prescription.objects.create(
            treatment=treatment,
            content="Test",
        )
        assert p.is_sent is False
        p.sent_to_telegram_at = timezone.now()
        p.save()
        assert p.is_sent is True

    def test_str(self, treatment):
        p = Prescription.objects.create(treatment=treatment, content="X")
        assert str(treatment.pk) in str(p)


# ===========================================================================
# Service tests — template CRUD
# ===========================================================================
class TestTemplateServices:
    def test_create_template(self, head_doctor):
        tpl = create_prescription_template(
            name="Analgin",
            content="1 tabletka",
            created_by=head_doctor,
        )
        assert tpl.name == "Analgin"
        assert tpl.content == "1 tabletka"
        assert tpl.created_by_id == head_doctor.id

    def test_create_template_strips_whitespace(self, head_doctor):
        tpl = create_prescription_template(
            name="  Padded  ",
            content="  Body  ",
            created_by=head_doctor,
        )
        assert tpl.name == "Padded"
        assert tpl.content == "Body"

    def test_create_template_requires_name(self, head_doctor):
        with pytest.raises(ValidationError):
            create_prescription_template(name="", content="x", created_by=head_doctor)

    def test_create_template_requires_content(self, head_doctor):
        with pytest.raises(ValidationError):
            create_prescription_template(name="X", content="", created_by=head_doctor)

    def test_create_template_rejects_duplicate_name(self, head_doctor):
        create_prescription_template(
            name="Same", content="a", created_by=head_doctor
        )
        with pytest.raises(ValidationError):
            create_prescription_template(
                name="Same", content="b", created_by=head_doctor
            )

    def test_different_owners_can_share_name(self, head_doctor, doctor_user):
        t1 = create_prescription_template(
            name="Shared", content="a", created_by=head_doctor
        )
        t2 = create_prescription_template(
            name="Shared", content="b", created_by=doctor_user
        )
        assert t1.pk != t2.pk

    def test_update_template(self, head_doctor):
        tpl = create_prescription_template(
            name="Old", content="old body", created_by=head_doctor
        )
        updated = update_prescription_template(tpl, name="New", content="new body")
        assert updated.name == "New"
        assert updated.content == "new body"

    def test_soft_delete_template(self, head_doctor):
        tpl = create_prescription_template(
            name="Kill", content="x", created_by=head_doctor
        )
        soft_delete_template(tpl)
        tpl.refresh_from_db()
        assert tpl.is_active is False


# ===========================================================================
# Service tests — prescription issue
# ===========================================================================
class TestPrescriptionServices:
    def test_create_from_content(self, treatment, head_doctor):
        p = create_prescription_for_treatment(
            treatment=treatment,
            content="Ibuprofen 400mg",
            created_by=head_doctor,
            send=False,
        )
        assert p.content == "Ibuprofen 400mg"
        assert p.template is None
        assert p.treatment_id == treatment.pk
        assert p.sent_to_telegram_at is None
        assert p.created_by_id == head_doctor.id

    def test_create_from_template(self, treatment, head_doctor):
        tpl = create_prescription_template(
            name="Std",
            content="Amoksitsillin 500mg 3 marta",
            created_by=head_doctor,
        )
        p = create_prescription_for_treatment(
            treatment=treatment,
            template=tpl,
            created_by=head_doctor,
            send=False,
        )
        assert p.template_id == tpl.pk
        assert p.content == "Amoksitsillin 500mg 3 marta"

    def test_placeholder_substitution(self, treatment, head_doctor):
        p = create_prescription_for_treatment(
            treatment=treatment,
            content="Hurmatli {patient_name}, {diagnosis} uchun retsept.",
            created_by=head_doctor,
            send=False,
        )
        assert "Ali Valiyev" in p.content
        assert "Kariyes" in p.content
        assert "{patient_name}" not in p.content
        assert "{diagnosis}" not in p.content

    def test_doctor_name_placeholder(self, treatment, head_doctor):
        p = create_prescription_for_treatment(
            treatment=treatment,
            content="Shifokor: {doctor_name}",
            created_by=head_doctor,
            send=False,
        )
        assert "Doc Tor" in p.content

    def test_requires_content_or_template(self, treatment, head_doctor):
        with pytest.raises(ValidationError):
            create_prescription_for_treatment(
                treatment=treatment,
                content=None,
                template=None,
                created_by=head_doctor,
                send=False,
            )

    def test_content_from_template_can_be_overridden(self, treatment, head_doctor):
        tpl = create_prescription_template(
            name="Std",
            content="Default body",
            created_by=head_doctor,
        )
        p = create_prescription_for_treatment(
            treatment=treatment,
            template=tpl,
            content="Override body",
            created_by=head_doctor,
            send=False,
        )
        assert p.template_id == tpl.pk
        assert p.content == "Override body"

    def test_content_stored_verbatim_after_template_edit(
        self, treatment, head_doctor
    ):
        tpl = create_prescription_template(
            name="Std",
            content="Original body",
            created_by=head_doctor,
        )
        p = create_prescription_for_treatment(
            treatment=treatment,
            template=tpl,
            created_by=head_doctor,
            send=False,
        )
        # Later edit to the template must not rewrite the retsept.
        update_prescription_template(tpl, content="Edited body")
        p.refresh_from_db()
        assert p.content == "Original body"

    def test_missing_telegram_leaves_sent_none(
        self, treatment_no_telegram, head_doctor
    ):
        p = create_prescription_for_treatment(
            treatment=treatment_no_telegram,
            content="Ibuprofen",
            created_by=head_doctor,
            send=True,  # requested, but chat_id missing
        )
        assert p.sent_to_telegram_at is None

    def test_send_success_sets_sent_at(self, treatment, head_doctor):
        # Patch the internal helper to simulate a successful bot delivery.
        with patch(
            "apps.prescriptions.services._send_via_telegram", return_value=True
        ):
            p = create_prescription_for_treatment(
                treatment=treatment,
                content="Ibuprofen",
                created_by=head_doctor,
                send=True,
            )
        assert p.sent_to_telegram_at is not None

    def test_send_disabled_leaves_sent_none(self, treatment, head_doctor):
        with patch(
            "apps.prescriptions.services._send_via_telegram", return_value=True
        ) as fake:
            p = create_prescription_for_treatment(
                treatment=treatment,
                content="Ibuprofen",
                created_by=head_doctor,
                send=False,
            )
            fake.assert_not_called()
        assert p.sent_to_telegram_at is None

    def test_mark_sent_manually(self, treatment, head_doctor):
        p = create_prescription_for_treatment(
            treatment=treatment,
            content="X",
            created_by=head_doctor,
            send=False,
        )
        assert p.sent_to_telegram_at is None
        mark_prescription_sent(p)
        p.refresh_from_db()
        assert p.sent_to_telegram_at is not None

    def test_soft_delete_prescription(self, treatment, head_doctor):
        p = create_prescription_for_treatment(
            treatment=treatment,
            content="X",
            created_by=head_doctor,
            send=False,
        )
        soft_delete_prescription(p)
        p.refresh_from_db()
        assert p.is_active is False


# ===========================================================================
# Selector tests
# ===========================================================================
class TestSelectors:
    def test_active_templates_excludes_inactive(self, head_doctor):
        active = create_prescription_template(
            name="A", content="x", created_by=head_doctor
        )
        gone = create_prescription_template(
            name="B", content="x", created_by=head_doctor
        )
        soft_delete_template(gone)
        assert active in active_templates()
        assert gone not in active_templates()

    def test_template_by_id(self, head_doctor):
        tpl = create_prescription_template(
            name="X", content="x", created_by=head_doctor
        )
        assert template_by_id(tpl.pk) == tpl
        assert template_by_id("00000000-0000-0000-0000-000000000000") is None

    def test_templates_for_user_orders_own_first(self, head_doctor, doctor_user):
        other = create_prescription_template(
            name="B-other", content="x", created_by=head_doctor
        )
        own = create_prescription_template(
            name="A-own", content="x", created_by=doctor_user
        )
        results = list(templates_for_user(doctor_user.id))
        assert results.index(own) < results.index(other)

    def test_prescriptions_for_treatment(self, treatment, head_doctor):
        p1 = create_prescription_for_treatment(
            treatment=treatment, content="A", created_by=head_doctor, send=False
        )
        p2 = create_prescription_for_treatment(
            treatment=treatment, content="B", created_by=head_doctor, send=False
        )
        result = list(prescriptions_for_treatment(treatment.pk))
        assert p1 in result and p2 in result
        assert len(result) == 2

    def test_prescriptions_for_patient(self, treatment, head_doctor):
        p = create_prescription_for_treatment(
            treatment=treatment, content="X", created_by=head_doctor, send=False
        )
        result = list(prescriptions_for_patient(treatment.patient_id))
        assert p in result

    def test_filter_is_sent(self, treatment, head_doctor):
        pending = create_prescription_for_treatment(
            treatment=treatment, content="Pending", created_by=head_doctor, send=False
        )
        sent = create_prescription_for_treatment(
            treatment=treatment, content="Sent", created_by=head_doctor, send=False
        )
        mark_prescription_sent(sent)

        sent_only = list(filter_prescriptions(is_sent=True))
        pending_only = list(filter_prescriptions(is_sent=False))
        assert sent in sent_only and pending not in sent_only
        assert pending in pending_only and sent not in pending_only


# ===========================================================================
# API tests — templates CRUD
# ===========================================================================
class TestTemplateAPI:
    def test_anonymous_denied(self, api_client):
        r = api_client.get(TEMPLATES_URL)
        assert r.status_code == status.HTTP_401_UNAUTHORIZED

    def test_head_doctor_can_list(self, api_client, head_doctor):
        create_prescription_template(
            name="A", content="x", created_by=head_doctor
        )
        r = _auth(api_client, head_doctor).get(TEMPLATES_URL)
        assert r.status_code == status.HTTP_200_OK
        data = r.json()
        assert data["count"] == 1
        assert data["results"][0]["name"] == "A"
        # camelCase envelope
        assert "isActive" in data["results"][0]

    def test_head_doctor_can_create(self, api_client, head_doctor):
        r = _auth(api_client, head_doctor).post(
            TEMPLATES_URL,
            {"name": "Yangi", "content": "Body"},
            format="json",
        )
        assert r.status_code == status.HTTP_201_CREATED, r.content
        assert r.json()["name"] == "Yangi"
        assert PrescriptionTemplate.objects.filter(name="Yangi").exists()

    def test_doctor_can_create(self, api_client, doctor_user):
        r = _auth(api_client, doctor_user).post(
            TEMPLATES_URL,
            {"name": "DocOwn", "content": "Body"},
            format="json",
        )
        assert r.status_code == status.HTTP_201_CREATED, r.content

    def test_administrator_cannot_create(self, api_client, administrator):
        r = _auth(api_client, administrator).post(
            TEMPLATES_URL,
            {"name": "X", "content": "Y"},
            format="json",
        )
        assert r.status_code == status.HTTP_403_FORBIDDEN

    def test_administrator_can_list(self, api_client, administrator, head_doctor):
        create_prescription_template(
            name="A", content="x", created_by=head_doctor
        )
        r = _auth(api_client, administrator).get(TEMPLATES_URL)
        assert r.status_code == status.HTTP_200_OK
        assert r.json()["count"] == 1

    def test_duplicate_name_returns_envelope(self, api_client, head_doctor):
        create_prescription_template(
            name="Same", content="a", created_by=head_doctor
        )
        r = _auth(api_client, head_doctor).post(
            TEMPLATES_URL,
            {"name": "Same", "content": "b"},
            format="json",
        )
        assert r.status_code == status.HTTP_400_BAD_REQUEST
        body = r.json()
        assert "error" in body
        assert body["error"]["code"] == "VALIDATION_ERROR"

    def test_patch_own_template(self, api_client, doctor_user):
        tpl = create_prescription_template(
            name="Own", content="a", created_by=doctor_user
        )
        r = _auth(api_client, doctor_user).patch(
            f"{TEMPLATES_URL}{tpl.pk}/",
            {"content": "b"},
            format="json",
        )
        assert r.status_code == status.HTTP_200_OK, r.content
        tpl.refresh_from_db()
        assert tpl.content == "b"

    def test_doctor_cannot_patch_others_template(
        self, api_client, doctor_user, head_doctor
    ):
        tpl = create_prescription_template(
            name="Boss", content="a", created_by=head_doctor
        )
        r = _auth(api_client, doctor_user).patch(
            f"{TEMPLATES_URL}{tpl.pk}/",
            {"content": "hack"},
            format="json",
        )
        assert r.status_code == status.HTTP_403_FORBIDDEN

    def test_soft_delete(self, api_client, head_doctor):
        tpl = create_prescription_template(
            name="Kill", content="x", created_by=head_doctor
        )
        r = _auth(api_client, head_doctor).delete(f"{TEMPLATES_URL}{tpl.pk}/")
        assert r.status_code == status.HTTP_204_NO_CONTENT
        tpl.refresh_from_db()
        assert tpl.is_active is False

    def test_camelcase_input_accepted(self, api_client, head_doctor):
        # POST with camelCase alias should still work
        r = _auth(api_client, head_doctor).post(
            TEMPLATES_URL,
            {"name": "Alias", "content": "x", "isActive": True},
            format="json",
        )
        assert r.status_code == status.HTTP_201_CREATED, r.content


# ===========================================================================
# API tests — Prescription read-only viewset
# ===========================================================================
class TestPrescriptionListAPI:
    def test_head_doctor_sees_all(
        self, api_client, head_doctor, treatment, other_treatment
    ):
        create_prescription_for_treatment(
            treatment=treatment, content="A", created_by=head_doctor, send=False
        )
        create_prescription_for_treatment(
            treatment=other_treatment,
            content="B",
            created_by=head_doctor,
            send=False,
        )
        r = _auth(api_client, head_doctor).get(PRESCRIPTIONS_URL)
        assert r.status_code == status.HTTP_200_OK
        assert r.json()["count"] == 2

    def test_doctor_sees_only_own(
        self,
        api_client,
        head_doctor,
        doctor,
        doctor_user,
        treatment,
        other_treatment,
    ):
        # Retsept on own treatment
        mine = create_prescription_for_treatment(
            treatment=treatment, content="Mine", created_by=head_doctor, send=False
        )
        # Retsept on other doctor's treatment
        theirs = create_prescription_for_treatment(
            treatment=other_treatment,
            content="Theirs",
            created_by=head_doctor,
            send=False,
        )
        r = _auth(api_client, doctor_user).get(PRESCRIPTIONS_URL)
        assert r.status_code == status.HTTP_200_OK
        ids = {row["id"] for row in r.json()["results"]}
        assert str(mine.pk) in ids
        assert str(theirs.pk) not in ids

    def test_filter_by_treatment(
        self, api_client, head_doctor, treatment, other_treatment
    ):
        target = create_prescription_for_treatment(
            treatment=treatment, content="X", created_by=head_doctor, send=False
        )
        create_prescription_for_treatment(
            treatment=other_treatment,
            content="Y",
            created_by=head_doctor,
            send=False,
        )
        r = _auth(api_client, head_doctor).get(
            f"{PRESCRIPTIONS_URL}?treatment={treatment.pk}"
        )
        assert r.status_code == status.HTTP_200_OK
        data = r.json()
        assert data["count"] == 1
        assert data["results"][0]["id"] == str(target.pk)

    def test_filter_is_sent(self, api_client, head_doctor, treatment):
        sent = create_prescription_for_treatment(
            treatment=treatment, content="A", created_by=head_doctor, send=False
        )
        mark_prescription_sent(sent)
        create_prescription_for_treatment(
            treatment=treatment, content="B", created_by=head_doctor, send=False
        )
        r = _auth(api_client, head_doctor).get(f"{PRESCRIPTIONS_URL}?is_sent=true")
        assert r.status_code == status.HTTP_200_OK
        assert r.json()["count"] == 1
        assert r.json()["results"][0]["id"] == str(sent.pk)

    def test_soft_delete_via_api(self, api_client, head_doctor, treatment):
        p = create_prescription_for_treatment(
            treatment=treatment, content="X", created_by=head_doctor, send=False
        )
        r = _auth(api_client, head_doctor).delete(f"{PRESCRIPTIONS_URL}{p.pk}/")
        assert r.status_code == status.HTTP_204_NO_CONTENT
        p.refresh_from_db()
        assert p.is_active is False

    def test_post_to_prescriptions_url_not_allowed(
        self, api_client, head_doctor
    ):
        r = _auth(api_client, head_doctor).post(
            PRESCRIPTIONS_URL, {"content": "x"}, format="json"
        )
        assert r.status_code == status.HTTP_405_METHOD_NOT_ALLOWED


# ===========================================================================
# API tests — POST /treatments/{id}/prescription/
# ===========================================================================
class TestIssuePrescriptionAPI:
    def _issue_url(self, treatment) -> str:
        return f"/api/v1/treatments/{treatment.pk}/prescription/"

    def test_anonymous_denied(self, api_client, treatment):
        r = api_client.post(self._issue_url(treatment), {"content": "x"}, format="json")
        assert r.status_code == status.HTTP_401_UNAUTHORIZED

    def test_administrator_forbidden(self, api_client, administrator, treatment):
        r = _auth(api_client, administrator).post(
            self._issue_url(treatment),
            {"content": "Ibuprofen"},
            format="json",
        )
        assert r.status_code == status.HTTP_403_FORBIDDEN

    def test_head_doctor_can_issue(self, api_client, head_doctor, treatment):
        with patch(
            "apps.prescriptions.services._send_via_telegram", return_value=True
        ):
            r = _auth(api_client, head_doctor).post(
                self._issue_url(treatment),
                {"content": "Ibuprofen 400mg"},
                format="json",
            )
        assert r.status_code == status.HTTP_201_CREATED, r.content
        body = r.json()
        assert body["content"] == "Ibuprofen 400mg"
        assert body["treatmentId"] == str(treatment.pk)
        assert body["isSent"] is True
        assert body["sentToTelegramAt"] is not None

    def test_owner_doctor_can_issue(self, api_client, doctor_user, treatment):
        with patch(
            "apps.prescriptions.services._send_via_telegram", return_value=False
        ):
            r = _auth(api_client, doctor_user).post(
                self._issue_url(treatment),
                {"content": "Amoksitsillin"},
                format="json",
            )
        assert r.status_code == status.HTTP_201_CREATED, r.content
        assert r.json()["isSent"] is False

    def test_other_doctor_forbidden(
        self, api_client, other_doctor_user, other_doctor, treatment
    ):
        r = _auth(api_client, other_doctor_user).post(
            self._issue_url(treatment),
            {"content": "Hack"},
            format="json",
        )
        assert r.status_code == status.HTTP_403_FORBIDDEN

    def test_from_template_id_camelcase(
        self, api_client, head_doctor, treatment
    ):
        tpl = create_prescription_template(
            name="Std", content="Body {patient_name}", created_by=head_doctor
        )
        with patch(
            "apps.prescriptions.services._send_via_telegram", return_value=False
        ):
            r = _auth(api_client, head_doctor).post(
                self._issue_url(treatment),
                {"templateId": str(tpl.pk)},
                format="json",
            )
        assert r.status_code == status.HTTP_201_CREATED, r.content
        assert "Ali Valiyev" in r.json()["content"]

    def test_missing_content_and_template_returns_envelope(
        self, api_client, head_doctor, treatment
    ):
        r = _auth(api_client, head_doctor).post(
            self._issue_url(treatment),
            {"send": False},
            format="json",
        )
        assert r.status_code == status.HTTP_400_BAD_REQUEST
        assert "error" in r.json()

    def test_send_false_leaves_sent_none(
        self, api_client, head_doctor, treatment
    ):
        # Even if the fake sender would succeed, send=False disables it.
        with patch(
            "apps.prescriptions.services._send_via_telegram", return_value=True
        ):
            r = _auth(api_client, head_doctor).post(
                self._issue_url(treatment),
                {"content": "X", "send": False},
                format="json",
            )
        assert r.status_code == status.HTTP_201_CREATED
        assert r.json()["isSent"] is False

    def test_send_but_no_telegram_chat_id(
        self, api_client, head_doctor, treatment_no_telegram
    ):
        r = _auth(api_client, head_doctor).post(
            self._issue_url(treatment_no_telegram),
            {"content": "X"},
            format="json",
        )
        assert r.status_code == status.HTTP_201_CREATED, r.content
        assert r.json()["isSent"] is False

    def test_nonexistent_treatment_returns_404(self, api_client, head_doctor):
        r = _auth(api_client, head_doctor).post(
            "/api/v1/treatments/00000000-0000-0000-0000-000000000000/prescription/",
            {"content": "X"},
            format="json",
        )
        assert r.status_code == status.HTTP_404_NOT_FOUND


# ===========================================================================
# camelCase serialisation sanity
# ===========================================================================
class TestSerialisation:
    def test_prescription_shape(self, api_client, head_doctor, treatment):
        create_prescription_for_treatment(
            treatment=treatment, content="Body", created_by=head_doctor, send=False
        )
        r = _auth(api_client, head_doctor).get(PRESCRIPTIONS_URL)
        row = r.json()["results"][0]
        for camel in (
            "id",
            "treatmentId",
            "content",
            "sentToTelegramAt",
            "isSent",
            "isActive",
            "createdAt",
        ):
            assert camel in row, f"missing camelCase key: {camel}"
