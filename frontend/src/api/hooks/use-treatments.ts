import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getTreatmentsApi,
  getTreatmentApi,
  createTreatmentApi,
  updateTreatmentApi,
  uploadTreatmentPhotoApi,
  createToothRecordApi,
  approveDiscountApi,
  getICD10DiagnosesApi,
  getTreatmentPlansApi,
  getTreatmentPlanApi,
  createTreatmentPlanApi,
  updateTreatmentPlanApi,
  deleteTreatmentPlanApi,
  createTreatmentPlanItemApi,
  updateTreatmentPlanItemApi,
  deleteTreatmentPlanItemApi,
} from '../treatments'

export const TREATMENTS_QUERY_KEY = ['treatments']

export function useTreatments(params?: {
  patient?: string
  doctor?: string
  payment_status?: string
  stage?: string
  approval_status?: string
  search?: string
  page?: number
  page_size?: number
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
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> | FormData }) => updateTreatmentApi(id, data as any),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: TREATMENTS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: ['treatments', variables.id] })
    },
  })
}

export function useApproveDiscount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'approved' | 'rejected' }) => approveDiscountApi(id, status),
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

// ---------------------------------------------------------------------------
// ICD-10 Hook
// ---------------------------------------------------------------------------
export const ICD10_QUERY_KEY = ['icd10-diagnoses']

export function useICD10Diagnoses(params?: { search?: string; category?: string; is_common?: boolean }) {
  return useQuery({
    queryKey: [...ICD10_QUERY_KEY, params],
    queryFn: () => getICD10DiagnosesApi(params),
    staleTime: 1000 * 60 * 60, // 1 hour cache
  })
}

// ---------------------------------------------------------------------------
// Treatment Plans Hooks
// ---------------------------------------------------------------------------
export const TREATMENT_PLANS_QUERY_KEY = ['treatment-plans']

export function useTreatmentPlans(params?: { patient?: string; doctor?: string; status?: string; search?: string }) {
  return useQuery({
    queryKey: [...TREATMENT_PLANS_QUERY_KEY, params],
    queryFn: () => getTreatmentPlansApi(params),
  })
}

export function useTreatmentPlan(id: string) {
  return useQuery({
    queryKey: ['treatment-plans', id],
    queryFn: () => getTreatmentPlanApi(id),
    enabled: Boolean(id),
  })
}

export function useCreateTreatmentPlan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createTreatmentPlanApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TREATMENT_PLANS_QUERY_KEY })
    },
  })
}

export function useUpdateTreatmentPlan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<any> }) => updateTreatmentPlanApi(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: TREATMENT_PLANS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: ['treatment-plans', variables.id] })
    },
  })
}

export function useDeleteTreatmentPlan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteTreatmentPlanApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TREATMENT_PLANS_QUERY_KEY })
    },
  })
}

export function useCreateTreatmentPlanItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createTreatmentPlanItemApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TREATMENT_PLANS_QUERY_KEY })
    },
  })
}

export function useUpdateTreatmentPlanItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<any> }) => updateTreatmentPlanItemApi(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TREATMENT_PLANS_QUERY_KEY })
    },
  })
}

export function useDeleteTreatmentPlanItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteTreatmentPlanItemApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TREATMENT_PLANS_QUERY_KEY })
    },
  })
}
