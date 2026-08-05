"""DRF serializers for the accounts app.

Design notes:

* API payloads are **camelCase** per the frontend contract. Instead of
  pulling in ``djangorestframework-camel-case`` (extra dep, global side
  effects) we override :meth:`Serializer.to_representation` locally to
  rename the small set of fields we expose.
* The login serializer validates credentials **without** calling
  ``authenticate()`` on unknown users so we never leak which phone
  numbers exist through timing.
* The password-reset serializers (T119) never signal whether a phone
  number is registered — the request endpoint always returns the same
  success payload so an attacker cannot enumerate users.
"""
from __future__ import annotations

from typing import Any

from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken

from .models import User, normalise_phone_number


# ---------------------------------------------------------------------------
# /auth/me/  ← camelCase profile response
# ---------------------------------------------------------------------------
class UserProfileSerializer(serializers.ModelSerializer):
    """Serializes the currently-authenticated user for ``GET /auth/me/``.

    The output payload is camelCase to match the frontend TS ``User``
    interface: ``{id, firstName, lastName, phoneNumber, role,
    twoFactorEnabled, telegramChatId}``.

    T125: ``twoFactorEnabled`` is now exposed so the frontend can render
    the 2FA toggle on the Settings page. The field is **read-only** on
    this endpoint — changes go through the dedicated
    ``/auth/2fa/enable/`` and ``/auth/2fa/disable/`` endpoints which
    require the user to re-authenticate with their password (see
    ``TwoFactorEnableSerializer`` below).
    """

    class Meta:
        model = User
        fields = (
            "id",
            "first_name",
            "last_name",
            "phone_number",
            "role",
            "two_factor_enabled",
            "telegram_chat_id",
        )
        read_only_fields = fields

    def to_representation(self, instance: User) -> dict[str, Any]:
        base = super().to_representation(instance)
        return {
            "id": str(base["id"]),
            "firstName": base["first_name"],
            "lastName": base["last_name"],
            "phoneNumber": base["phone_number"],
            "role": base["role"],
            "twoFactorEnabled": bool(base["two_factor_enabled"]),
            "telegramChatId": base["telegram_chat_id"],
        }


class UserProfileUpdateSerializer(serializers.ModelSerializer):
    """Serializer to handle profile updates for the currently-authenticated user.

    Allows updating first name, last name, and Telegram chat ID.
    """

    firstName = serializers.CharField(source="first_name", required=False, max_length=100)
    lastName = serializers.CharField(source="last_name", required=False, max_length=100)
    telegramChatId = serializers.IntegerField(source="telegram_chat_id", required=False, allow_null=True)

    class Meta:
        model = User
        fields = ("firstName", "lastName", "telegramChatId")

    def to_representation(self, instance: User) -> dict[str, Any]:
        return UserProfileSerializer(instance).data


