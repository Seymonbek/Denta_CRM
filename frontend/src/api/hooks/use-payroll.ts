import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../client'
import { toast } from 'sonner'

export interface DoctorBalance {
  id: string
  firstName: string
  lastName: string
  phone: string
  totalEarned: number
  totalPaid: number
  balance: number
  commissionBasis: string
  defaultRate: string
}

export interface PaySalaryPayload {
  doctorId: string
  amount: number
  method: string
  shift_id: number
  notes?: string
}

export const payrollKeys = {
  all: ['payroll'] as const,
  balances: () => [...payrollKeys.all, 'balances'] as const,
}

export function useDoctorBalances() {
  return useQuery({
    queryKey: payrollKeys.balances(),
    queryFn: async () => {
      const { data } = await apiClient.get<DoctorBalance[]>('/payments/doctors/balances/')
      return data
    },
  })
}

export function usePaySalary() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ doctorId, ...payload }: PaySalaryPayload) => {
      const { data } = await apiClient.post(`/payments/doctors/${doctorId}/pay_salary/`, payload)
      return data
    },
    onSuccess: () => {
      toast.success("Ish haqi muvaffaqiyatli to'landi")
      // Invalidate balances and cash shifts
      queryClient.invalidateQueries({ queryKey: payrollKeys.balances() })
      queryClient.invalidateQueries({ queryKey: ['cash-shifts'] })
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || "Xatolik yuz berdi")
    },
  })
}
