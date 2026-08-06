"""DentaCRM project package.

The Celery application is exposed at the package level so that
``@shared_task`` decorators anywhere in the codebase pick it up when the
Django settings are loaded.
"""
from __future__ import annotations

from .celery import app as celery_app

__all__ = ("celery_app",)
