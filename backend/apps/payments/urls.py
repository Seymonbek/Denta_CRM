"""URL routes for the ``payments`` app.

Three mount points wired from :mod:`config.urls`:

* ``/api/v1/payments/``                          → ``payment_urlpatterns``
* ``/api/v1/patients/{id}/balance/``             → ``patient_balance_urlpatterns``
* ``/api/v1/doctors/{id}/commissions/``          → ``doctor_commission_urlpatterns``
"""
from __future__ import annotations

from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    DoctorCommissionsSummaryView,
    DoctorCommissionsView,
    PatientBalanceView,
    PaymentReceiptPDFView,
    PaymentViewSet,
    CashShiftViewSet,
    ExpenseCategoryViewSet,
    ExpenseViewSet,
    DoctorBalancesView,
    SalaryPaymentCreateView,
)

app_name = "payments"


def _payment_router() -> DefaultRouter:
    router = DefaultRouter()
    router.register(r"", PaymentViewSet, basename="payment")
    return router


payment_urlpatterns = [
    path(
        "<uuid:pk>/receipt/",
        PaymentReceiptPDFView.as_view(),
        name="payment-receipt",
    ),
] + _payment_router().urls

# Nested action URLs — mounted at their respective prefixes in config/urls.
patient_balance_urlpatterns = [
    path(
        "<uuid:patient_id>/balance/",
        PatientBalanceView.as_view(),
        name="patient-balance",
    ),
]

doctor_commission_urlpatterns = [
    path(
        "<uuid:doctor_id>/commissions/",
        DoctorCommissionsView.as_view(),
        name="doctor-commissions",
    ),
    path(
        "balances/",
        DoctorBalancesView.as_view(),
        name="doctor-balances",
    ),
    path(
        "<uuid:doctor_id>/pay_salary/",
        SalaryPaymentCreateView.as_view(),
        name="doctor-pay-salary",
    ),
    path(
        "<uuid:doctor_id>/commissions/summary/",
        DoctorCommissionsSummaryView.as_view(),
        name="doctor-commissions-summary",
    ),
]

cash_shift_router = DefaultRouter()
cash_shift_router.register(r"", CashShiftViewSet, basename="cash-shift")
cash_shift_urlpatterns = cash_shift_router.urls

expense_category_router = DefaultRouter()
expense_category_router.register(r"", ExpenseCategoryViewSet, basename="expense-category")
expense_category_urlpatterns = expense_category_router.urls

expense_router = DefaultRouter()
expense_router.register(r"", ExpenseViewSet, basename="expense")
expense_urlpatterns = expense_router.urls

urlpatterns = payment_urlpatterns

__all__ = [
    "payment_urlpatterns",
    "patient_balance_urlpatterns",
    "doctor_commission_urlpatterns",
    "cash_shift_urlpatterns",
    "expense_category_urlpatterns",
    "expense_urlpatterns",
    "urlpatterns",
]
