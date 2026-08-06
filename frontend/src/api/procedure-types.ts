import { apiClient } from './client'
import { ProcedureType, PaginatedResponse } from '@/types/api'

export async function getProcedureTypesApi(): Promise<ProcedureType[]> {
  const response = await apiClient.get<ProcedureType[] | PaginatedResponse<ProcedureType>>('procedure-types/')
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
