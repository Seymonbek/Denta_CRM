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
  const response = await apiClient.get<WorkingHours[]>(`auth/users/${doctorId}/working-hours/`)
  return response.data
}

export async function createWorkingHoursApi(
  doctorId: string,
  data: { weekday: number; startTime: string; endTime: string }
): Promise<WorkingHours> {
  const payload = {
    weekday: data.weekday,
    start_time: data.startTime,
    end_time: data.endTime,
    startTime: data.startTime,
    endTime: data.endTime,
  }
  const response = await apiClient.post<WorkingHours>(`auth/users/${doctorId}/working-hours/`, payload)
  return response.data
}

export async function deleteWorkingHoursApi(doctorId: string, workingHoursId: string): Promise<void> {
  await apiClient.delete(`auth/users/${doctorId}/working-hours/${workingHoursId}/`)
}

export async function getTimeOffApi(doctorId: string): Promise<TimeOff[]> {
  const response = await apiClient.get<TimeOff[]>(`auth/users/${doctorId}/time-off/`)
  return response.data
}

export async function createTimeOffApi(
  doctorId: string,
  data: { dateStart: string; dateEnd: string; reason: string }
): Promise<TimeOff> {
  const response = await apiClient.post<TimeOff>(`auth/users/${doctorId}/time-off/`, data)
  return response.data
}

export async function deleteTimeOffApi(doctorId: string, entryId: string): Promise<void> {
  await apiClient.delete(`auth/users/${doctorId}/time-off/${entryId}/`)
}

export async function getAvailableSlotsApi(
  doctorId: string,
  date: string,
  slotMinutes?: number,
  procedureTypeId?: string
): Promise<AvailableSlot[]> {
  const response = await apiClient.get<any>(`doctors/${doctorId}/available-slots/`, {
    params: {
      date,
      ...(slotMinutes ? { slot_minutes: slotMinutes } : {}),
      ...(procedureTypeId ? { procedure_type: procedureTypeId } : {}),
    },
  })
  if (Array.isArray(response.data)) {
    return response.data
  }
  if (response.data && Array.isArray(response.data.slots)) {
    return response.data.slots
  }
  return []
}
