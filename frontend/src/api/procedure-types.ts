import { apiClient } from './client'
import { type ProcedureType, type PaginatedResponse } from '@/types/api'

export async function getProcedureTypesApi(params?: { department?: string }): Promise<ProcedureType[]> {
  const response = await apiClient.get<ProcedureType[] | PaginatedResponse<ProcedureType>>('procedure-types/', { params })
  if (Array.isArray(response.data)) {
    return response.data
  }
  return response.data.results || []
}

export async function createProcedureTypeApi(data: {
  name: string
  department: string
  defaultDurationMinutes: number
  defaultPrice: string
  commissionRateOverride?: string
}): Promise<ProcedureType> {
  const response = await apiClient.post<ProcedureType>('procedure-types/', data)
  return response.data
}
