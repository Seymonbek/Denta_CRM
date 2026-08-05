"""HTTP endpoints for the ``reports`` app.

All endpoints are read-only, restricted to ``bosh_shifokor``, and cached
through :mod:`apps.reports.services` (5-minute Redis TTL). Query
parameter ``period`` accepts ``day`` (default), ``week`` or ``month``.
"""
from __future__ import annotations

from typing import Any

from drf_spectacular.utils import OpenApiParameter, OpenApiTypes, extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from .permissions import IsHeadDoctor
from .selectors import VALID_PERIODS
from .services import (
    get_dashboard,
    get_departments,
    get_procedures,
    get_revenue,
)

_PERIOD_PARAM = OpenApiParameter(
    name="period",
    required=False,
    type=OpenApiTypes.STR,
    location=OpenApiParameter.QUERY,
    enum=list(VALID_PERIODS),
    description="Vaqt oralig'i (default: day).",
)


def _period_from(request: Request) -> str:
    raw = request.query_params.get("period", "day")
    raw = (raw or "day").strip().lower()
    if raw not in VALID_PERIODS:
        raise DRFValidationError(
            {
                "period": [
                    f"period faqat {list(VALID_PERIODS)} qiymatlaridan biri "
                    f"bo'lishi mumkin."
                ]
            }
        )
    return raw


class _BaseReportView(APIView):
    """Shared plumbing for every report endpoint."""

    permission_classes = [IsHeadDoctor]
    http_method_names = ["get", "head", "options"]


@extend_schema(
    tags=["reports"],
    parameters=[_PERIOD_PARAM],
    responses={200: OpenApiTypes.OBJECT},
    description="KPI + grafik ma'lumotlari (bosh sahifa uchun).",
)
class DashboardReportView(_BaseReportView):
    """``GET /api/v1/reports/dashboard/?period=day|week|month``."""

    def get(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        period = _period_from(request)
        payload = get_dashboard(period)
        return Response(payload, status=status.HTTP_200_OK)


@extend_schema(
    tags=["reports"],
    parameters=[_PERIOD_PARAM],
    responses={200: OpenApiTypes.OBJECT},
    description="Daromad hisoboti — jami, kunlik dinamika, to'lov turi bo'yicha.",
)
class RevenueReportView(_BaseReportView):
    """``GET /api/v1/reports/revenue/?period=…``."""

    def get(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        period = _period_from(request)
        return Response(get_revenue(period), status=status.HTTP_200_OK)


@extend_schema(
    tags=["reports"],
    parameters=[
        _PERIOD_PARAM,
        OpenApiParameter(
            name="limit",
            required=False,
            type=OpenApiTypes.INT,
            location=OpenApiParameter.QUERY,
            description="Nechta muolaja qaytarilsin (1–50, default 10).",
        ),
    ],
    responses={200: OpenApiTypes.OBJECT},
    description="Eng ko'p bajarilgan muolajalar ro'yxati.",
)
class ProceduresReportView(_BaseReportView):
    """``GET /api/v1/reports/procedures/?period=…&limit=…``."""

    def get(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        period = _period_from(request)
        raw_limit = request.query_params.get("limit", "10")
        try:
            limit = int(raw_limit)
        except (TypeError, ValueError) as exc:
            raise DRFValidationError(
                {"limit": ["limit butun son bo'lishi kerak."]}
            ) from exc
        if limit < 1 or limit > 50:
            raise DRFValidationError({"limit": ["limit 1..50 oralig'ida bo'lishi kerak."]})
        return Response(get_procedures(period, limit=limit), status=status.HTTP_200_OK)


@extend_schema(
    tags=["reports"],
    parameters=[_PERIOD_PARAM],
    responses={200: OpenApiTypes.OBJECT},
    description="Bo'limlar bo'yicha davolashlar soni va daromad.",
)
class DepartmentsReportView(_BaseReportView):
    """``GET /api/v1/reports/departments/?period=…``."""

    def get(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        period = _period_from(request)
        return Response(get_departments(period), status=status.HTTP_200_OK)


__all__ = [
    "DashboardReportView",
    "RevenueReportView",
    "ProceduresReportView",
    "DepartmentsReportView",
]
