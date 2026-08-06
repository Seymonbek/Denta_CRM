"""Write-side business logic for the ``scheduling`` app.

All mutations go through these functions so validation is centralised
and transactional. Views are thin orchestrators.

Key rules enforced:

* ``scheduled_start < scheduled_end`` (also enforced by a DB
  CheckConstraint).
* ``procedure_type.department`` must match ``department`` when both
  are provided.
* ``TimeOff`` covering the day rejects the appointment.
* No overlap with another blocking appointment for the same doctor.
* Status transitions follow a small state machine — you cannot move a
  cancelled/completed appointment back into ``scheduled``.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.departments.models import Department
from apps.doctors.models import DoctorProfile, ProcedureType, TimeOff, WorkingHours
from apps.patients.models import Patient

from .models import BLOCKING_STATUSES, Appointment, AppointmentStatus
from .selectors import has_overlap

User = get_user_model()


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------
def _clean_datetime(value: Any, *, field: str) -> datetime:
    """Accept ``datetime`` or ISO-8601 string; return an aware datetime."""
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str) and value.strip():
        try:
            # Support 'Z' suffix — datetime.fromisoformat did in 3.11+.
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValidationError(
                {field: ["ISO-8601 formatida datetime yuboring."]}
            ) from exc
    else:
        raise ValidationError({field: ["Vaqt majburiy."]})

    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    return dt


def _validate_status(value: Any) -> str:
    if value not in AppointmentStatus.values:
        raise ValidationError({"status": [f"Noto'g'ri holat: {value!r}."]})
    return str(value)


def _validate_range(start: datetime, end: datetime) -> None:
    if end <= start:
        raise ValidationError(
            {"scheduled_end": ["Tugash vaqti boshlanish vaqtidan keyin bo'lishi kerak."]}
        )
    if (end - start).total_seconds() < 60:
        raise ValidationError(
            {"scheduled_end": ["Navbat kamida 1 daqiqa davom etishi kerak."]}
        )
    if (end - start).total_seconds() > 24 * 3600:
        raise ValidationError(
            {"scheduled_end": ["Navbat 24 soatdan uzun bo'la olmaydi."]}
        )


def _resolve_patient(patient: Any) -> Patient:
    if isinstance(patient, Patient):
        return patient
    try:
        return Patient.objects.get(pk=patient)
    except Patient.DoesNotExist as exc:
        raise ValidationError({"patient": ["Bemor topilmadi."]}) from exc


def _resolve_doctor(doctor: Any) -> DoctorProfile:
    if isinstance(doctor, DoctorProfile):
        return doctor
    try:
        return DoctorProfile.objects.select_related("user").get(pk=doctor)
    except DoctorProfile.DoesNotExist as exc:
        raise ValidationError({"doctor": ["Shifokor topilmadi."]}) from exc


def _resolve_department(department: Any) -> Department:
    if isinstance(department, Department):
        return department
    try:
        return Department.objects.get(pk=department)
    except Department.DoesNotExist as exc:
        raise ValidationError({"department": ["Bo'lim topilmadi."]}) from exc


def _resolve_procedure_type(procedure: Any) -> ProcedureType | None:
    if procedure in (None, ""):
        return None
    if isinstance(procedure, ProcedureType):
        return procedure
    try:
        return ProcedureType.objects.select_related("department").get(pk=procedure)
    except ProcedureType.DoesNotExist as exc:
        raise ValidationError({"procedure_type": ["Muolaja turi topilmadi."]}) from exc


def _check_doctor_available(
    doctor: DoctorProfile, start: datetime, end: datetime
) -> None:
    """Reject if any TimeOff blocks the day of the appointment."""
    day_start = start.date()
    day_end = end.date()
    covering = TimeOff.objects.filter(
        doctor=doctor,
        date_start__lte=day_end,
        date_end__gte=day_start,
    ).exists()
    if covering:
        raise ValidationError(
            {"scheduled_start": ["Bu kunda shifokor dam olishda."]}
        )


def _check_doctor_working_hours(
    doctor: DoctorProfile, start: datetime, end: datetime
) -> None:
    """Reject if the appointment start and end times do not fall within the doctor's WorkingHours."""
    start_local = timezone.localtime(start)
    end_local = timezone.localtime(end)

    if start_local.date() != end_local.date():
        raise ValidationError(
            {"scheduled_start": ["Navbat bir kundan oshmasligi yoki kundan-kunga o'tmasligi kerak."]}
        )

    weekday = start_local.weekday()
    time_start = start_local.time()
    time_end = end_local.time()

    shifts = WorkingHours.objects.filter(
        doctor=doctor,
        weekday=weekday,
        start_time__lte=time_start,
        end_time__gte=time_end,
    )
    if not shifts.exists():
        raise ValidationError(
            {"scheduled_start": ["Tanlangan vaqt shifokorning ish soatlariga to'g'ri kelmaydi."]}
        )