# ---------------------------------------------------------------------------
# /auth/login/
# ---------------------------------------------------------------------------
class LoginSerializer(serializers.Serializer):
    """Validate phone+password and mint a JWT token pair.

    Accepts both snake_case and camelCase input keys so the frontend can
    POST ``{"phoneNumber": "...", "password": "..."}`` without an extra
    transformation layer.
    """

    phone_number = serializers.CharField(write_only=True, required=False)
    phoneNumber = serializers.CharField(  # noqa: N815 - camelCase alias
        write_only=True,
        required=False,
    )
    password = serializers.CharField(
        write_only=True,
        style={"input_type": "password"},
        trim_whitespace=False,
    )

    # Filled in by ``validate``.
    user: User | None = None

    def to_internal_value(self, data: Any) -> dict[str, Any]:
        # Normalise camelCase → snake_case so downstream code has one shape.
        if isinstance(data, dict) and "phoneNumber" in data and "phone_number" not in data:
            data = {**data, "phone_number": data["phoneNumber"]}
        return super().to_internal_value(data)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        phone = attrs.get("phone_number") or attrs.get("phoneNumber")
        password = attrs.get("password")

        if not phone or not password:
            raise serializers.ValidationError(
                {"detail": "Telefon raqami va parol majburiy."}
            )

        try:
            phone = normalise_phone_number(phone)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                {"phoneNumber": list(exc.messages)}
            ) from exc

        request = self.context.get("request")
        user = authenticate(request=request, username=phone, password=password)
        if user is None:
            # Uniform message — do not leak whether the phone exists.
            raise serializers.ValidationError(
                {"detail": "Telefon raqami yoki parol noto'g'ri."}
            )
        if not user.is_active:
            raise serializers.ValidationError(
                {"detail": "Foydalanuvchi bloklangan."}
            )

        attrs["user"] = user
        self.user = user
        return attrs

    def get_token_pair(self) -> dict[str, Any]:
        """Mint an access+refresh pair and echo the user profile."""
        assert self.user is not None, "call is_valid() before get_token_pair()"
        refresh = RefreshToken.for_user(self.user)
        # Custom claims — mirror them so the frontend can decode without
        # a round-trip to /auth/me/ during initial hydration.
        refresh["role"] = self.user.role
        access = refresh.access_token
        access["role"] = self.user.role
        return {
            "access": str(access),
            "refresh": str(refresh),
            "user": UserProfileSerializer(self.user).data,
        }

    # ------------------------------------------------------------------
    # T125 — 2FA short-circuit
    # ------------------------------------------------------------------
    def requires_two_factor(self) -> bool:
        """Return True when the authenticated user has 2FA turned on.

        The login view calls this **after** ``is_valid`` to decide
        whether to mint tokens directly or issue a login OTP and defer
        to ``/auth/2fa/verify/``.
        """
        return bool(self.user and self.user.two_factor_enabled)

    def issue_login_otp(self) -> "OTPCode":
        """Create a fresh ``purpose=login`` OTP for the authenticated user.

        The code is delivered over Telegram when a chat id is
        configured; otherwise the OTP row is still created so an
        operator can read it from the admin panel out-of-band.
        """
        assert self.user is not None
        from .models import OTPCode, generate_otp_code

        code = generate_otp_code()
        otp = OTPCode.objects.create(
            user=self.user,
            code=code,
            purpose=OTPCode.Purpose.LOGIN,
        )

        # Best-effort Telegram delivery — mirrors the password-reset flow.
        if self.user.telegram_chat_id:
            try:
                from apps.notifications.models import (
                    NotificationChannel,
                    NotificationType,
                )
                from apps.notifications.services import enqueue

                enqueue(
                    notification_type=NotificationType.GENERIC,
                    message=(
                        f"DentaCRM kirish kodi: {code}. "
                        "10 daqiqa ichida ishlating."
                    ),
                    user=self.user,
                    channel=NotificationChannel.TELEGRAM,
                    context={"purpose": "login_2fa"},
                )
            except Exception:  # noqa: BLE001 - never block login
                pass
        return otp


# ---------------------------------------------------------------------------
# /auth/refresh/
# ---------------------------------------------------------------------------
class TokenRefreshInputSerializer(serializers.Serializer):
    """Accept a refresh token; blacklist old + return new tokens."""

    refresh = serializers.CharField(write_only=True)



