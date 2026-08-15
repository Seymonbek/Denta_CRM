import { apiClient } from './client'
import { type PrescriptionTemplate, type Prescription, type PaginatedResponse } from '@/types/api'

export async function getPrescriptionTemplatesApi(): Promise<PrescriptionTemplate[]> {
  const response = await apiClient.get<PrescriptionTemplate[] | PaginatedResponse<PrescriptionTemplate>>('prescription-templates/')
  if (Array.isArray(response.data)) {
    return response.data
  }
  return response.data.results || []
}

export async function createPrescriptionTemplateApi(data: {
  name: string
  content: string
}): Promise<PrescriptionTemplate> {
  const response = await apiClient.post<PrescriptionTemplate>('prescription-templates/', data)
  return response.data
}

export async function getPrescriptionsApi(params?: {
  treatment?: string
  page?: number
}): Promise<PaginatedResponse<Prescription>> {
  const response = await apiClient.get<PaginatedResponse<Prescription>>('prescriptions/', { params })
  return response.data
}

export async function issuePrescriptionApi(
  treatmentId: string,
  data: {
    templateId?: string
    content?: string
    sendTelegram?: boolean
  }
): Promise<Prescription> {
  const response = await apiClient.post<Prescription>(`treatments/${treatmentId}/prescription/`, data)
  return response.data
}
