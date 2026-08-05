"""Departments app — clinical bo'limlar (e.g. Terapiya, Ortopediya, Xirurgiya).

Every doctor and procedure type belongs to a department. Only the head
doctor (``bosh_shifokor``) can create, update, or delete departments;
all authenticated users may list and retrieve them (they are needed as
FK selectors in appointment and doctor forms).
"""

default_app_config = "apps.departments.apps.DepartmentsConfig"
