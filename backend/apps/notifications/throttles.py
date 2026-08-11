from rest_framework.throttling import SimpleRateThrottle

class PatientReminderThrottle(SimpleRateThrottle):
    scope = 'patient_reminders'

    def get_cache_key(self, request, view):
        appointment_id = request.data.get("appointmentId") or request.data.get("appointment_id")
        if not appointment_id:
            return None
        from apps.scheduling.models import Appointment
        try:
            appt = Appointment.objects.get(pk=appointment_id)
            if not appt.patient_id:
                return None
            return self.cache_format % {
                'scope': self.scope,
                'ident': str(appt.patient_id)
            }
        except Appointment.DoesNotExist:
            return None