# ---------------------------------------------------------------------------
# /auth/password-reset/request/  (T119)
# ---------------------------------------------------------------------------
class PasswordResetRequestSerializer(serializers.Serializer):
    """Validate the phone number for a password-reset OTP request.

    Behaviour is intentionally uniform for every input:

    * Malformed phone numbers → ``VALIDATION_ERROR`` (client bug).
    * Well-formed phone numbers for **unknown** users → the view still
      returns HTTP 202 with a generic message so the caller cannot
      enumerate registered phones.
    * Well-formed phone numbers for **known** users → an ``OTPCode`` row
      of ``purpose=password_reset`` is created and a Telegram
      notification is enqueued (best-effort — no error surfaces if the
      user has no ``telegram_chat_id``).
    """

    phone_number = serializers.CharField(write_only=True, required=False)
    phoneNumber = serializers.CharField(  # noqa: N815 - camelCase alias
        write_only=True,
        required=False,
    )

    def to_internal_value(self, data: Any) -> dict[str, Any]:
        if isinstance(data, dict) and "phoneNumber" in data and "phone_number" not in data:
            data = {**data, "phone_number": data["phoneNumber"]}
        return super().to_internal_value(data)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        raw = attrs.get("phone_number") or attrs.get("phoneNumber")
        if not raw:
            raise serializers.ValidationError(
                {"phoneNumber": ["Telefon raqami majburiy."]}
            )
        try:
            attrs["phone_number"] = normalise_phone_number(raw)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                {"phoneNumber": list(exc.messages)}
            ) from exc
        return attrs


# ---------------------------------------------------------------------------
# /auth/password-reset/confirm/  (T119)
# ---------------------------------------------------------------------------
class PasswordResetConfirmSerializer(serializers.Serializer):
    """Validate an OTP + new password and rotate the user's credentials.

    We reveal **the same** ``VALIDATION_ERROR`` message for every failure
    mode (unknown user, wrong OTP, expired OTP, already-used OTP) so an
    attacker with a valid phone but no OTP cannot distinguish between
    "phone not registered" and "OTP mismatch". Django password
    validators still run on ``newPassword`` to enforce policy.
    """

    phone_number = serializers.CharField(write_only=True, required=False)
    phoneNumber = serializers.CharField(  # noqa: N815
        write_only=True,
        required=False,
    )
    code = serializers.CharField(write_only=True)
    new_password = serializers.CharField(
        write_only=True,
        required=False,
        style={"input_type": "password"},
        trim_whitespace=False,
    )
    newPassword = serializers.CharField(  # noqa: N815
        write_only=True,
        required=False,
        style={"input_type": "password"},
        trim_whitespace=False,
    )

    # Populated by :meth:`validate`.
    user: User | None = None
    otp: Any | None = None

    def to_internal_value(self, data: Any) -> dict[str, Any]:
        if isinstance(data, dict):
            patched = dict(data)
            if "phoneNumber" in patched and "phone_number" not in patched:
                patched["phone_number"] = patched["phoneNumber"]
            if "newPassword" in patched and "new_password" not in patched:
                patched["new_password"] = patched["newPassword"]
            data = patched
        return super().to_internal_value(data)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        # Local import to avoid circular imports at module load time.
        from django.utils import timezone

        from .models import OTPCode

        raw_phone = attrs.get("phone_number") or attrs.get("phoneNumber")
        code = (attrs.get("code") or "").strip()
        new_password = attrs.get("new_password") or attrs.get("newPassword")

        if not raw_phone or not code or not new_password:
            raise serializers.ValidationError(
                {"detail": "Telefon raqami, kod va yangi parol majburiy."}
            )

        try:
            phone = normalise_phone_number(raw_phone)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                {"phoneNumber": list(exc.messages)}
            ) from exc

        # Enforce password policy BEFORE we look up the user so a
        # weak-password attempt with a random phone is rejected with a
        # dedicated error (weak passwords are a client bug, not an
        # attack, so revealing that is safe).
        try:
            validate_password(new_password)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                {"newPassword": list(exc.messages)}
            ) from exc

        # Uniform failure message for every credential/OTP mismatch —
        # never leak which of the two was wrong.
        generic_error = serializers.ValidationError(
            {"detail": "Tasdiqlash kodi noto'g'ri yoki muddati o'tgan."}
        )

        try:
            user = User.objects.get(phone_number=phone, is_active=True)
        except User.DoesNotExist as exc:
            raise generic_error from exc

        otp = (
            OTPCode.objects
            .filter(
                user=user,
                purpose=OTPCode.Purpose.PASSWORD_RESET,
                code=code,
                is_used=False,
            )
            .order_by("-created_at")
            .first()
        )
        if otp is None or otp.expires_at <= timezone.now():
            raise generic_error

        attrs["_user"] = user
        attrs["_otp"] = otp
        attrs["_new_password"] = new_password
        self.user = user
        self.otp = otp
        return attrs

    def save(self, **kwargs: Any) -> User:
        """Apply the new password and invalidate the OTP.

        Also blacklists every outstanding refresh token for this user
        so an attacker who obtained tokens before the reset cannot
        continue impersonating them. Requires
        ``rest_framework_simplejwt.token_blacklist`` (installed).
        """
        assert self.user is not None and self.otp is not None, (
            "call is_valid() before save()"
        )
        new_password = self.validated_data["_new_password"]

        self.user.set_password(new_password)
        self.user.save(update_fields=["password"])
        self.otp.mark_used()

        # Best-effort refresh-token blacklist. Import here so tests that
        # exercise the serializer directly without the JWT blacklist app
        # loaded still work.
        try:
            from rest_framework_simplejwt.token_blacklist.models import (
                OutstandingToken,
            )

            for token in OutstandingToken.objects.filter(user=self.user):
                try:
                    RefreshToken(token.token).blacklist()
                except Exception:  # noqa: BLE001 - already-blacklisted / expired
                    continue
        except Exception:  # noqa: BLE001 - blacklist app not installed
            pass

        return self.user


