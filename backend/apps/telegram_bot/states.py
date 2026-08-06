"""FSM states for the staff Telegram bot flows."""
from __future__ import annotations

try:
    from aiogram.fsm.state import State, StatesGroup
except Exception:  # pragma: no cover - aiogram absent in some test envs
    # Fallback dummies so importing this module never crashes.
    class _StateStub:
        pass

    class StatesGroup:  # type: ignore[no-redef]
        pass

    State = _StateStub  # type: ignore[assignment,misc]


class PhoneVerification(StatesGroup):
    """Multi-step flow: user shares phone → OTP → link chat_id."""

    waiting_for_phone = State()
    waiting_for_otp = State()


__all__ = ["PhoneVerification"]
