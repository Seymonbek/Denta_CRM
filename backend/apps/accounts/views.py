"""Authentication views: login, refresh, self-profile, password reset.

We deliberately do **not** reuse ``rest_framework_simplejwt.views``
because we need our own error envelope, camelCase field aliases, and
extra token claims. All three endpoints share the standard error
envelope produced by :func:`apps.core.exceptions.custom_exception_handler`.
"""
from __future__ import annotations

import logging
from typing import Any

from drf_spectacular.utils import OpenApiExample, extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import (
    InvalidToken,
    TokenError,
)
from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import (
    LoginSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    TokenRefreshInputSerializer,
    TwoFactorDisableSerializer,
    TwoFactorEnableSerializer,
    TwoFactorVerifySerializer,
    UserProfileSerializer,
    UserProfileUpdateSerializer,
)

logger = logging.getLogger(__name__)


class LoginView(APIView):
    """POST /api/v1/auth/login/ — exchange phone+password for a token pair.

    T118: rate-limited via :class:`rest_framework.throttling.ScopedRateThrottle`
    using the ``auth_login`` scope (default ``5/min`` per IP). See
    ``REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]`` in ``config/settings/base.py``.
    Throttled requests surface as HTTP 429 through the standard error
    envelope with ``code="THROTTLED"``.
    """

    authentication_classes: list[Any] = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_login"

    @extend_schema(
        tags=["auth"],
        summary="Login (phone + password)",
        request=LoginSerializer,
        examples=[
            OpenApiExample(
                "Example login body",
                value={"phoneNumber": "+998901234567", "password": "..."},
                request_only=True,
            ),
        ],
        responses={200: None, 400: None},
    )
    def post(self, request: Request) -> Response:
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        # T125: when the user has 2FA turned on, do NOT mint tokens here.
        # Issue a login OTP and return HTTP 202 with
        # ``{"twoFactorRequired": true}`` so the frontend knows to prompt
        # for the code and call ``/auth/2fa/verify/`` next.
        if serializer.requires_two_factor():
            serializer.issue_login_otp()
            return Response(
                {
                    "twoFactorRequired": True,
                    "detail": (
                        "2FA yoqilgan — Telegram orqali yuborilgan kodni "
                        "/auth/2fa/verify/ ga jo'nating."
                    ),
                },
                status=status.HTTP_202_ACCEPTED,
            )
        return Response(serializer.get_token_pair(), status=status.HTTP_200_OK)


class TokenRefreshView(APIView):
    """POST /api/v1/auth/refresh/ — rotate a refresh token.

    The old refresh token is blacklisted (``BLACKLIST_AFTER_ROTATION``)
    on success. Errors surface through the standard envelope.
    """

    authentication_classes: list[Any] = []
    permission_classes = [AllowAny]

    @extend_schema(
        tags=["auth"],
        summary="Refresh JWT tokens",
        request=TokenRefreshInputSerializer,
        responses={200: None, 401: None},
    )
    def post(self, request: Request) -> Response:
        serializer = TokenRefreshInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        raw_refresh = serializer.validated_data["refresh"]

        try:
            refresh = RefreshToken(raw_refresh)
            data: dict[str, Any] = {"access": str(refresh.access_token)}
            # ``ROTATE_REFRESH_TOKENS`` is True — mint & blacklist.
            try:
                refresh.blacklist()
            except AttributeError:  # pragma: no cover - blacklist app disabled
                pass
            new_refresh = RefreshToken.for_user(
                # ``for_user`` needs the user; look them up from the old
                # token's user_id claim.
                _resolve_user_from_token(refresh)
            )
            data["refresh"] = str(new_refresh)
        except TokenError as exc:
            raise InvalidToken(str(exc)) from exc

        return Response(data, status=status.HTTP_200_OK)


