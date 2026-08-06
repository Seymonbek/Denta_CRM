import { apiClient } from './client'
import { Department, PaginatedResponse } from '@/types/api'

export async function getDepartmentsApi(): Promise<Department[]> {
  const response = await apiClient.get<Department[] | PaginatedResponse<Department>>('departments/')
  if (Array.isArray(response.data)) {
    return response.data
  }
  return response.data.results || []
}

export async function createDepartmentApi(data: { name: string; description?: string }): Promise<Department> {
  const response = await apiClient.post<Department>('departments/', data)
  return response.data
}

export async function updateDepartmentApi(id: string, data: Partial<{ name: string; description: string; isActive: boolean }>): Promise<Department> {
  const response = await apiClient.patch<Department>(`departments/${id}/`, data)
  return response.data
}

export async function deleteDepartmentApi(id: string): Promise<void> {
  await apiClient.delete(`departments/${id}/`)
}