def _check_patient_double_booking(
    patient: Patient,
    start: datetime,
    end: datetime,
    *,
    exclude_id: str | None = None,
) -> None:
    """Reject if the *patient* already has a blocking appointment overlapping."""
    qs = Appointment.objects.filter(
        patient=patient,
        status__in=BLOCKING_STATUSES,
        scheduled_start__lt=end,
        scheduled_end__gt=start,
    )
    if exclude_id is not None:
        qs = qs.exclude(pk=exclude_id)
    if qs.exists():
        raise ValidationError(
            {"patient": ["Bemorda shu vaqt oralig'ida boshqa navbat mavjud."]}
        )


def _check_procedure_department_match(
    procedure: ProcedureType | None, department: Department
) -> None:
    if procedure is None:
        return
    if procedure.department_id != department.pk:
        raise ValidationError(
            {
                "procedure_type": [
                    "Muolaja turi tanlangan bo'limga tegishli emas."
                ]
            }
        )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
@transaction.atomic
def create_appointment(
    *,
    patient: Any,
    doctor: Any,
    department: Any,
    scheduled_start: Any,
    scheduled_end: Any,
    procedure_type: Any = None,
    notes: str = "",
    status: str = AppointmentStatus.SCHEDULED,
    created_by: Any = None,
) -> Appointment:
    """Create a single :class:`Appointment` after validating overlap etc."""
    patient_obj = _resolve_patient(patient)
    doctor_obj = _resolve_doctor(doctor)
    department_obj = _resolve_department(department)
    procedure_obj = _resolve_procedure_type(procedure_type)

    start = _clean_datetime(scheduled_start, field="scheduled_start")
    end = _clean_datetime(scheduled_end, field="scheduled_end")
    _validate_range(start, end)

    _check_procedure_department_match(procedure_obj, department_obj)
    _check_doctor_available(doctor_obj, start, end)

    # Only run the doctor-overlap guard for statuses that would actually
    # block a slot. Cancelled/no-show/completed rows should never end up
    # here anyway, but the check keeps the invariant explicit.
    status = _validate_status(status)
    if status in BLOCKING_STATUSES:
        _check_doctor_working_hours(doctor_obj, start, end)
        if has_overlap(
            doctor=doctor_obj,
            scheduled_start=start,
            scheduled_end=end,
        ):
            raise ValidationError(
                {"scheduled_start": ["Shifokorda bu vaqtga boshqa navbat bor."]}
            )
        _check_patient_double_booking(patient_obj, start, end)

    try:
        appointment = Appointment.objects.create(
            patient=patient_obj,
            doctor=doctor_obj,
            department=department_obj,
            procedure_type=procedure_obj,
            scheduled_start=start,
            scheduled_end=end,
            status=status,
            notes=(notes or "").strip(),
            created_by=created_by if isinstance(created_by, User) else None,
            is_active=True,
        )
    except IntegrityError as exc:
        # Race — the postgres exclusion constraint caught an overlap
        # our ORM check missed. Surface as a validation error so the
        # standard envelope is returned.
        raise ValidationError(
            {"scheduled_start": ["Shifokorda bu vaqtga boshqa navbat bor (DB constraint)."]}
        ) from exc
    return appointment


# ---------------------------------------------------------------------------
# Update / status transitions
# ---------------------------------------------------------------------------
_STATUS_TRANSITIONS: dict[str, frozenset[str]] = {
    AppointmentStatus.SCHEDULED: frozenset(
        {
            AppointmentStatus.CONFIRMED,
            AppointmentStatus.IN_PROGRESS,
            AppointmentStatus.COMPLETED,
            AppointmentStatus.CANCELLED,
            AppointmentStatus.NO_SHOW,
        }
    ),
    AppointmentStatus.CONFIRMED: frozenset(
        {
            AppointmentStatus.IN_PROGRESS,
            AppointmentStatus.COMPLETED,
            AppointmentStatus.CANCELLED,
            AppointmentStatus.NO_SHOW,
        }
    ),
    AppointmentStatus.IN_PROGRESS: frozenset(
        {
            AppointmentStatus.COMPLETED,
            AppointmentStatus.CANCELLED,
        }
    ),
    AppointmentStatus.COMPLETED: frozenset(),
    AppointmentStatus.CANCELLED: frozenset(),
    AppointmentStatus.NO_SHOW: frozenset(),
}


