import { apiClient } from './client'
import {
  type Treatment,
  type TreatmentPhoto,
  type ToothRecord,
  type PaginatedResponse,
  type PhotoType,
} from '@/types/api'

export async function getTreatmentsApi(params?: {
  patient?: string
  doctor?: string
  payment_status?: string
  stage?: string
  approval_status?: string
  search?: string
  page?: number
  page_size?: number
}): Promise<PaginatedResponse<Treatment>> {
  const response = await apiClient.get<PaginatedResponse<Treatment>>('treatments/', {
    params: { page_size: 20, ...params },
  })
  return response.data
}

export async function getTreatmentApi(id: string): Promise<Treatment> {
  const response = await apiClient.get<Treatment>(`treatments/${id}/`)
  return response.data
}

export async function createTreatmentApi(data: {
  appointment?: string
  doctor: string
  patient: string
  department: string
  procedureType: string
  diagnosis?: string
  description?: string
  price: string
  originalPrice?: number
  discountPercent?: number
  discountReason?: string
  surfaces?: string[]
  icdCode?: string
  planItem?: string
}): Promise<Treatment> {
  const response = await apiClient.post<Treatment>('treatments/', data)
  return response.data
}

export async function updateTreatmentApi(id: string, data: Partial<Treatment>): Promise<Treatment> {
  const response = await apiClient.patch<Treatment>(`treatments/${id}/`, data)
  return response.data
}

export async function uploadTreatmentPhotoApi(
  treatmentId: string,
  file: File,
  photoType: PhotoType
): Promise<TreatmentPhoto> {
  const formData = new FormData()
  formData.append('image', file)
  formData.append('photoType', photoType)

  const response = await apiClient.post<TreatmentPhoto>(`treatments/${treatmentId}/photos/`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
  return response.data
}

export async function createToothRecordApi(
  treatmentId: string,
  data: {
    toothNumber: number
    procedure: string
    status: string
    surfaces?: string[]
    notes?: string
  }
): Promise<ToothRecord> {
  const response = await apiClient.post<ToothRecord>(`treatments/${treatmentId}/tooth-records/`, data)
  return response.data
}

export async function approveDiscountApi(id: string, status: 'approved' | 'rejected'): Promise<Treatment> {
  const response = await apiClient.post<Treatment>(`treatments/${id}/approve-discount/`, { status })
  return response.data
}

// ---------------------------------------------------------------------------
// ICD-10 API
// ---------------------------------------------------------------------------
export async function getICD10DiagnosesApi(params?: {
  search?: string
  category?: string
  is_common?: boolean
}): Promise<any[]> {
  const response = await apiClient.get<any[]>('treatments/icd10/', { params })
  return response.data
}

// ---------------------------------------------------------------------------
// Treatment Plans API
// ---------------------------------------------------------------------------
export async function getTreatmentPlansApi(params?: {
  patient?: string
  doctor?: string
  status?: string
  search?: string
}): Promise<any[]> {
  const response = await apiClient.get<any>('treatments/plans/', { params })
  if (Array.isArray(response.data)) return response.data
  return response.data?.results || []
}

export async function getTreatmentPlanApi(id: string): Promise<any> {
  const response = await apiClient.get<any>(`treatments/plans/${id}/`)
  return response.data
}

export async function createTreatmentPlanApi(data: {
  patient: string
  doctor: string
  title: string
  status?: string
  notes?: string
  discountPercent?: number | string
  items?: Array<{
    title: string
    toothNumber?: number | null
    procedureType?: string | null
    order?: number
    estimatedPrice?: number | string
    status?: string
    notes?: string
  }>
}): Promise<any> {
  const response = await apiClient.post<any>('treatments/plans/', data)
  return response.data
}

export async function updateTreatmentPlanApi(id: string, data: Partial<any>): Promise<any> {
  const response = await apiClient.patch<any>(`treatments/plans/${id}/`, data)
  return response.data
}

export async function deleteTreatmentPlanApi(id: string): Promise<void> {
  await apiClient.delete(`treatments/plans/${id}/`)
}

export async function createTreatmentPlanItemApi(data: {
  plan: string
  title: string
  toothNumber?: number | null
  procedureType?: string | null
  order?: number
  estimatedPrice?: number | string
  status?: string
  notes?: string
}): Promise<any> {
  const response = await apiClient.post<any>('treatments/plan-items/', data)
  return response.data
}

export async function updateTreatmentPlanItemApi(id: string, data: Partial<any>): Promise<any> {
  const response = await apiClient.patch<any>(`treatments/plan-items/${id}/`, data)
  return response.data
}

export async function deleteTreatmentPlanItemApi(id: string): Promise<void> {
  await apiClient.delete(`treatments/plan-items/${id}/`)
}
