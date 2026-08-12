import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../client'
import { User } from '@/types/api'

export const useUsers = () => {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ results: User[] }>('/auth/users/')
      return data.results || []
    },
  })
}

export const useCreateUser = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Partial<User>) => {
      const { data } = await apiClient.post<User>('/auth/users/', payload)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

export const useUpdateUser = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<User> }) => {
      const { data: res } = await apiClient.patch<User>(`/auth/users/${id}/`, data)
      return res
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

// ─── Schedule (WorkingHours / TimeOff) ───────────────────────────────────────

export function useUserWorkingHours(userId: string) {
  return useQuery({
    queryKey: ['user-working-hours', userId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/auth/users/${userId}/working-hours/`)
      return Array.isArray(data) ? data : (data.results ?? [])
    },
    enabled: !!userId,
  })
}

export function useCreateUserWorkingHours(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { weekday: number; startTime: string; endTime: string }) =>
      apiClient.post(`/auth/users/${userId}/working-hours/`, {
        weekday: payload.weekday,
        start_time: payload.startTime,
        end_time: payload.endTime,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-working-hours', userId] }),
  })
}

export function useDeleteUserWorkingHours(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entryId: string) =>
      apiClient.delete(`/auth/users/${userId}/working-hours/${entryId}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-working-hours', userId] }),
  })
}

export function useUserTimeOff(userId: string) {
  return useQuery({
    queryKey: ['user-time-off', userId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/auth/users/${userId}/time-off/`)
      return Array.isArray(data) ? data : (data.results ?? [])
    },
    enabled: !!userId,
  })
}

export function useCreateUserTimeOff(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { dateStart: string; dateEnd: string; reason: string }) =>
      apiClient.post(`/auth/users/${userId}/time-off/`, {
        date_start: payload.dateStart,
        date_end: payload.dateEnd,
        reason: payload.reason,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-time-off', userId] }),
  })
}

export function useDeleteUserTimeOff(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entryId: string) =>
      apiClient.delete(`/auth/users/${userId}/time-off/${entryId}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-time-off', userId] }),
  })
}
