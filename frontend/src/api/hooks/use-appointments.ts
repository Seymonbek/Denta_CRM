import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getAppointmentsApi,
  getAppointmentApi,
  createAppointmentApi,
  updateAppointmentApi,
  cancelAppointmentApi,
} from '../appointments'

export const APPOINTMENTS_QUERY_KEY = ['appointments']

export function useAppointments(params?: {
  doctor?: string
  patient?: string
  status?: string
  date?: string
  page?: number
}) {
  return useQuery({
    queryKey: [...APPOINTMENTS_QUERY_KEY, params],
    queryFn: () => getAppointmentsApi(params),
  })
}

export function useAppointment(id: string) {
  return useQuery({
    queryKey: ['appointments', id],
    queryFn: () => getAppointmentApi(id),
    enabled: Boolean(id),
  })
}

export function useCreateAppointment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createAppointmentApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: APPOINTMENTS_QUERY_KEY })
    },
  })
}

export function useUpdateAppointment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> | FormData }) => updateAppointmentApi(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: APPOINTMENTS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: ['appointments', variables.id] })
    },
  })
}

export function useCancelAppointment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => cancelAppointmentApi(id, reason),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: APPOINTMENTS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: ['appointments', variables.id] })
    },
  })
}
