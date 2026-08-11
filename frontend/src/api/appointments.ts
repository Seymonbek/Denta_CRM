import { apiClient } from './client'
import { Appointment, PaginatedResponse } from '@/types/api'

export async function getAppointmentsApi(params?: {
  doctor?: string
  patient?: string
  status?: string
  date?: string
  page?: number
  page_size?: number
}): Promise<PaginatedResponse<Appointment>> {
  const response = await apiClient.get<PaginatedResponse<Appointment>>('appointments/', {
    params: { page_size: 100, ...params },
  })
  return response.data
}

export async function getAppointmentApi(id: string): Promise<Appointment> {
  const response = await apiClient.get<Appointment>(`appointments/${id}/`)
  return response.data
}

export async function createAppointmentApi(data: {
  patient: string
  doctor: string
  department: string
  procedureType?: string
  scheduledStart: string
  scheduledEnd: string
}): Promise<Appointment> {
  const response = await apiClient.post<Appointment>('appointments/', data)
  return response.data
}

export async function updateAppointmentApi(id: string, data: Partial<Appointment>): Promise<Appointment> {
  const response = await apiClient.patch<Appointment>(`appointments/${id}/`, data)
  return response.data
}

export async function cancelAppointmentApi(id: string, reason?: string): Promise<Appointment> {
  const response = await apiClient.post<Appointment>(`appointments/${id}/cancel/`, { reason })
  return response.data
}
