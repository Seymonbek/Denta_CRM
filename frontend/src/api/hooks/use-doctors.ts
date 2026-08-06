import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getDoctorsApi,
  getDoctorApi,
  createDoctorApi,
  updateDoctorApi,
  getWorkingHoursApi,
  createWorkingHoursApi,
  deleteWorkingHoursApi,
  getTimeOffApi,
  createTimeOffApi,
  getAvailableSlotsApi,
} from '../doctors'

export const DOCTORS_QUERY_KEY = ['doctors']

export function useDoctors() {
  return useQuery({
    queryKey: DOCTORS_QUERY_KEY,
    queryFn: getDoctorsApi,
  })
}

export function useDoctor(id: string) {
  return useQuery({
    queryKey: ['doctors', id],
    queryFn: () => getDoctorApi(id),
    enabled: Boolean(id),
  })
}

export function useCreateDoctor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createDoctorApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DOCTORS_QUERY_KEY })
    },
  })
}

export function useUpdateDoctor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateDoctorApi(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: DOCTORS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: ['doctors', variables.id] })
    },
  })
}

export function useWorkingHours(doctorId: string) {
  return useQuery({
    queryKey: ['doctors', doctorId, 'working-hours'],
    queryFn: () => getWorkingHoursApi(doctorId),
    enabled: Boolean(doctorId),
  })
}

export function useCreateWorkingHours(doctorId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { weekday: number; startTime: string; endTime: string }) =>
      createWorkingHoursApi(doctorId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctors', doctorId, 'working-hours'] })
    },
  })
}

export function useDeleteWorkingHours(doctorId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (workingHoursId: string) => deleteWorkingHoursApi(doctorId, workingHoursId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctors', doctorId, 'working-hours'] })
    },
  })
}

export function useTimeOff(doctorId: string) {
  return useQuery({
    queryKey: ['doctors', doctorId, 'time-off'],
    queryFn: () => getTimeOffApi(doctorId),
    enabled: Boolean(doctorId),
  })
}

export function useCreateTimeOff(doctorId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { dateStart: string; dateEnd: string; reason: string }) =>
      createTimeOffApi(doctorId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctors', doctorId, 'time-off'] })
    },
  })
}

export function useAvailableSlots(doctorId: string, date: string) {
  return useQuery({
    queryKey: ['doctors', doctorId, 'available-slots', date],
    queryFn: () => getAvailableSlotsApi(doctorId, date),
    enabled: Boolean(doctorId && date),
  })
}