def _validate_transition(current: str, new: str) -> None:
    if current == new:
        return
    allowed = _STATUS_TRANSITIONS.get(current, frozenset())
    if new not in allowed:
        raise ValidationError(
            {
                "status": [
                    f"'{current}' holatidan '{new}' holatiga o'tish mumkin emas."
                ]
            }
        )


@transaction.atomic
def update_appointment(
    appointment: Appointment,
    *,
    scheduled_start: Any = None,
    scheduled_end: Any = None,
    procedure_type: Any = ...,
    status: str | None = None,
    notes: str | None = None,
) -> Appointment:
    """Partial update — only kwargs that were passed are touched."""
    update_fields: list[str] = []

    new_start = appointment.scheduled_start
    new_end = appointment.scheduled_end
    if scheduled_start is not None:
        new_start = _clean_datetime(scheduled_start, field="scheduled_start")
    if scheduled_end is not None:
        new_end = _clean_datetime(scheduled_end, field="scheduled_end")

    if scheduled_start is not None or scheduled_end is not None:
        _validate_range(new_start, new_end)

    if procedure_type is not ...:
        proc = _resolve_procedure_type(procedure_type)
        _check_procedure_department_match(proc, appointment.department)
        appointment.procedure_type = proc
        update_fields.append("procedure_type")

    if status is not None:
        clean_status = _validate_status(status)
        _validate_transition(appointment.status, clean_status)
        appointment.status = clean_status
        update_fields.append("status")

    if notes is not None:
        appointment.notes = (notes or "").strip()
        update_fields.append("notes")

    if scheduled_start is not None or scheduled_end is not None:
        # Overlap check only makes sense while the appointment still
        # blocks a slot.
        if (status or appointment.status) in BLOCKING_STATUSES:
            _check_doctor_available(appointment.doctor, new_start, new_end)
            _check_doctor_working_hours(appointment.doctor, new_start, new_end)
            if has_overlap(
                doctor=appointment.doctor,
                scheduled_start=new_start,
                scheduled_end=new_end,
                exclude_id=str(appointment.pk),
            ):
                raise ValidationError(
                    {"scheduled_start": ["Shifokorda bu vaqtga boshqa navbat bor."]}
                )
            _check_patient_double_booking(
                appointment.patient,
                new_start,
                new_end,
                exclude_id=str(appointment.pk),
            )
        appointment.scheduled_start = new_start
        appointment.scheduled_end = new_end
        update_fields.extend(["scheduled_start", "scheduled_end"])
        # Reset reminders when the appointment moves.
        appointment.reminder_1d_sent = False
        appointment.reminder_2h_sent = False
        update_fields.extend(["reminder_1d_sent", "reminder_2h_sent"])

    if update_fields:
        try:
            appointment.save(update_fields=update_fields + ["updated_at"])
        except IntegrityError as exc:
            raise ValidationError(
                {"scheduled_start": ["Shifokorda bu vaqtga boshqa navbat bor (DB constraint)."]}
            ) from exc

    return appointment


@transaction.atomic
def cancel_appointment(
    appointment: Appointment, *, reason: str | None = None
) -> Appointment:
    """Move the appointment to ``cancelled`` (if the transition is legal)."""
    if appointment.status == AppointmentStatus.CANCELLED:
        return appointment
    _validate_transition(appointment.status, AppointmentStatus.CANCELLED)
    appointment.status = AppointmentStatus.CANCELLED
    if reason:
        appointment.notes = (
            f"{appointment.notes}\n[bekor: {reason}]".strip()
            if appointment.notes
            else f"[bekor: {reason}]"
        )
    appointment.save(update_fields=["status", "notes", "updated_at"])
    return appointment


@transaction.atomic
def mark_reminder_sent(
    appointment: Appointment, *, kind: str
) -> Appointment:
    """Flip the ``reminder_*_sent`` flag on a delivered reminder."""
    if kind == "1d":
        if appointment.reminder_1d_sent:
            return appointment
        appointment.reminder_1d_sent = True
        appointment.save(update_fields=["reminder_1d_sent", "updated_at"])
    elif kind == "2h":
        if appointment.reminder_2h_sent:
            return appointment
        appointment.reminder_2h_sent = True
        appointment.save(update_fields=["reminder_2h_sent", "updated_at"])
    else:
        raise ValidationError({"kind": ["'1d' yoki '2h' yuboring."]})
    return appointment


__all__ = [
    "create_appointment",
    "update_appointment",
    "cancel_appointment",
    "mark_reminder_sent",
]
