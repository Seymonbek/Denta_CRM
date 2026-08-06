"""Write-side business logic for the ``doctors`` app.

All mutations go through these functions so validation is centralised
and transactional. Views only orchestrate — they never touch models
directly for writes.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any, Iterable  # noqa: UP035 - Iterable kept in typing for clarity

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q

from apps.departments.models import Department

from .models import (
    CommissionBasis,
    DoctorProfile,
    ProcedureType,
    TimeOff,
    Weekday,
    WorkingHours,
)

User = get_user_model()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _to_decimal(value: Any, *, field: str) -> Decimal:
    if value is None:
        raise ValidationError({field: ["Qiymat majburiy."]})
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValidationError({field: ["Noto'g'ri son formati."]}) from exc


def _assert_commission_rate(value: Decimal, *, field: str) -> None:
    if value < Decimal("0") or value > Decimal("100"):
        raise ValidationError({field: ["Komissiya foizi 0..100 oralig'ida bo'lishi kerak."]})


def _clean_time(value: Any, *, field: str) -> time:
    if isinstance(value, time):
        return value
    if isinstance(value, str):
        for fmt in ("%H:%M", "%H:%M:%S"):
            try:
                return datetime.strptime(value, fmt).time()
            except ValueError:
                continue
    raise ValidationError({field: ["Vaqtni HH:MM formatida yuboring."]})


def _clean_date(value: Any, *, field: str) -> date:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        try:
            return datetime.strptime(value, "%Y-%m-%d").date()
        except ValueError as exc:
            raise ValidationError({field: ["Sanani YYYY-MM-DD formatida yuboring."]}) from exc
    raise ValidationError({field: ["Noto'g'ri sana."]})


# ---------------------------------------------------------------------------
# DoctorProfile
# ---------------------------------------------------------------------------
DOCTOR_ELIGIBLE_ROLES = frozenset({User.Role.BOSH_SHIFOKOR, User.Role.DOCTOR})


@transaction.atomic
def create_doctor_profile(
    *,
    user: User,
    department_ids: Iterable[str] | None = None,
    specialization: str = "",
    bio: str = "",
    commission_basis: str = CommissionBasis.FROM_TOTAL,
    default_commission_rate: Any = Decimal("30.00"),
    can_view_other_doctors: bool = False,
) -> DoctorProfile:
    """Attach a ``DoctorProfile`` to an existing ``User``."""
    if not isinstance(user, User):
        raise ValidationError({"user": ["Foydalanuvchi majburiy."]})
    if getattr(user, "role", None) not in DOCTOR_ELIGIBLE_ROLES:
        raise ValidationError(
            {"user": ["Faqat bosh_shifokor yoki doctor rolidagi foydalanuvchi shifokor bo'la oladi."]}
        )
    if hasattr(user, "doctor_profile") and user.doctor_profile is not None:
        try:
            existing = user.doctor_profile
        except DoctorProfile.DoesNotExist:  # pragma: no cover - Django lazy
            existing = None
        if existing is not None and existing.pk:
            raise ValidationError({"user": ["Bu foydalanuvchi uchun profil allaqachon mavjud."]})

    if commission_basis not in CommissionBasis.values:
        raise ValidationError({"commission_basis": ["Noto'g'ri komissiya asosi."]})

    rate = _to_decimal(default_commission_rate, field="default_commission_rate")
    _assert_commission_rate(rate, field="default_commission_rate")

    profile = DoctorProfile.objects.create(
        user=user,
        specialization=(specialization or "").strip(),
        bio=(bio or "").strip(),
        commission_basis=commission_basis,
        default_commission_rate=rate,
        can_view_other_doctors=bool(can_view_other_doctors),
    )

    if department_ids:
        _assign_departments(profile, department_ids)

    return profile


@transaction.atomic
def update_doctor_profile(
    profile: DoctorProfile,
    *,
    specialization: str | None = None,
    bio: str | None = None,
    commission_basis: str | None = None,
    default_commission_rate: Any = None,
    can_view_other_doctors: bool | None = None,
    department_ids: Iterable[str] | None = None,
    is_active: bool | None = None,
) -> DoctorProfile:
    update_fields: list[str] = []

    if specialization is not None:
        profile.specialization = (specialization or "").strip()
        update_fields.append("specialization")

    if bio is not None:
        profile.bio = (bio or "").strip()
        update_fields.append("bio")

    if commission_basis is not None:
        if commission_basis not in CommissionBasis.values:
            raise ValidationError({"commission_basis": ["Noto'g'ri komissiya asosi."]})
        profile.commission_basis = commission_basis
        update_fields.append("commission_basis")

    if default_commission_rate is not None:
        rate = _to_decimal(default_commission_rate, field="default_commission_rate")
        _assert_commission_rate(rate, field="default_commission_rate")
        profile.default_commission_rate = rate
        update_fields.append("default_commission_rate")

    if can_view_other_doctors is not None:
        profile.can_view_other_doctors = bool(can_view_other_doctors)
        update_fields.append("can_view_other_doctors")

    if is_active is not None:
        profile.is_active = bool(is_active)
        update_fields.append("is_active")

    if update_fields:
        profile.save(update_fields=update_fields + ["updated_at"])

    if department_ids is not None:
        _assign_departments(profile, department_ids)

    return profile


def _assign_departments(profile: DoctorProfile, department_ids: Iterable[str]) -> None:
    ids = [d for d in (department_ids or []) if d]
    if not ids:
        profile.departments.clear()
        return
    found = list(
        Department.objects.filter(pk__in=ids, is_active=True).values_list("pk", flat=True)
    )
    if len(found) != len(set(ids)):
        raise ValidationError(
            {"department_ids": ["Bir yoki bir nechta bo'lim topilmadi yoki faol emas."]}
        )
    profile.departments.set(found)


# ---------------------------------------------------------------------------
# WorkingHours
# ---------------------------------------------------------------------------
@transaction.atomic
def create_working_hours(
    *,
    doctor: DoctorProfile,
    weekday: int,
    start_time: Any,
    end_time: Any,
) -> WorkingHours:
    weekday_int = _validate_weekday(weekday)
    start = _clean_time(start_time, field="start_time")
    end = _clean_time(end_time, field="end_time")

    if start >= end:
        raise ValidationError({"end_time": ["Tugash vaqti boshlanish vaqtidan keyin bo'lishi kerak."]})

    if _has_overlapping_shift(doctor, weekday_int, start, end):
        raise ValidationError(
            {"start_time": ["Bu vaqt oralig'ida boshqa smena mavjud."]}
        )

    return WorkingHours.objects.create(
        doctor=doctor,
        weekday=weekday_int,
        start_time=start,
        end_time=end,
    )


def _validate_weekday(value: Any) -> int:
    try:
        value_int = int(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError({"weekday": ["Hafta kuni 0..6 bo'lishi kerak."]}) from exc
    if value_int not in Weekday.values:
        raise ValidationError({"weekday": ["Hafta kuni 0..6 bo'lishi kerak."]})
    return value_int


def _has_overlapping_shift(
    doctor: DoctorProfile,
    weekday: int,
    start: time,
    end: time,
    *,
    exclude_id: str | None = None,
) -> bool:
    qs = WorkingHours.objects.filter(
        doctor=doctor,
        weekday=weekday,
    ).filter(Q(start_time__lt=end) & Q(end_time__gt=start))
    if exclude_id is not None:
        qs = qs.exclude(pk=exclude_id)
    return qs.exists()


@transaction.atomic
def delete_working_hours(entry: WorkingHours) -> None:
    entry.delete()


# ---------------------------------------------------------------------------
# TimeOff
# ---------------------------------------------------------------------------
@transaction.atomic
def create_time_off(
    *,
    doctor: DoctorProfile,
    date_start: Any,
    date_end: Any,
    reason: str = "",
) -> TimeOff:
    start = _clean_date(date_start, field="date_start")
    end = _clean_date(date_end, field="date_end")
    if start > end:
        raise ValidationError(
            {"date_end": ["Tugash sanasi boshlanish sanasidan oldin bo'lishi mumkin emas."]}
        )
    # Reject overlapping time off entries — clinicians shouldn't get double
    # rows for the same span (harmless but confusing).
    overlap = TimeOff.objects.filter(
        doctor=doctor,
        date_start__lte=end,
        date_end__gte=start,
    ).exists()
    if overlap:
        raise ValidationError(
            {"date_start": ["Bu davrda boshqa dam olish yozuvi mavjud."]}
        )
    return TimeOff.objects.create(
        doctor=doctor,
        date_start=start,
        date_end=end,
        reason=(reason or "").strip(),
    )


@transaction.atomic
def delete_time_off(entry: TimeOff) -> None:
    entry.delete()


# ---------------------------------------------------------------------------
# ProcedureType
# ---------------------------------------------------------------------------
@transaction.atomic
def create_procedure_type(
    *,
    name: str,
    department: Department,
    default_duration_minutes: int = 30,
    default_price: Any = Decimal("0.00"),
    commission_rate_override: Any = None,
) -> ProcedureType:
    if not name or not str(name).strip():
        raise ValidationError({"name": ["Muolaja nomi majburiy."]})
    if not isinstance(department, Department):
        raise ValidationError({"department": ["Bo'lim majburiy."]})
    if not department.is_active:
        raise ValidationError({"department": ["Bo'lim faol emas."]})
    try:
        duration = int(default_duration_minutes)
    except (TypeError, ValueError) as exc:
        raise ValidationError({"default_duration_minutes": ["Butun son yuboring."]}) from exc
    if duration <= 0 or duration > 24 * 60:
        raise ValidationError({"default_duration_minutes": ["1..1440 daqiqa oralig'ida bo'lsin."]})

    price = _to_decimal(default_price, field="default_price")
    if price < Decimal("0"):
        raise ValidationError({"default_price": ["Narx manfiy bo'lmaydi."]})

    override: Decimal | None = None
    if commission_rate_override is not None and commission_rate_override != "":
        override = _to_decimal(commission_rate_override, field="commission_rate_override")
        _assert_commission_rate(override, field="commission_rate_override")

    clean_name = " ".join(str(name).split())
    dup = ProcedureType.objects.filter(
        department=department, name__iexact=clean_name, is_active=True
    ).exists()
    if dup:
        raise ValidationError({"name": ["Bu bo'limda shu nomdagi muolaja mavjud."]})

    return ProcedureType.objects.create(
        name=clean_name,
        department=department,
        default_duration_minutes=duration,
        default_price=price,
        commission_rate_override=override,
    )


@transaction.atomic
def update_procedure_type(
    procedure: ProcedureType,
    *,
    name: str | None = None,
    department: Department | None = None,
    default_duration_minutes: int | None = None,
    default_price: Any = None,
    commission_rate_override: Any = "__unset__",
    is_active: bool | None = None,
) -> ProcedureType:
    update_fields: list[str] = []

    if name is not None:
        clean_name = " ".join(str(name).split())
        if not clean_name:
            raise ValidationError({"name": ["Muolaja nomi majburiy."]})
        dup_qs = ProcedureType.objects.filter(
            department=department or procedure.department,
            name__iexact=clean_name,
            is_active=True,
        ).exclude(pk=procedure.pk)
        if dup_qs.exists():
            raise ValidationError({"name": ["Bu bo'limda shu nomdagi muolaja mavjud."]})
        procedure.name = clean_name
        update_fields.append("name")

    if department is not None:
        if not isinstance(department, Department):
            raise ValidationError({"department": ["Bo'lim majburiy."]})
        if not department.is_active:
            raise ValidationError({"department": ["Bo'lim faol emas."]})
        procedure.department = department
        update_fields.append("department")

    if default_duration_minutes is not None:
        try:
            duration = int(default_duration_minutes)
        except (TypeError, ValueError) as exc:
            raise ValidationError(
                {"default_duration_minutes": ["Butun son yuboring."]}
            ) from exc
        if duration <= 0 or duration > 24 * 60:
            raise ValidationError(
                {"default_duration_minutes": ["1..1440 daqiqa oralig'ida bo'lsin."]}
            )
        procedure.default_duration_minutes = duration
        update_fields.append("default_duration_minutes")

    if default_price is not None:
        price = _to_decimal(default_price, field="default_price")
        if price < Decimal("0"):
            raise ValidationError({"default_price": ["Narx manfiy bo'lmaydi."]})
        procedure.default_price = price
        update_fields.append("default_price")

    if commission_rate_override != "__unset__":
        if commission_rate_override in (None, ""):
            procedure.commission_rate_override = None
        else:
            override = _to_decimal(
                commission_rate_override, field="commission_rate_override"
            )
            _assert_commission_rate(override, field="commission_rate_override")
            procedure.commission_rate_override = override
        update_fields.append("commission_rate_override")

    if is_active is not None:
        procedure.is_active = bool(is_active)
        update_fields.append("is_active")

    if update_fields:
        procedure.save(update_fields=update_fields + ["updated_at"])

    return procedure


@transaction.atomic
def soft_delete_procedure_type(procedure: ProcedureType) -> ProcedureType:
    if procedure.is_active:
        procedure.is_active = False
        procedure.save(update_fields=["is_active", "updated_at"])
    return procedure


# ---------------------------------------------------------------------------
# Available slots
# ---------------------------------------------------------------------------
DEFAULT_SLOT_MINUTES = 30


def compute_available_slots(
    doctor: DoctorProfile,
    *,
    day: date,
    slot_minutes: int = DEFAULT_SLOT_MINUTES,
    procedure: ProcedureType | None = None,
    booked_ranges: Iterable[tuple[datetime, datetime]] | None = None,
) -> list[dict[str, str]]:
    """Return a list of ``{start, end}`` ISO strings for the given day.

    The algorithm is deterministic:

    1. If any :class:`TimeOff` covers ``day`` → no slots.
    2. Otherwise, take every :class:`WorkingHours` for the weekday.
    3. Chunk each shift into ``slot_minutes``-long windows (or the
       ``procedure.default_duration_minutes`` when passed).
    4. Drop any window that overlaps ``booked_ranges`` (populated by
       :mod:`apps.scheduling` in T10; empty here).

    ``booked_ranges`` must be timezone-aware ``datetime`` tuples.
    """
    if TimeOff.objects.filter(
        doctor=doctor, date_start__lte=day, date_end__gte=day
    ).exists():
        return []

    duration = procedure.default_duration_minutes if procedure else slot_minutes
    if duration <= 0:
        duration = DEFAULT_SLOT_MINUTES

    shifts = WorkingHours.objects.filter(
        doctor=doctor, weekday=day.weekday()
    ).order_by("start_time")

    booked = _normalise_booked_ranges(booked_ranges)

    slots: list[dict[str, str]] = []
    for shift in shifts:
        cursor = datetime.combine(day, shift.start_time)
        shift_end = datetime.combine(day, shift.end_time)
        step = timedelta(minutes=duration)
        while cursor + step <= shift_end:
            slot_start = cursor
            slot_end = cursor + step
            if not _overlaps_any(slot_start, slot_end, booked):
                slots.append(
                    {"start": slot_start.isoformat(), "end": slot_end.isoformat()}
                )
            cursor = cursor + step
    return slots


def _normalise_booked_ranges(
    ranges: Iterable[tuple[datetime, datetime]] | None,
) -> list[tuple[datetime, datetime]]:
    if not ranges:
        return []
    out: list[tuple[datetime, datetime]] = []
    for pair in ranges:
        if not pair or len(pair) != 2:
            continue
        start, end = pair
        if isinstance(start, datetime) and isinstance(end, datetime) and start < end:
            out.append((start, end))
    return out


def _overlaps_any(
    start: datetime, end: datetime, ranges: list[tuple[datetime, datetime]]
) -> bool:
    for r_start, r_end in ranges:
        # Compare as naive if slot is naive; otherwise both must be aware.
        if start.tzinfo is None and r_start.tzinfo is not None:
            r_start = r_start.replace(tzinfo=None)
            r_end = r_end.replace(tzinfo=None)
        if start < r_end and r_start < end:
            return True
    return False


__all__ = [
    "DOCTOR_ELIGIBLE_ROLES",
    "create_doctor_profile",
    "update_doctor_profile",
    "create_working_hours",
    "delete_working_hours",
    "create_time_off",
    "delete_time_off",
    "create_procedure_type",
    "update_procedure_type",
    "soft_delete_procedure_type",
    "compute_available_slots",
    "DEFAULT_SLOT_MINUTES",
]
