import logging
import json
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.core.serializers import serialize

from apps.core.models import AuditLog
from apps.core.middleware import get_current_user, get_current_request
from apps.treatments.models import Treatment
from apps.payments.models import Payment
from apps.doctors.models import DoctorProfile
from apps.inventory.models import Material
from apps.patients.models import Patient
from django.db.models.signals import pre_save

logger = logging.getLogger(__name__)

AUDITED_MODELS = [Treatment, Payment, DoctorProfile, Material, Patient]

def _get_client_ip(request):
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")

@receiver(pre_save)
def _audit_pre_save(sender, instance, **kwargs):
    if sender not in AUDITED_MODELS:
        return
    if instance.pk:
        try:
            old_instance = sender.objects.get(pk=instance.pk)
            instance._old_state = json.loads(serialize("json", [old_instance]))[0]["fields"]
        except sender.DoesNotExist:
            instance._old_state = None
    else:
        instance._old_state = None

@receiver(post_save)
def _audit_post_save(sender, instance, created, **kwargs):
    if sender not in AUDITED_MODELS:
        return
        
    try:
        user = get_current_user()
        request = get_current_request()
        ip_address = _get_client_ip(request) if request else None
        
        action = "CREATE" if created else "UPDATE"
        new_data = json.loads(serialize("json", [instance]))[0]["fields"]
        
        changes = {"new_state": new_data}
        if not created and hasattr(instance, "_old_state") and instance._old_state:
            changes["old_state"] = instance._old_state
            
            # Optionally check if anything actually changed (simple diff check)
            if instance._old_state == new_data:
                return # Skip logging if no actual fields changed

        AuditLog.objects.create(
            user=user,
            action=action,
            model_name=sender.__name__,
            object_id=str(instance.pk),
            changes=changes,
            ip_address=ip_address
        )
    except Exception as e:
        logger.error(f"Failed to create audit log for {sender.__name__} {instance.pk}: {e}")


@receiver(post_delete)
def _audit_post_delete(sender, instance, **kwargs):
    if sender not in AUDITED_MODELS:
        return
        
    try:
        user = get_current_user()
        request = get_current_request()
        ip_address = _get_client_ip(request) if request else None
        
        try:
            data = json.loads(serialize("json", [instance]))[0]["fields"]
        except Exception:
            data = {"id": str(instance.pk)}
            
        AuditLog.objects.create(
            user=user,
            action="DELETE",
            model_name=sender.__name__,
            object_id=str(instance.pk),
            changes={"old_state": data},
            ip_address=ip_address
        )
    except Exception as e:
        logger.error(f"Failed to create audit log for {sender.__name__} {instance.pk}: {e}")

