"""HTTP orchestration for the ``ai_assistant`` app.

Endpoints (mounted at ``/api/v1/ai/``):

* ``POST /chat/``             — AI Chatbot endpoint for staff (Bosh Shifokor, Admin, Doctor).
* ``GET  /inventory-summary/`` — Real-time AI inventory stock analysis and alerts.
* ``GET/PUT /permissions/``   — Dynamic AI permissions config (Bosh Shifokor only).
"""
from __future__ import annotations

from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsBoshShifokor
from .models import AIPermissionConfig
from .serializers import (
    AIChatRequestSerializer,
    AIChatResponseSerializer,
    AIInventorySummarySerializer,
    AIPermissionConfigSerializer,
)
from .services import generate_ai_chat_response, get_inventory_analytics


@extend_schema(tags=["ai-assistant"])
class AIChatView(APIView):
    """Interactive AI Assistant Chatbot for clinic staff."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=AIChatRequestSerializer,
        responses={200: AIChatResponseSerializer},
        summary="Ask the DentaCRM AI Assistant a question",
    )
    def post(self, request: Request) -> Response:
        serializer = AIChatRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        query = serializer.validated_data["message"]
        result = generate_ai_chat_response(query=query, user=request.user)

        out_serializer = AIChatResponseSerializer(result)
        return Response(out_serializer.data, status=status.HTTP_200_OK)


@extend_schema(tags=["ai-assistant"])
class AIInventorySummaryView(APIView):
    """Get automated AI inventory stock analytics and low-stock warnings."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={200: AIInventorySummarySerializer},
        summary="Retrieve live inventory analytics and low-stock alerts",
    )
    def get(self, request: Request) -> Response:
        analytics = get_inventory_analytics()
        serializer = AIInventorySummarySerializer(analytics)
        return Response(serializer.data, status=status.HTTP_200_OK)


@extend_schema(tags=["ai-assistant"])
class AIPermissionConfigViewSet(viewsets.ModelViewSet):
    """Manage dynamic AI permissions per role (Bosh Shifokor only)."""

    queryset = AIPermissionConfig.objects.all().order_by("role")
    serializer_class = AIPermissionConfigSerializer
    permission_classes = [IsAuthenticated, IsBoshShifokor]
