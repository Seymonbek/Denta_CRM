"""User & OTP models for DentaCRM.

Design decisions:

* ``phone_number`` is the natural key (``USERNAME_FIELD``). Passwords
  are still stored via Django's normal PBKDF2 hasher so we can reuse
  ``authenticate()`` and the admin.
* ``role`` is a small, closed enum matching PROJECT_BRIEF.md — mirrored
  in :mod:`apps.core.permissions` as ``ROLE_*`` constants.
* We inherit :class:`AbstractBaseUser` + :class:`PermissionsMixin` (not
  :class:`AbstractUser`) so we can drop the legacy ``username`` field
  entirely.
* Because DentaCRM's :class:`apps.core.models.BaseModel` uses a UUID
  primary key, ``User`` follows the same pattern for consistency across
  the schema (FKs from every business model land on ``User.id``).
"""
from __future__ import annotations

import re
import secrets
import uuid
from datetime import timedelta
from typing import Any

from django.contrib.auth.hashers import make_password
from django.contrib.auth.models import (
    AbstractBaseUser,
    BaseUserManager,
    PermissionsMixin,
)
from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

# ---------------------------------------------------------------------------
# Phone-number normalisation
# ---------------------------------------------------------------------------
_PHONE_STRIP_RE = re.compile(r"[\s\-()]")
# Accept E.164-ish numbers: optional '+', 7-15 digits.
_PHONE_VALIDATE_RE = re.compile(r"^\+?[0-9]{7,15}$")

phone_number_validator = RegexValidator(
    regex=_PHONE_VALIDATE_RE,
    message=_(
        "Telefon raqami xalqaro formatda bo'lishi kerak (masalan, +998901234567)."
    ),
)


def normalise_phone_number(raw: str) -> str:
    """Strip whitespace/punctuation and validate the phone number.

    Raises :class:`django.core.exceptions.ValidationError` for empty or
    malformed input so serializers can surface the standard error
    envelope.
    """
    if raw is None:
        raise ValidationError(_("Telefon raqami majburiy."))
    cleaned = _PHONE_STRIP_RE.sub("", str(raw)).strip()
    if not cleaned:
        raise ValidationError(_("Telefon raqami majburiy."))
    if not _PHONE_VALIDATE_RE.match(cleaned):
        raise ValidationError(
            _("Telefon raqami xalqaro formatda bo'lishi kerak.")
        )
    return cleaned


