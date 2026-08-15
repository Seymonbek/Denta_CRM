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

export const useOpenCashShift = () => {
  return useQuery({
    queryKey: ['cash-shifts', 'open'],
    queryFn: async () => {
      const res = await apiClient.get<CashShift | null>('/cash-shifts/my-open/')
      return res.data
    },
  })
}

export const useCashShifts = (params?: { status?: string; page?: number; admin_id?: string; dateFrom?: string; dateTo?: string }) => {
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