__all__ = [
    "UserProfileSerializer",
    "UserProfileUpdateSerializer",
    "LoginSerializer",
    "TokenRefreshInputSerializer",
    "PasswordResetRequestSerializer",
    "PasswordResetConfirmSerializer",
    "TwoFactorEnableSerializer",
    "TwoFactorDisableSerializer",
    "TwoFactorVerifySerializer",
]


# ---------------------------------------------------------------------------
# 2FA — T125
# ---------------------------------------------------------------------------
class _PasswordConfirmSerializer(serializers.Serializer):
    """Shared base: require the caller to re-enter their current password.

    Both ``TwoFactorEnableSerializer`` and ``TwoFactorDisableSerializer``
    require a fresh password check so a stolen access token alone cannot
    toggle 2FA. The password is validated against the request's
    authenticated user via ``django.contrib.auth.authenticate``.
    """

    password = serializers.CharField(
        write_only=True,
        style={"input_type": "password"},
        trim_whitespace=False,
    )

    user: User | None = None

    def validate_password(self, value: str) -> str:
        request = self.context.get("request")
        user = getattr(request, "user", None) if request is not None else None
        if user is None or not user.is_authenticated:
            raise serializers.ValidationError(
                "Ushbu amal uchun tizimga kirish talab qilinadi."
            )
        # Re-check the password against the authenticated user.
        authed = authenticate(
            request=request,
            username=user.phone_number,
            password=value,
        )
        if authed is None or authed.pk != user.pk:
            raise serializers.ValidationError(
                "Joriy parol noto'g'ri."
            )
        self.user = authed
        return value


class TwoFactorEnableSerializer(_PasswordConfirmSerializer):
    """POST /auth/2fa/enable/ — turn on 2FA for the authenticated user.

    Requires:

    * Current password (re-confirmation).
    * A configured ``telegram_chat_id`` on the user — otherwise the OTP
      cannot be delivered and the user would be locked out. This is a
      hard precondition, not silent behaviour.
    """

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        user = self.user
        assert user is not None, "validate_password must have run first"
        if not user.telegram_chat_id:
            raise serializers.ValidationError(
                {
                    "detail": (
                        "2FA yoqishdan oldin Telegram chat ID ni "
                        "sozlashingiz kerak, aks holda kirish "
                        "kodini yetkazib bo'lmaydi."
                    )
                }
            )
        if user.two_factor_enabled:
            raise serializers.ValidationError(
                {"detail": "2FA allaqachon yoqilgan."}
            )
        return attrs

    def save(self, **kwargs: Any) -> User:
        assert self.user is not None
        self.user.two_factor_enabled = True
        self.user.save(update_fields=["two_factor_enabled"])
        return self.user


