import { apiClient } from './client'
import {
  DoctorProfile,
  WorkingHours,
  TimeOff,
  AvailableSlot,
  PaginatedResponse,
} from '@/types/api'

export async function getDoctorsApi(): Promise<DoctorProfile[]> {
  const response = await apiClient.get<DoctorProfile[] | PaginatedResponse<DoctorProfile>>('doctors/')
  if (Array.isArray(response.data)) {
    return response.data
  }
  return response.data.results || []
}

export async function getDoctorApi(id: string): Promise<DoctorProfile> {
  const response = await apiClient.get<DoctorProfile>(`doctors/${id}/`)
  return response.data
}

export async function createDoctorApi(data: any): Promise<DoctorProfile> {
  const response = await apiClient.post<DoctorProfile>('doctors/', data)
  return response.data
}

export async function updateDoctorApi(id: string, data: any): Promise<DoctorProfile> {
  const response = await apiClient.patch<DoctorProfile>(`doctors/${id}/`, data)
  return response.data
}

export async function getWorkingHoursApi(doctorId: string): Promise<WorkingHours[]> {
  const response = await apiClient.get<WorkingHours[]>(`doctors/${doctorId}/working-hours/`)
  return response.data
}

export async function createWorkingHoursApi(
  doctorId: string,
  data: { weekday: number; startTime: string; endTime: string }
): Promise<WorkingHours> {
  const response = await apiClient.post<WorkingHours>(`doctors/${doctorId}/working-hours/`, data)
  return response.data
}

export async function deleteWorkingHoursApi(doctorId: string, workingHoursId: string): Promise<void> {
  await apiClient.delete(`doctors/${doctorId}/working-hours/${workingHoursId}/`)
}

export async function getTimeOffApi(doctorId: string): Promise<TimeOff[]> {
  const response = await apiClient.get<TimeOff[]>(`doctors/${doctorId}/time-off/`)
  return response.data
}

export async function createTimeOffApi(
  doctorId: string,
  data: { dateStart: string; dateEnd: string; reason: string }
): Promise<TimeOff> {
  const response = await apiClient.post<TimeOff>(`doctors/${doctorId}/time-off/`, data)
  return response.data
}

export async function getAvailableSlotsApi(doctorId: string, date: string): Promise<AvailableSlot[]> {
  const response = await apiClient.get<AvailableSlot[]>(`doctors/${doctorId}/available-slots/`, {
    params: { date },
  })
  return response.data
}
