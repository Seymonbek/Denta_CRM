"""FSM States for Telegram bot flows (Phone auth, Appointment booking, AI chat mode)."""
from __future__ import annotations

try:
    from aiogram.fsm.state import State, StatesGroup
except Exception:  # pragma: no cover - aiogram absent in test envs
    class _StateStub:
        pass

    class StatesGroup:  # type: ignore[no-redef]
        pass

    State = _StateStub  # type: ignore[assignment,misc]


class PhoneVerification(StatesGroup):
    """Multi-step flow: user shares phone → link chat_id."""

    waiting_for_phone = State()


class BookingFlow(StatesGroup):
    """Interactive FSM for patient booking appointment."""

    selecting_doctor = State()
    selecting_date = State()
    selecting_slot = State()


class AIChatState(StatesGroup):
    """Interactive continuous AI assistant chat mode."""

    in_chat = State()


__all__ = ["PhoneVerification", "BookingFlow", "AIChatState"]
