import { apiClient } from './client'
import { Payment, CommissionRecord, PaginatedResponse, PaymentMethod } from '@/types/api'

export async function getPaymentsApi(params?: {
  patient?: string
  treatment?: string
  method?: string
  page?: number
}): Promise<PaginatedResponse<Payment>> {
  const response = await apiClient.get<PaginatedResponse<Payment>>('payments/', { params })
  return response.data
}

export async function createPaymentApi(
  data: {
    treatment: string
    patient: string
    amount: string
    method: PaymentMethod
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

export async function voidPaymentApi(id: string, reason?: string): Promise<Payment> {
  const response = await apiClient.post<Payment>(`payments/${id}/void/`, { reason })
  return response.data
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
