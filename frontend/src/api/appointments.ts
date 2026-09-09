import { apiClient } from './client'
import { type Appointment, type PaginatedResponse } from '@/types/api'

export async function getAppointmentsApi(params?: {
  doctor?: string
  patient?: string
  status?: string
  date?: string
  search?: string
  page?: number
  page_size?: number
}): Promise<PaginatedResponse<Appointment>> {
  const response = await apiClient.get<PaginatedResponse<Appointment>>('appointments/', {
    params: { page_size: 20, ...params },
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

export async function cleanupOverdueAppointmentsApi(): Promise<{
  status: string
  completedCount: number
  noShowCount: number
  totalSettled: number
  message: string
}> {
  const response = await apiClient.post<{
    status: string
    completedCount: number
    noShowCount: number
    totalSettled: number
    message: string
  }>('appointments/cleanup-overdue/')
  return response.data
}

export interface AppointmentConflictResult {
  hasConflict: boolean
  conflictType?: 'time_off' | 'doctor_overlap' | 'patient_overlap' | 'invalid_params'
  message?: string
  reason?: string
}

export async function getCalendarAppointmentsApi(params: {
  dateFrom?: string
  dateTo?: string
  date?: string
  doctor?: string
  department?: string
  status?: string
}): Promise<Appointment[]> {
  const response = await apiClient.get<Appointment[]>('appointments/calendar/', {
    params: {
      date_from: params.dateFrom,
      date_to: params.dateTo,
      date: params.date,
      doctor: params.doctor,
      department: params.department,
      status: params.status,
    },
  })
  return response.data
}

export async function checkAppointmentConflictApi(params: {
  doctor: string
  start: string
  end: string
  patient?: string
  excludeId?: string
}): Promise<AppointmentConflictResult> {
  const response = await apiClient.get<AppointmentConflictResult>('appointments/check-conflict/', {
    params: {
      doctor: params.doctor,
      start: params.start,
      end: params.end,
      patient: params.patient,
      exclude_id: params.excludeId,
    },
  })
  return response.data
}

