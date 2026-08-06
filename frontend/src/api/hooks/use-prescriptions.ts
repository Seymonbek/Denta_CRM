import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getPrescriptionTemplatesApi,
  createPrescriptionTemplateApi,
  getPrescriptionsApi,
  issuePrescriptionApi,
} from '../prescriptions'

export const PRESCRIPTION_TEMPLATES_QUERY_KEY = ['prescription-templates']
export const PRESCRIPTIONS_QUERY_KEY = ['prescriptions']

export function usePrescriptionTemplates() {
  return useQuery({
    queryKey: PRESCRIPTION_TEMPLATES_QUERY_KEY,
    queryFn: getPrescriptionTemplatesApi,
  })
}

export function useCreatePrescriptionTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createPrescriptionTemplateApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRESCRIPTION_TEMPLATES_QUERY_KEY })
    },
  })
}

export function usePrescriptions(params?: { treatment?: string; page?: number }) {
  return useQuery({
    queryKey: [...PRESCRIPTIONS_QUERY_KEY, params],
    queryFn: () => getPrescriptionsApi(params),
  })
}

export function useIssuePrescription() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      treatmentId,
      data,
    }: {
      treatmentId: string
      data: { templateId?: string; content?: string; sendTelegram?: boolean }
    }) => issuePrescriptionApi(treatmentId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: PRESCRIPTIONS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: ['treatments', variables.treatmentId] })
    },
  })
}
