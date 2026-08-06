"""URL routes for the accounts app under ``/api/v1/auth/``."""
from __future__ import annotations

from django.urls import path

from .views import (
    LoginView,
    MeView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    TokenRefreshView,
    TwoFactorDisableView,
    TwoFactorEnableView,
    TwoFactorVerifyView,
)

app_name = "accounts"

urlpatterns = [
    path("login/", LoginView.as_view(), name="login"),
    path("refresh/", TokenRefreshView.as_view(), name="refresh"),
    path("me/", MeView.as_view(), name="me"),
    # T119 — password reset (OTP flow).
    path(
        "password-reset/request/",
        PasswordResetRequestView.as_view(),
        name="password-reset-request",
    ),
    path(
        "password-reset/confirm/",
        PasswordResetConfirmView.as_view(),
        name="password-reset-confirm",
    ),
    # T125 — 2FA toggle + verify flow.
    path("2fa/enable/", TwoFactorEnableView.as_view(), name="two-factor-enable"),
    path("2fa/disable/", TwoFactorDisableView.as_view(), name="two-factor-disable"),
    path("2fa/verify/", TwoFactorVerifyView.as_view(), name="two-factor-verify"),
]
