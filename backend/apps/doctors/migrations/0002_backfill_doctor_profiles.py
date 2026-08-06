from django.db import migrations

def backfill_doctor_profiles(apps, schema_editor):
    User = apps.get_model('accounts', 'User')
    DoctorProfile = apps.get_model('doctors', 'DoctorProfile')
    for user in User.objects.filter(role__in=['doctor', 'bosh_shifokor']):
        if not DoctorProfile.objects.filter(user=user).exists():
            DoctorProfile.objects.create(
                user=user,
                specialization="",
                bio="",
                commission_basis="from_total",
                default_commission_rate=30.00,
                can_view_other_doctors=False,
                is_active=True
            )

def reverse_backfill(apps, schema_editor):
    pass

class Migration(migrations.Migration):

    dependencies = [
        ('doctors', '0001_initial'),
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(backfill_doctor_profiles, reverse_backfill),
    ]
