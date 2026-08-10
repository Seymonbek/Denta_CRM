"""Tests for the ``ai_assistant`` app (AI Chatbot, Inventory Analytics & Dynamic RBAC)."""
from __future__ import annotations

from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from apps.inventory.models import MaterialUnit
from apps.inventory.services import create_material
from apps.ai_assistant.models import AIPermissionConfig
from apps.ai_assistant.services import (
    generate_ai_chat_response,
    get_inventory_analytics,
)

pytestmark = pytest.mark.django_db

User = get_user_model()


@pytest.fixture
def bosh_shifokor(db):
    return User.objects.create_user(
        phone_number="+998900000888",
        password="PassWord123!",
        first_name="Bosh",
        last_name="Shifokor",
        role=User.Role.BOSH_SHIFOKOR,
    )


@pytest.fixture
def doctor_user(db):
    return User.objects.create_user(
        phone_number="+998900000777",
        password="PassWord123!",
        first_name="Doktor",
        last_name="Karimov",
        role=User.Role.DOCTOR,
    )


@pytest.fixture
def low_stock_material(db):
    return create_material(
        name="Plomba materiali A1",
        unit=MaterialUnit.GRAM,
        quantity_in_stock=Decimal("2.000"),
        minimum_threshold=Decimal("10.000"),
    )


def test_inventory_analytics_detects_low_stock(low_stock_material):
    analytics = get_inventory_analytics()
    assert analytics["total_materials_count"] >= 1
    assert analytics["low_stock_count"] >= 1
    items = analytics["low_stock_items"]
    assert any(item["name"] == "Plomba materiali A1" for item in items)


def test_ai_chat_doctor_query(bosh_shifokor, db):
    from apps.doctors.models import DoctorProfile
    DoctorProfile.objects.create(
        user=bosh_shifokor,
        specialization="Stomatolog-Ortoped",
    )
    res = generate_ai_chat_response("menda doktorlar haqida to'liq malumot ber", bosh_shifokor)
    assert "answer" in res
    assert "Shifokorlari Ro'yxati" in res["answer"] or "👨‍⚕️" in res["answer"]
    assert "Bosh Shifokor" in res["answer"]


def test_ai_chat_greeting_query(bosh_shifokor):
    res = generate_ai_chat_response("Salom", bosh_shifokor)
    assert "Assalomu alaykum" in res["answer"]
    assert "Bosh Shifokor" in res["answer"]


def test_generate_ai_chat_response_rule_fallback(bosh_shifokor, low_stock_material):
    response = generate_ai_chat_response("Omborda nimalar kam qolgan?", bosh_shifokor)
    assert response["source"] in {"crm-smart-assistant", "gemini-ai"}
    assert "Plomba materiali A1" in response["answer"] or "Omborda" in response["answer"]


def test_ai_chat_api_endpoint(bosh_shifokor, low_stock_material):
    client = APIClient()
    client.force_authenticate(user=bosh_shifokor)

    res = client.post(
        "/api/v1/ai/chat/",
        data={"message": "Ombor holati haqida ma'lumot bering"},
        format="json",
    )
    assert res.status_code == status.HTTP_200_OK
    assert "answer" in res.data
    assert "source" in res.data


def test_ai_inventory_summary_api_endpoint(bosh_shifokor, low_stock_material):
    client = APIClient()
    client.force_authenticate(user=bosh_shifokor)

    res = client.get("/api/v1/ai/inventory-summary/")
    assert res.status_code == status.HTTP_200_OK
    assert res.data["lowStockItemsCount"] >= 1
    assert any(
        item["name"] == "Plomba materiali A1"
        for item in res.data["criticalItems"]
    )


def test_ai_chat_unauthenticated_returns_401():
    client = APIClient()
    res = client.post(
        "/api/v1/ai/chat/",
        data={"message": "Test"},
        format="json",
    )
    assert res.status_code == status.HTTP_401_UNAUTHORIZED


def test_bosh_shifokor_can_manage_ai_permissions(bosh_shifokor):
    client = APIClient()
    client.force_authenticate(user=bosh_shifokor)

    res = client.post(
        "/api/v1/ai/permissions/",
        data={
            "role": "doctor",
            "canViewInventoryCosts": True,
            "canViewFinancialReports": False,
            "canViewOtherDoctorsStats": False,
            "canViewAllPatients": True,
        },
        format="json",
    )
    assert res.status_code == status.HTTP_201_CREATED
    assert AIPermissionConfig.objects.filter(role="doctor").exists()


def test_doctor_cannot_manage_ai_permissions(doctor_user):
    client = APIClient()
    client.force_authenticate(user=doctor_user)

    res = client.get("/api/v1/ai/permissions/")
    assert res.status_code == status.HTTP_403_FORBIDDEN