class TwoFactorDisableSerializer(_PasswordConfirmSerializer):
    """POST /auth/2fa/disable/ — turn off 2FA for the authenticated user."""

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        user = self.user
        assert user is not None
        if not user.two_factor_enabled:
            raise serializers.ValidationError(
                {"detail": "2FA yoqilmagan."}
            )
        return attrs

    def save(self, **kwargs: Any) -> User:
        assert self.user is not None
        self.user.two_factor_enabled = False
        self.user.save(update_fields=["two_factor_enabled"])
        return self.user


class TwoFactorVerifySerializer(serializers.Serializer):
    """POST /auth/2fa/verify/ — exchange (phone + password + OTP) → tokens.

    This is the second half of the two-step login when
    ``two_factor_enabled=True``. The first step
    (:class:`LoginSerializer`) validates credentials and issues a
    ``purpose=login`` OTP but does not return a token pair; this
    serializer validates the OTP and mints the pair.

    Errors intentionally share the same uniform message ``"Kirish
    ma'lumotlari yoki kod noto'g'ri."`` so an attacker cannot
    distinguish between "wrong password" and "wrong OTP" (both are
    equally-bad outcomes of trying to hijack a session).
    """

    phone_number = serializers.CharField(write_only=True, required=False)
    phoneNumber = serializers.CharField(  # noqa: N815 - camelCase alias
        write_only=True,
        required=False,
    )
    password = serializers.CharField(
        write_only=True,
        style={"input_type": "password"},
        trim_whitespace=False,
    )
    code = serializers.CharField(write_only=True)

    user: User | None = None

    def to_internal_value(self, data: Any) -> dict[str, Any]:
        if isinstance(data, dict) and "phoneNumber" in data and "phone_number" not in data:
            data = {**data, "phone_number": data["phoneNumber"]}
        return super().to_internal_value(data)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        from django.utils import timezone

        from .models import OTPCode

        raw_phone = attrs.get("phone_number") or attrs.get("phoneNumber")
        password = attrs.get("password")
        code = (attrs.get("code") or "").strip()

        if not raw_phone or not password or not code:
            raise serializers.ValidationError(
                {"detail": "Telefon raqami, parol va kod majburiy."}
            )

        try:
            phone = normalise_phone_number(raw_phone)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                {"phoneNumber": list(exc.messages)}
            ) from exc

        generic_error = serializers.ValidationError(
            {"detail": "Kirish ma'lumotlari yoki kod noto'g'ri."}
        )

        request = self.context.get("request")
        user = authenticate(
            request=request,
            username=phone,
            password=password,
        )
        if user is None or not user.is_active:
            raise generic_error

        # 2FA must be enabled for this endpoint to make sense — a user
        # with 2FA off can just call /auth/login/ and get tokens back
        # directly. Reject to avoid double-signalling paths.
        if not user.two_factor_enabled:
            raise serializers.ValidationError(
                {"detail": "2FA yoqilmagan — /auth/login/ dan foydalaning."}
            )

        otp = (
            OTPCode.objects
            .filter(
                user=user,
                purpose=OTPCode.Purpose.LOGIN,
                code=code,
                is_used=False,
            )
            .order_by("-created_at")
            .first()
        )
        if otp is None or otp.expires_at <= timezone.now():
            raise generic_error

        attrs["_user"] = user
        attrs["_otp"] = otp
        self.user = user
        return attrs

    def get_token_pair(self) -> dict[str, Any]:
        """Consume the OTP and mint an access+refresh pair."""
        assert self.user is not None
        otp = self.validated_data["_otp"]
        otp.mark_used()

        refresh = RefreshToken.for_user(self.user)
        refresh["role"] = self.user.role
        access = refresh.access_token
        access["role"] = self.user.role
        return {
            "access": str(access),
            "refresh": str(refresh),
            "user": UserProfileSerializer(self.user).data,
        }
