"""Core app — shared foundations (BaseModel, pagination, exceptions).

Every business app depends on this one. Registered first in
``LOCAL_APPS`` so migrations for the abstract BaseModel are available.
"""

default_app_config = "apps.core.apps.CoreConfig"
