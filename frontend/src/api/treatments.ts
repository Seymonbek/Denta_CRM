import { apiClient } from './client'
import {
  Treatment,
  TreatmentPhoto,
  ToothRecord,
  PaginatedResponse,
  PhotoType,
} from '@/types/api'

export async function getTreatmentsApi(params?: {
  patient?: string
  doctor?: string
  payment_status?: string
  stage?: string
  approval_status?: string
  page?: number
}): Promise<PaginatedResponse<Treatment>> {
  const response = await apiClient.get<PaginatedResponse<Treatment>>('treatments/', { params })
  return response.data
}

export async function getTreatmentApi(id: string): Promise<Treatment> {
  const response = await apiClient.get<Treatment>(`treatments/${id}/`)
  return response.data
}

export async function createTreatmentApi(data: {
  appointment: string
  doctor: string
  patient: string
  department: string
  procedureType: string
  diagnosis?: string
  description?: string
  price: string
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
