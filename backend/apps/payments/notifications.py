from django.utils import timezone
from apps.accounts.models import User

def notify_bosh_shifokor(text: str):
    """Bosh shifokorlarga telegram orqali xabarnoma jo'natadi."""
    from apps.telegram_bot.bot import send_message_sync
    
    admins = User.objects.filter(role="bosh_shifokor", is_active=True).exclude(telegram_chat_id__isnull=True).exclude(telegram_chat_id=0)
    for admin in admins:
        try:
            send_message_sync(chat_id=admin.telegram_chat_id, text=text)
        except Exception:
            pass