class MeView(APIView):
    """GET /api/v1/auth/me/ — return the authenticated user's profile.
    PATCH /api/v1/auth/me/ — update the authenticated user's profile.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["auth"],
        summary="Current user profile",
        responses={200: UserProfileSerializer, 401: None},
    )
    def get(self, request: Request) -> Response:
        serializer = UserProfileSerializer(request.user)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=["auth"],
        summary="Update current user profile",
        request=UserProfileUpdateSerializer,
        responses={200: UserProfileSerializer, 400: None, 401: None},
    )
    def patch(self, request: Request) -> Response:
        serializer = UserProfileUpdateSerializer(
            request.user,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserProfileSerializer(user).data, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Password reset  (T119)
# ---------------------------------------------------------------------------
class PasswordResetRequestView(APIView):
    """POST /api/v1/auth/password-reset/request/ — issue a reset OTP.

    Rate-limited via the ``auth_password_reset`` scope (default
    ``3/hour`` per IP; env-overridable via ``PASSWORD_RESET_RATE_LIMIT``).
    Response is **always** HTTP 202 with the same body regardless of
    whether the phone number is registered, so an attacker cannot
    enumerate users through the endpoint.

    When the phone matches an active user with a ``telegram_chat_id``
    the OTP is delivered over Telegram via the standard notifications
    pipeline. Users without a chat id must contact bosh_shifokor to
    obtain the code out-of-band; the OTP row itself is still created so
    admin-panel operators can read it.
    """

    authentication_classes: list[Any] = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_password_reset"

    # Generic response body — kept identical across all outcomes so
    # timing + response shape are indistinguishable to a caller.
    _GENERIC_RESPONSE = {
        "detail": (
            "Agar telefon raqami tizimda ro'yxatdan o'tgan bo'lsa, "
            "tasdiqlash kodi yuboriladi."
        )
    }

    @extend_schema(
        tags=["auth"],
        summary="Request a password-reset OTP",
        request=PasswordResetRequestSerializer,
        examples=[
            OpenApiExample(
                "Example body",
                value={"phoneNumber": "+998901234567"},
                request_only=True,
            ),
        ],
        responses={202: None, 400: None, 429: None},
    )
    def post(self, request: Request) -> Response:
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        phone = serializer.validated_data["phone_number"]

        # Best-effort issue: never surface DB / notification errors to
        # the caller because that would leak account existence.
        try:
            self._issue_otp(phone)
        except Exception:  # noqa: BLE001 - protective boundary
            logger.exception(
                "password-reset: OTP issuance failed for %s", phone
            )

        return Response(
            self._GENERIC_RESPONSE,
            status=status.HTTP_202_ACCEPTED,
        )

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------
    @staticmethod
    def _issue_otp(phone_number: str) -> None:
        """Create an OTP row for ``phone_number`` and enqueue a message.

        Silently returns when no active user matches — never raises
        on unknown user (that would let the caller enumerate accounts).
        """
        from .models import OTPCode, User, generate_otp_code

        try:
            user = User.objects.get(phone_number=phone_number, is_active=True)
        except User.DoesNotExist:
            return

        code = generate_otp_code()
        OTPCode.objects.create(
            user=user,
            code=code,
            purpose=OTPCode.Purpose.PASSWORD_RESET,
        )

        # Enqueue a Telegram notification when the user has a chat id.
        # We import lazily so unit tests that only exercise the view
        # without the notifications app installed still function.
        if not user.telegram_chat_id:
            logger.info(
                "password-reset: user %s has no telegram_chat_id; "
                "OTP saved but not delivered.",
                user.pk,
            )
            return

        try:
            from apps.notifications.models import (
                NotificationChannel,
                NotificationType,
            )
            from apps.notifications.services import enqueue

            enqueue(
                notification_type=NotificationType.GENERIC,
                message=(
                    "DentaCRM parolni tiklash kodi: "
                    f"{code}. 10 daqiqa ichida ishlating."
                ),
                user=user,
                channel=NotificationChannel.TELEGRAM,
                context={"purpose": "password_reset"},
            )
        except Exception:  # noqa: BLE001 - never block the reset flow
            logger.exception(
                "password-reset: failed to enqueue OTP notification for %s",
                user.pk,
            )


class PasswordResetConfirmView(APIView):
    """POST /api/v1/auth/password-reset/confirm/ — verify OTP + rotate password.

    Also rate-limited under the ``auth_password_reset`` scope so an
    attacker cannot brute-force the 6-digit OTP against a known phone.
    """

    authentication_classes: list[Any] = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_password_reset"

    @extend_schema(
        tags=["auth"],
        summary="Confirm password reset (OTP + new password)",
        request=PasswordResetConfirmSerializer,
        examples=[
            OpenApiExample(
                "Example body",
                value={
                    "phoneNumber": "+998901234567",
                    "code": "123456",
                    "newPassword": "N3wStrongPass!",
                },
                request_only=True,
            ),
        ],
        responses={200: None, 400: None, 429: None},
    )
    def post(self, request: Request) -> Response:
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            {"detail": "Parol muvaffaqiyatli yangilandi."},
            status=status.HTTP_200_OK,
        )


# ---------------------------------------------------------------------------
# Two-factor auth  (T125)
# ---------------------------------------------------------------------------
class TwoFactorEnableView(APIView):
    """POST /api/v1/auth/2fa/enable/ — turn on 2FA for the current user.

    Requires a fresh password re-entry (`password` in body) so a
    stolen/leaked access token alone cannot enable 2FA (and thereby
    lock the real user out).
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["auth"],
        summary="Enable two-factor authentication",
        request=TwoFactorEnableSerializer,
        responses={200: None, 400: None, 401: None},
    )
    def post(self, request: Request) -> Response:
        serializer = TwoFactorEnableSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            {
                "detail": (
                    "2FA yoqildi. Endi har safar kirishda Telegram "
                    "orqali yuborilgan kodni kiritishingiz kerak."
                ),
                "twoFactorEnabled": user.two_factor_enabled,
            },
            status=status.HTTP_200_OK,
        )


