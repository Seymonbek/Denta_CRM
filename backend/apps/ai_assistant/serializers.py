"""Serializers for the ``ai_assistant`` REST API."""
from __future__ import annotations

from rest_framework import serializers

from .models import AIPermissionConfig


class AIChatRequestSerializer(serializers.Serializer):
    """Input payload for AI chatbot inquiries."""

    message = serializers.CharField(
        max_length=2000,
        required=True,
        help_text="User prompt or inquiry for the CRM AI Assistant.",
    )


class AIChatResponseSerializer(serializers.Serializer):
    """Response envelope for AI chatbot answers."""

    answer = serializers.CharField()
    source = serializers.CharField()
    contextSummary = serializers.DictField(source="context_summary")


class AIInventorySummarySerializer(serializers.Serializer):
    """Response payload for automated AI inventory stock summaries."""

    totalItemsCount = serializers.IntegerField(source="total_materials_count")
    lowStockItemsCount = serializers.IntegerField(source="low_stock_count")
    outOfStockCount = serializers.IntegerField(source="out_of_stock_count")
    criticalItems = serializers.ListField(source="low_stock_items")
    aiRecommendation = serializers.CharField(source="ai_recommendation")


class AIPermissionConfigSerializer(serializers.ModelSerializer):
    """Serializer for Bosh Shifokor to view and adjust dynamic AI permissions."""

    canViewInventoryCosts = serializers.BooleanField(source="can_view_inventory_costs")
    canViewFinancialReports = serializers.BooleanField(source="can_view_financial_reports")
    canViewOtherDoctorsStats = serializers.BooleanField(source="can_view_other_doctors_stats")
    canViewAllPatients = serializers.BooleanField(source="can_view_all_patients")

    class Meta:
        model = AIPermissionConfig
        fields = [
            "id",
            "role",
            "canViewInventoryCosts",
            "canViewFinancialReports",
            "canViewOtherDoctorsStats",
            "canViewAllPatients",
        ]
