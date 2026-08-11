import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getTreatmentsApi,
  getTreatmentApi,
  createTreatmentApi,
  updateTreatmentApi,
  uploadTreatmentPhotoApi,
  createToothRecordApi,
} from '../treatments'

export const TREATMENTS_QUERY_KEY = ['treatments']

export function useTreatments(params?: {
  patient?: string
  doctor?: string
  payment_status?: string
  stage?: string
  page?: number
}) {
  return useQuery({
    queryKey: [...TREATMENTS_QUERY_KEY, params],
    queryFn: () => getTreatmentsApi(params),
  })
}

export function useTreatment(id: string) {
  return useQuery({
    queryKey: ['treatments', id],
    queryFn: () => getTreatmentApi(id),
    enabled: Boolean(id),
  })
}

export function useCreateTreatment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createTreatmentApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TREATMENTS_QUERY_KEY })
    },
  })
}

export function useUpdateTreatment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateTreatmentApi(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: TREATMENTS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: ['treatments', variables.id] })
    },
  })
}

export function useUploadTreatmentPhoto() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      treatmentId,
      file,
      photoType,
    }: {
      treatmentId: string
      file: File
      photoType: 'before' | 'after' | 'xray'
    }) => uploadTreatmentPhotoApi(treatmentId, file, photoType),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['treatments', variables.treatmentId] })
    },
  })
}

export function useCreateToothRecord() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      treatmentId,
      data,
    }: {
      treatmentId: string
      data: { toothNumber: number; procedure: string; status: string; notes?: string }
    }) => createToothRecordApi(treatmentId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['treatments', variables.treatmentId] })
      queryClient.invalidateQueries({ queryKey: ['patients'] })
    },
  })
}
