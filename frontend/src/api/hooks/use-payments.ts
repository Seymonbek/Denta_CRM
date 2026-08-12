import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getPaymentsApi,
  createPaymentApi,
  voidPaymentApi,
  getDoctorCommissionsApi,
  getDoctorCommissionSummaryApi,
  approveRefundApi,
} from '../payments'

export const PAYMENTS_QUERY_KEY = ['payments']

export function usePayments(params?: {
  patient?: string
  treatment?: string
  method?: string
  page?: number
  cash_shift?: string
  refund_status?: string
}) {
  return useQuery({
    queryKey: [...PAYMENTS_QUERY_KEY, params],
    queryFn: () => getPaymentsApi(params),
  })
}

export function useCreatePayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      data,
      idempotencyKey,
    }: {
      data: Parameters<typeof createPaymentApi>[0]
      idempotencyKey?: string
    }) => createPaymentApi(data, idempotencyKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PAYMENTS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: ['treatments'] })
      queryClient.invalidateQueries({ queryKey: ['patients'] })
    },
  })
}

export function useVoidPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => voidPaymentApi(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PAYMENTS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: ['treatments'] })
      queryClient.invalidateQueries({ queryKey: ['patients'] })
    },
  })
}

export function useApproveRefund() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) => approveRefundApi(id, approved),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PAYMENTS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: ['treatments'] })
    },
  })
}

export function useDoctorCommissions(doctorId: string, params?: { dateFrom?: string; dateTo?: string }) {
  return useQuery({
    queryKey: ['doctors', doctorId, 'commissions', params],
    queryFn: () => getDoctorCommissionsApi(doctorId, params),
    enabled: Boolean(doctorId),
  })
}

export function useDoctorCommissionSummary(doctorId: string, params?: { dateFrom?: string; dateTo?: string }) {
  return useQuery({
    queryKey: ['doctors', doctorId, 'commissions-summary', params],
    queryFn: () => getDoctorCommissionSummaryApi(doctorId, params),
    enabled: Boolean(doctorId),
  })
}
