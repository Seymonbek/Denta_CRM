import { apiClient } from './client'
import {
  type Patient,
  type PatientBalance,
  type ToothRecord,
  type PaginatedResponse,
  type OdontogramHistoryRecord,
} from '@/types/api'

export async function getPatientsApi(params?: {
  search?: string
  gender?: string
  page?: number
  page_size?: number
}): Promise<PaginatedResponse<Patient>> {
  const response = await apiClient.get<PaginatedResponse<Patient>>('patients/', { params })
  return response.data
}

export async function getPatientApi(id: string): Promise<Patient> {
  const response = await apiClient.get<Patient>(`patients/${id}/`)
  return response.data
}

export async function createPatientApi(data: {
  firstName: string
  lastName: string
  phoneNumber: string
  gender?: string
  address?: string
  notes?: string
  telegramChatId?: number
}): Promise<Patient> {
  const response = await apiClient.post<Patient>('patients/', data)
  return response.data
}

export async function updatePatientApi(id: string, data: Partial<Patient>): Promise<Patient> {
  const response = await apiClient.patch<Patient>(`patients/${id}/`, data)
  return response.data
}

export async function getPatientHistoryApi(id: string): Promise<Record<string, unknown>[]> {
  const response = await apiClient.get<Record<string, unknown>[]>(`patients/${id}/history/`)
  return response.data
}

export async function getPatientOdontogramApi(id: string): Promise<ToothRecord[]> {
  const response = await apiClient.get<ToothRecord[]>(`patients/${id}/odontogram/`)
  return response.data
}

export async function getPatientOdontogramHistoryApi(id: string, toothNumber?: number): Promise<OdontogramHistoryRecord[]> {
  const params = toothNumber ? { tooth_number: toothNumber } : {}
  const response = await apiClient.get<OdontogramHistoryRecord[]>(`patients/${id}/odontogram-history/`, { params })
  return response.data
}

export async function getPatientBalanceApi(id: string): Promise<PatientBalance> {
  const response = await apiClient.get<PatientBalance>(`patients/${id}/balance/`)
  return response.data
}
