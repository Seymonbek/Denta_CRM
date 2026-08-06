#!/usr/bin/env python
"""Django management entry-point for DentaCRM."""
from __future__ import annotations

import os
import sys
from pathlib import Path


def main() -> None:
    """Run administrative tasks."""
    # Default settings module — override with DJANGO_SETTINGS_MODULE env var.
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

    # Load .env file (if present) BEFORE Django reads settings so that
    # DATABASE_URL / DJANGO_SECRET_KEY / etc. are visible.
    try:
        from dotenv import load_dotenv

        env_path = Path(__file__).resolve().parent / ".env"
        if env_path.exists():
            load_dotenv(env_path)
        else:
            # Also try the compose-level .env one directory up (dentacrm/.env).
            parent_env = Path(__file__).resolve().parent.parent / ".env"
            if parent_env.exists():
                load_dotenv(parent_env)
    except ImportError:
        # python-dotenv is optional at runtime — the container passes env
        # variables directly through docker-compose env_file.
        pass

    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:  # pragma: no cover - import failure path
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc

    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
