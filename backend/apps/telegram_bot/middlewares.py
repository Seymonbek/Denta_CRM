"""Aiogram middlewares — throttling + structured logging.

Kept minimal and dependency-safe: the module can be imported without
aiogram installed (returns no-op middlewares).
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict
from collections.abc import Awaitable, Callable
from typing import Any

logger = logging.getLogger(__name__)

try:
    from aiogram import BaseMiddleware
    from aiogram.types import Update
except Exception:  # pragma: no cover - aiogram absent
    BaseMiddleware = object  # type: ignore[assignment,misc]
    Update = Any  # type: ignore[misc]


class ThrottlingMiddleware(BaseMiddleware):  # type: ignore[misc]
    """Reject repeat updates from the same chat inside a small window.

    A per-chat sliding window of ``window_seconds`` allows at most
    ``max_calls`` updates. Extra updates are dropped (returned as None)
    and logged at DEBUG.
    """

    def __init__(self, *, max_calls: int = 5, window_seconds: float = 3.0) -> None:
        super().__init__()
        self.max_calls = max_calls
        self.window_seconds = window_seconds
        self._history: dict[int, list[float]] = defaultdict(list)

    def _check(self, chat_id: int | None) -> bool:
        if chat_id is None:
            return True
        now = time.monotonic()
        history = self._history[chat_id]
        history[:] = [t for t in history if now - t < self.window_seconds]
        if len(history) >= self.max_calls:
            return False
        history.append(now)
        return True

    async def __call__(  # type: ignore[override]
        self,
        handler: Callable[[Any, dict[str, Any]], Awaitable[Any]],
        event: Any,
        data: dict[str, Any],
    ) -> Any:
        chat_id = None
        try:
            chat_id = event.chat.id if getattr(event, "chat", None) else None
            if chat_id is None:
                chat_id = getattr(getattr(event, "from_user", None), "id", None)
        except Exception:  # noqa: BLE001
            chat_id = None
        if not self._check(chat_id):
            logger.debug("telegram_bot: throttled chat_id=%s", chat_id)
            return None
        return await handler(event, data)


class LoggingMiddleware(BaseMiddleware):  # type: ignore[misc]
    """Log update metadata at INFO."""

    async def __call__(  # type: ignore[override]
        self,
        handler: Callable[[Any, dict[str, Any]], Awaitable[Any]],
        event: Any,
        data: dict[str, Any],
    ) -> Any:
        try:
            chat_id = getattr(getattr(event, "chat", None), "id", None)
            user_id = getattr(getattr(event, "from_user", None), "id", None)
            text = getattr(event, "text", "")
            logger.info(
                "telegram_bot: update chat=%s user=%s text=%s",
                chat_id,
                user_id,
                (text or "")[:120],
            )
        except Exception:  # noqa: BLE001
            pass
        return await handler(event, data)


__all__ = ["ThrottlingMiddleware", "LoggingMiddleware"]
