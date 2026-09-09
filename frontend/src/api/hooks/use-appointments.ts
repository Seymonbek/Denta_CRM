import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getAppointmentsApi,
  getAppointmentApi,
  createAppointmentApi,
  updateAppointmentApi,
  cancelAppointmentApi,
  cleanupOverdueAppointmentsApi,
  getCalendarAppointmentsApi,
  checkAppointmentConflictApi,
} from '../appointments'

export const APPOINTMENTS_QUERY_KEY = ['appointments']


export function useAppointments(params?: {
  doctor?: string
  patient?: string
  status?: string
  date?: string
  search?: string
  page?: number
  page_size?: number
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
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> | FormData }) => updateAppointmentApi(id, data as any),
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

export function useCleanupOverdueAppointments() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: cleanupOverdueAppointmentsApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: APPOINTMENTS_QUERY_KEY })
    },
  })
}

export function useCalendarAppointments(params: {
  dateFrom?: string
  dateTo?: string
  date?: string
  doctor?: string
  department?: string
  status?: string
}, enabled: boolean = true) {
  return useQuery({
    queryKey: ['appointments', 'calendar', params],
    queryFn: () => getCalendarAppointmentsApi(params),
    enabled: enabled && Boolean(params.dateFrom || params.dateTo || params.date),
  })
}

export function useAppointmentConflict(params: {
  doctor: string
  start: string
  end: string
  patient?: string
  excludeId?: string
}, enabled: boolean = true) {
  return useQuery({
    queryKey: ['appointments', 'check-conflict', params],
    queryFn: () => checkAppointmentConflictApi(params),
    enabled: enabled && Boolean(params.doctor && params.start && params.end),
  })
}

