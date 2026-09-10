import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import { type PaginatedResponse } from '@/types/api'

export interface CashShift {
  id: string
  administrator: string
  admin_name: string
  opened_at: string
  closed_at: string | null
  start_balance: string
  cash_collected: string
  card_collected: string
  cash_expenses: string
  card_expenses: string
  status: 'open' | 'closed'
  approved_by: string | null
}

export interface CashShiftStats {
  openShiftsCount: number
  totalShiftsCount: number
  currentCashInHand: number | string
  todayCashCollected: number | string
  todayCardCollected: number | string
  todayCashExpenses: number | string
}

export interface ShiftPaymentItem {
  id: string
  created_at: string
  patient_name: string
  doctor_name: string
  procedure_name: string
  method: string
  amount: string | number
}

export interface ShiftExpenseItem {
  id: string
  date: string
  category_name: string
  payment_method: string
  amount: string | number
  description: string
}

export interface CashShiftDetails {
  shift: CashShift
  payments: ShiftPaymentItem[]
  expenses: ShiftExpenseItem[]
}

export const useOpenCashShift = () => {
  return useQuery({
    queryKey: ['cash-shifts', 'open'],
    queryFn: async () => {
      const res = await apiClient.get<CashShift | null>('/cash-shifts/my-open/')
      return res.data
    },
  })
}

export const useCashShiftStats = () => {
  return useQuery({
    queryKey: ['cash-shifts', 'stats'],
    queryFn: async () => {
      const res = await apiClient.get<CashShiftStats>('/cash-shifts/stats/')
      return res.data
    },
  })
}

export const useCashShiftDetails = (shiftId: string | null) => {
  return useQuery({
    queryKey: ['cash-shifts', shiftId, 'details'],
    queryFn: async () => {
      if (!shiftId) return null
      const res = await apiClient.get<CashShiftDetails>(`/cash-shifts/${shiftId}/details/`)
      return res.data
    },
    enabled: !!shiftId,
  })
}

export const useCashShifts = (params?: { search?: string; status?: string; page?: number; page_size?: number; admin_id?: string; dateFrom?: string; dateTo?: string }) => {
  return useQuery({
    queryKey: ['cash-shifts', params],
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<CashShift>>('/cash-shifts/', { params })
      return res.data
    },
  })
}

export const useCloseCashShift = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.post<CashShift>(`/cash-shifts/${id}/approve/`)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-shifts'] })
    },
  })
}



