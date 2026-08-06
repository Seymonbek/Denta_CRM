"""URL routes for the reports app.

Mounted at ``/api/v1/reports/`` — see :mod:`config.urls`.
"""
from __future__ import annotations

from django.urls import path

from .views import (
    DashboardReportView,
    DepartmentsReportView,
    ProceduresReportView,
    RevenueReportView,
)

app_name = "reports"

urlpatterns = [
    path("dashboard/", DashboardReportView.as_view(), name="dashboard"),
    path("revenue/", RevenueReportView.as_view(), name="revenue"),
    path("procedures/", ProceduresReportView.as_view(), name="procedures"),
    path("departments/", DepartmentsReportView.as_view(), name="departments"),
]
