import { apiClient } from './client'
import { Payment, CommissionRecord, PaginatedResponse, PaymentMethod } from '@/types/api'

export async function getPaymentsApi(params?: {
  patient?: string
  treatment?: string
  method?: string
  page?: number
  cash_shift?: string
  refund_status?: string
}): Promise<PaginatedResponse<Payment>> {
  const response = await apiClient.get<PaginatedResponse<Payment>>('payments/', { params })
  return response.data
}

export async function createPaymentApi(
  data: {
    treatment?: string
    patientId: string
    amount: string
    method: PaymentMethod
    note?: string
  },
  idempotencyKey?: string
): Promise<Payment> {
  const headers: Record<string, string> = {}
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey
  }

  const response = await apiClient.post<Payment>('payments/', data, { headers })
  return response.data
}

export async function voidPaymentApi(id: string, reason?: string): Promise<void> {
  await apiClient.delete(`payments/${id}/`, { data: { reason } })
}

export async function approveRefundApi(id: string, approved: boolean): Promise<void> {
  await apiClient.post(`payments/${id}/approve-refund/`, { approved })
}

export async function getDoctorCommissionsApi(
  doctorId: string,
  params?: { dateFrom?: string; dateTo?: string }
): Promise<CommissionRecord[]> {
  const response = await apiClient.get<CommissionRecord[]>(`doctors/${doctorId}/commissions/`, { params })
  return response.data
}

export async function getDoctorCommissionSummaryApi(
  doctorId: string,
  params?: { dateFrom?: string; dateTo?: string }
): Promise<{ totalCommission: string; count: number }> {
  const response = await apiClient.get<{ totalCommission: string; count: number }>(
    `doctors/${doctorId}/commissions/summary/`,
    { params }
  )
  return response.data
}
