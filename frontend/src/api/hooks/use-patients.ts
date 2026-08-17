import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getPatientsApi,
  getPatientApi,
  createPatientApi,
  updatePatientApi,
  getPatientHistoryApi,
  getPatientOdontogramApi,
  getPatientOdontogramHistoryApi,
  getPatientBalanceApi,
} from '../patients'

export const PATIENTS_QUERY_KEY = ['patients']

export function usePatients(params?: { search?: string; gender?: string; page?: number; page_size?: number }) {
  return useQuery({
    queryKey: [...PATIENTS_QUERY_KEY, params],
    queryFn: () => getPatientsApi(params),
  })
}

export function usePatient(id: string) {
  return useQuery({
    queryKey: ['patients', id],
    queryFn: () => getPatientApi(id),
    enabled: Boolean(id),
  })
}

export function useCreatePatient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createPatientApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PATIENTS_QUERY_KEY })
    },
  })
}

export function useUpdatePatient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> | FormData }) => updatePatientApi(id, data as any),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: PATIENTS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: ['patients', variables.id] })
    },
  })
}

export function usePatientHistory(id: string) {
  return useQuery({
    queryKey: ['patients', id, 'history'],
    queryFn: () => getPatientHistoryApi(id),
    enabled: Boolean(id),
  })
}

export function usePatientOdontogram(id: string) {
  return useQuery({
    queryKey: ['patients', id, 'odontogram'],
    queryFn: () => getPatientOdontogramApi(id),
    enabled: Boolean(id),
  })
}

export function usePatientOdontogramHistory(id: string, toothNumber?: number) {
  return useQuery({
    queryKey: ['patients', id, 'odontogram-history', toothNumber],
    queryFn: () => getPatientOdontogramHistoryApi(id, toothNumber),
    enabled: Boolean(id),
  })
}

export function usePatientBalance(id: string) {
  return useQuery({
    queryKey: ['patients', id, 'balance'],
    queryFn: () => getPatientBalanceApi(id),
    enabled: Boolean(id),
  })
}
