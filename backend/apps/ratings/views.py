"""HTTP orchestration for the ``ratings`` app.

Endpoints:

* ``GET /api/v1/ratings/leaderboard/?period=YYYY-MM``
* ``GET /api/v1/doctors/{id}/badges/``
"""
from __future__ import annotations

from typing import Any

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status, viewsets
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.generics import get_object_or_404
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import ROLE_DOCTOR
from apps.doctors.models import DoctorProfile
from .models import PatientReview

from .permissions import DoctorBadgesPermission, LeaderboardPermission
from .selectors import badges_for_doctor, leaderboard
from .serializers import DoctorBadgeSerializer, LeaderboardEntrySerializer, PatientReviewSerializer


# ---------------------------------------------------------------------------
# Leaderboard
# ---------------------------------------------------------------------------
@extend_schema(
    tags=["ratings"],
    responses=LeaderboardEntrySerializer(many=True),
    parameters=[
        OpenApiParameter(
            name="period",
            required=False,
            type=str,
            location=OpenApiParameter.QUERY,
            description="YYYY-MM formatidagi davr, masalan 2026-07. Bo'sh — barcha davrlar.",
        ),
        OpenApiParameter(
            name="limit",
            required=False,
            type=int,
            location=OpenApiParameter.QUERY,
            description="Qaytariladigan yozuvlar soni (default: 20, max: 100).",
        ),
    ],
)
class LeaderboardView(APIView):
    """``GET /api/v1/ratings/leaderboard/``."""

    permission_classes = [LeaderboardPermission]

    def get(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        period = request.query_params.get("period")
        raw_limit = request.query_params.get("limit")
        limit = 20
        if raw_limit is not None and raw_limit != "":
            try:
                limit = int(raw_limit)
            except ValueError as exc:
                raise ValidationError({"limit": ["Butun son bo'lishi kerak."]}) from exc
            if limit <= 0:
                raise ValidationError({"limit": ["1 dan katta bo'lishi kerak."]})
            limit = min(limit, 100)

        try:
            board = leaderboard(period=period, limit=limit)
        except ValueError as exc:
            raise ValidationError({"period": [str(exc)]}) from exc

        return Response(LeaderboardEntrySerializer(board, many=True).data)


# ---------------------------------------------------------------------------
# Doctor badges
# ---------------------------------------------------------------------------
@extend_schema(
    tags=["ratings"],
    responses=DoctorBadgeSerializer(many=True),
    parameters=[
        OpenApiParameter(
            name="doctor_id",
            required=True,
            type=str,
            location=OpenApiParameter.PATH,
        ),
    ],
)
class DoctorBadgesView(APIView):
    """``GET /api/v1/doctors/{id}/badges/``."""

    permission_classes = [DoctorBadgesPermission]

    def get(self, request: Request, doctor_id: Any, *args: Any, **kwargs: Any) -> Response:
        doctor = get_object_or_404(DoctorProfile, pk=doctor_id, is_active=True)
        role = getattr(request.user, "role", None)
        if role == ROLE_DOCTOR and doctor.user_id != request.user.id:
            profile = getattr(request.user, "doctor_profile", None)
            if not getattr(profile, "can_view_other_doctors", False):
                raise NotFound("Ushbu shifokorning nishonlarini ko'ra olmaysiz.")
        qs = badges_for_doctor(doctor.pk)
        return Response(
            DoctorBadgeSerializer(qs, many=True).data,
            status=status.HTTP_200_OK,
        )


# ---------------------------------------------------------------------------
# Patient Reviews
# ---------------------------------------------------------------------------
@extend_schema(tags=["ratings"])
class PatientReviewViewSet(viewsets.ModelViewSet):
    """``/api/v1/ratings/reviews/``."""
    
    queryset = PatientReview.objects.all().select_related("patient", "doctor")
    serializer_class = PatientReviewSerializer
    
    def get_permissions(self):
        if self.action == "create":
            return [AllowAny()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = super().get_queryset()
        doctor_id = self.request.query_params.get("doctor_id")
        if doctor_id:
            qs = qs.filter(doctor_id=doctor_id)
        return qs


__all__ = ["LeaderboardView", "DoctorBadgesView", "PatientReviewViewSet"]
