import re

# 1. Update apps/doctors/views.py
with open(r'c:\Users\Seymonbek\Denta_CRM\backend\apps\doctors\views.py', 'r', encoding='utf-8') as f:
    doctors_code = f.read()

# We need to remove the actions from DoctorProfileViewSet
# Find the start of working_hours action
start_marker = "# Nested — /working-hours/"
# Find the end of time_off_delete action
end_marker = "# /available-slots/?date=YYYY-MM-DD"

start_idx = doctors_code.find(start_marker)
end_idx = doctors_code.find(end_marker)

# Also remove _assert_can_write_schedule
assert_start = doctors_code.find("@staticmethod\n    def _assert_can_write_schedule")
assert_end = doctors_code.find("@staticmethod\n    def _get_booked_ranges")

if start_idx != -1 and end_idx != -1:
    # also include the comment line # ------- above start_marker
    start_idx = doctors_code.rfind("# ------------------------------------------------------------------", 0, start_idx)
    new_doctors_code = doctors_code[:start_idx] + doctors_code[end_idx-6:] # keep the end marker comment
    
    # remove assert
    if assert_start != -1 and assert_end != -1:
        new_doctors_code = new_doctors_code[:assert_start] + new_doctors_code[assert_end:]
        
    with open(r'c:\Users\Seymonbek\Denta_CRM\backend\apps\doctors\views.py', 'w', encoding='utf-8') as f:
        f.write(new_doctors_code)
    print('Updated doctors/views.py')
else:
    print('Could not find markers in doctors/views.py')


# 2. Update apps/accounts/views.py
with open(r'c:\Users\Seymonbek\Denta_CRM\backend\apps\accounts\views.py', 'r', encoding='utf-8') as f:
    accounts_code = f.read()

imports = '''
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from apps.doctors.models import WorkingHours, TimeOff
from apps.doctors.serializers import WorkingHoursSerializer, TimeOffSerializer
from apps.doctors.permissions import WorkingHoursPermission, TimeOffPermission
from apps.doctors.selectors import working_hours_for, time_off_for
from apps.doctors.services import delete_working_hours, delete_time_off
'''

actions = '''
    @staticmethod
    def _assert_can_write_schedule(request: Request, user: User) -> None:
        role = getattr(request.user, "role", None)
        if role == ROLE_BOSH_SHIFOKOR:
            return
        if getattr(user, "id", None) == getattr(request.user, "id", None):
            return
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied("Boshqa xodim jadvalini o'zgartirishga ruxsatingiz yo'q.")

    # ------------------------------------------------------------------
    # Nested — /working-hours/
    # ------------------------------------------------------------------
    @extend_schema(
        methods=["GET"],
        summary="List working hours for a user",
        responses={200: WorkingHoursSerializer(many=True)},
    )
    @extend_schema(
        methods=["POST"],
        summary="Add a working-hours entry",
        request=WorkingHoursSerializer,
        responses={201: WorkingHoursSerializer},
    )
    @action(
        detail=True,
        methods=["get", "post"],
        url_path="working-hours",
        permission_classes=[WorkingHoursPermission],
    )
    def working_hours(self, request: Request, pk: str | None = None) -> Response:
        user_obj = self.get_object()
        if request.method.lower() == "get":
            qs = working_hours_for(user_obj)
            data = WorkingHoursSerializer(qs, many=True).data
            return Response(data, status=status.HTTP_200_OK)

        self._assert_can_write_schedule(request, user_obj)
        serializer = WorkingHoursSerializer(
            data=request.data, context={"user": user_obj, "request": request}
        )
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        return Response(
            WorkingHoursSerializer(instance).data, status=status.HTTP_201_CREATED
        )

    @extend_schema(
        methods=["DELETE"],
        summary="Delete a working-hours entry",
        responses={204: None},
    )
    @action(
        detail=True,
        methods=["delete"],
        url_path=r"working-hours/(?P<entry_id>[^/.]+)",
        permission_classes=[WorkingHoursPermission],
    )
    def working_hours_delete(
        self, request: Request, pk: str | None = None, entry_id: str | None = None
    ) -> Response:
        user_obj = self.get_object()
        self._assert_can_write_schedule(request, user_obj)
        try:
            entry = WorkingHours.objects.get(pk=entry_id, user=user_obj)
        except WorkingHours.DoesNotExist as exc:
            raise NotFound("Ish soati topilmadi.") from exc
        delete_working_hours(entry)
        return Response(status=status.HTTP_204_NO_CONTENT)

    # ------------------------------------------------------------------
    # Nested — /time-off/
    # ------------------------------------------------------------------
    @extend_schema(
        methods=["GET"],
        summary="List time-off entries for a user",
        responses={200: TimeOffSerializer(many=True)},
    )
    @extend_schema(
        methods=["POST"],
        summary="Create a time-off entry",
        request=TimeOffSerializer,
        responses={201: TimeOffSerializer},
    )
    @action(
        detail=True,
        methods=["get", "post"],
        url_path="time-off",
        permission_classes=[TimeOffPermission],
    )
    def time_off(self, request: Request, pk: str | None = None) -> Response:
        user_obj = self.get_object()
        if request.method.lower() == "get":
            data = TimeOffSerializer(time_off_for(user_obj), many=True).data
            return Response(data, status=status.HTTP_200_OK)
            
        self._assert_can_write_schedule(request, user_obj)
        serializer = TimeOffSerializer(
            data=request.data, context={"user": user_obj, "request": request}
        )
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        return Response(
            TimeOffSerializer(instance).data, status=status.HTTP_201_CREATED
        )

    @extend_schema(
        methods=["DELETE"],
        summary="Delete a time-off entry",
        responses={204: None},
    )
    @action(
        detail=True,
        methods=["delete"],
        url_path=r"time-off/(?P<entry_id>[^/.]+)",
        permission_classes=[TimeOffPermission],
    )
    def time_off_delete(
        self, request: Request, pk: str | None = None, entry_id: str | None = None
    ) -> Response:
        user_obj = self.get_object()
        self._assert_can_write_schedule(request, user_obj)
        try:
            entry = TimeOff.objects.get(pk=entry_id, user=user_obj)
        except TimeOff.DoesNotExist as exc:
            raise NotFound("Dam olish yozuvi topilmadi.") from exc
        delete_time_off(entry)
        return Response(status=status.HTTP_204_NO_CONTENT)
'''

# insert imports at top (after from .serializers import ...)
import_idx = accounts_code.rfind("from .serializers import")
if import_idx != -1:
    import_idx = accounts_code.find("\n\n", import_idx)
    new_accounts_code = accounts_code[:import_idx] + "\n" + imports + accounts_code[import_idx:]
else:
    new_accounts_code = imports + "\n" + accounts_code

new_accounts_code = new_accounts_code + "\n" + actions + "\n"

with open(r'c:\Users\Seymonbek\Denta_CRM\backend\apps\accounts\views.py', 'w', encoding='utf-8') as f:
    f.write(new_accounts_code)
print('Updated accounts/views.py')