# ---------------------------------------------------------------------------
# Manager
# ---------------------------------------------------------------------------
class UserManager(BaseUserManager):
    """Manager for the custom User model."""

    use_in_migrations = True

    def _create_user(
        self,
        phone_number: str,
        password: str | None,
        **extra_fields: Any,
    ):
        phone_number = normalise_phone_number(phone_number)
        user = self.model(phone_number=phone_number, **extra_fields)
        # ``set_password`` handles hashing (or None → unusable password).
        user.set_password(password)
        user.full_clean(exclude=["password"])
        user.save(using=self._db)
        return user

    def create_user(
        self,
        phone_number: str,
        password: str | None = None,
        **extra_fields: Any,
    ):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        extra_fields.setdefault("role", User.Role.ADMINISTRATOR)
        return self._create_user(phone_number, password, **extra_fields)

    def create_superuser(
        self,
        phone_number: str,
        password: str | None = None,
        **extra_fields: Any,
    ):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", User.Role.BOSH_SHIFOKOR)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")

        return self._create_user(phone_number, password, **extra_fields)


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------
class User(AbstractBaseUser, PermissionsMixin):
    """DentaCRM user account.

    We intentionally do **not** inherit from ``apps.core.models.BaseModel``
    because Django's user model is created very early during migrations
    and we want an explicit, minimal field list.
    """

    class Role(models.TextChoices):
        BOSH_SHIFOKOR = "bosh_shifokor", _("Bosh shifokor")
        DOCTOR = "doctor", _("Shifokor")
        ADMINISTRATOR = "administrator", _("Administrator")

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
        verbose_name=_("ID"),
    )
    phone_number = models.CharField(
        _("Telefon raqami"),
        max_length=20,
        unique=True,
        validators=[phone_number_validator],
        help_text=_("Xalqaro formatda, masalan +998901234567."),
    )
    first_name = models.CharField(_("Ism"), max_length=100)
    last_name = models.CharField(_("Familiya"), max_length=100)
    role = models.CharField(
        _("Roli"),
        max_length=20,
        choices=Role.choices,
        default=Role.ADMINISTRATOR,
    )
    telegram_chat_id = models.BigIntegerField(
        _("Telegram chat ID"),
        null=True,
        blank=True,
        unique=True,
    )
    two_factor_enabled = models.BooleanField(
        _("2FA yoqilgan"),
        default=False,
    )
    is_active = models.BooleanField(_("Faol"), default=True)
    is_staff = models.BooleanField(
        _("Xodim (admin panel)"),
        default=False,
        help_text=_("Django admin panelga kirish uchun."),
    )
    date_joined = models.DateTimeField(
        _("Ro'yxatdan o'tgan sana"),
        default=timezone.now,
    )
    last_login = models.DateTimeField(_("Oxirgi kirish"), null=True, blank=True)

    objects = UserManager()

    USERNAME_FIELD = "phone_number"
    REQUIRED_FIELDS = ["first_name", "last_name"]

    class Meta:
        verbose_name = _("Foydalanuvchi")
        verbose_name_plural = _("Foydalanuvchilar")
        ordering = ["last_name", "first_name"]
        indexes = [
            models.Index(fields=["role"], name="accounts_user_role_idx"),
        ]

    # ---------------------------------------------------------------
    # Convenience
    # ---------------------------------------------------------------
    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"{self.full_name} ({self.phone_number})"

    @property
    def full_name(self) -> str:
        parts = [self.first_name, self.last_name]
        return " ".join(p for p in parts if p).strip()

    def get_full_name(self) -> str:
        return self.full_name

    def get_short_name(self) -> str:
        return self.first_name

    def clean(self) -> None:  # noqa: D401
        super().clean()
        if self.phone_number:
            self.phone_number = normalise_phone_number(self.phone_number)


# ---------------------------------------------------------------------------
# OTP codes
# ---------------------------------------------------------------------------
def _default_otp_expiry() -> Any:
    """Default OTP TTL — 10 minutes from creation."""
    return timezone.now() + timedelta(minutes=10)


def generate_otp_code(length: int = 6) -> str:
    """Return a cryptographically-random N-digit numeric OTP code."""
    upper = 10 ** length
    number = secrets.randbelow(upper)
    return str(number).zfill(length)


class OTPCode(models.Model):
    """One-time password used for login or password reset flows."""

    class Purpose(models.TextChoices):
        LOGIN = "login", _("Kirish")
        PASSWORD_RESET = "password_reset", _("Parolni tiklash")

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="otp_codes",
        verbose_name=_("Foydalanuvchi"),
    )
    code = models.CharField(_("Kod"), max_length=10)
    purpose = models.CharField(
        _("Maqsad"),
        max_length=20,
        choices=Purpose.choices,
        default=Purpose.LOGIN,
    )
    expires_at = models.DateTimeField(
        _("Amal qilish muddati"),
        default=_default_otp_expiry,
    )
    is_used = models.BooleanField(_("Ishlatilgan"), default=False)
    created_at = models.DateTimeField(_("Yaratilgan sana"), auto_now_add=True)

    class Meta:
        verbose_name = _("OTP kod")
        verbose_name_plural = _("OTP kodlar")
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["user", "purpose", "is_used"],
                name="accounts_otp_lookup_idx",
            ),
        ]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"OTP({self.purpose}) → {self.user_id}"

    @property
    def is_expired(self) -> bool:
        return timezone.now() >= self.expires_at

    def mark_used(self) -> None:
        self.is_used = True
        self.save(update_fields=["is_used"])


# Ensure ``make_password`` is importable elsewhere without another import.
__all__ = [
    "User",
    "UserManager",
    "OTPCode",
    "normalise_phone_number",
    "phone_number_validator",
    "generate_otp_code",
    "make_password",
]
