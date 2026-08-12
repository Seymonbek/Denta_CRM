from rest_framework import serializers
from .models import AuditLog

class AuditLogSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.get_full_name", read_only=True)
    
    class Meta:
        model = AuditLog
        fields = [
            "id", "user", "user_name", "action", "model_name", 
            "object_id", "changes", "ip_address", "timestamp"
        ]


from .models import ClinicSettings

class ClinicSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClinicSettings
        fields = ['id', 'name', 'inn', 'address']

