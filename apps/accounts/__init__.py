"""Accounts app — custom User model, OTP codes, and JWT authentication.

The custom :class:`accounts.models.User` uses ``phone_number`` as its
username field (per PROJECT_BRIEF.md § accounts app). The three business
roles (bosh_shifokor / doctor / administrator) are enforced through the
``role`` field and the permission classes in ``apps.core.permissions``.
"""

default_app_config = "apps.accounts.apps.AccountsConfig"