class TwoFactorDisableView(APIView):
    """POST /api/v1/auth/2fa/disable/ — turn off 2FA for the current user.

    Same password re-confirmation as enable; the goal is that both
    transitions (off→on, on→off) require the caller to know the
    plaintext password, not merely hold a valid access token.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["auth"],
        summary="Disable two-factor authentication",
        request=TwoFactorDisableSerializer,
        responses={200: None, 400: None, 401: None},
    )
    def post(self, request: Request) -> Response:
        serializer = TwoFactorDisableSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            {
                "detail": "2FA o'chirildi.",
                "twoFactorEnabled": user.two_factor_enabled,
            },
            status=status.HTTP_200_OK,
        )


class TwoFactorVerifyView(APIView):
    """POST /api/v1/auth/2fa/verify/ — exchange OTP + credentials → tokens.

    Second half of the two-step login flow. Rate-limited under the
    same ``auth_login`` scope as ``/auth/login/`` so the OTP window
    isn't a soft target after the initial credential check.
    """

    authentication_classes: list[Any] = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_login"

    @extend_schema(
        tags=["auth"],
        summary="Verify 2FA OTP and return tokens",
        request=TwoFactorVerifySerializer,
        examples=[
            OpenApiExample(
                "Example body",
                value={
                    "phoneNumber": "+998901234567",
                    "password": "...",
                    "code": "123456",
                },
                request_only=True,
            ),
        ],
        responses={200: None, 400: None, 429: None},
    )
    def post(self, request: Request) -> Response:
        serializer = TwoFactorVerifySerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        return Response(serializer.get_token_pair(), status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------
def _resolve_user_from_token(refresh: RefreshToken):
    """Look up the User referenced by ``refresh['user_id']``."""
    from django.contrib.auth import get_user_model  # local import — cheap

    user_model = get_user_model()
    user_id = refresh.get("user_id")
    if user_id is None:
        raise InvalidToken("Token has no user_id.")
    try:
        return user_model.objects.get(pk=user_id, is_active=True)
    except user_model.DoesNotExist as exc:
        raise InvalidToken("User not found for refresh token.") from exc
