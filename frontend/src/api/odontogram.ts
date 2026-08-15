import { apiClient } from './client'
import { type ToothRecord, type PaginatedResponse } from '@/types/api'

export async function getToothRecordsApi(params?: {
  treatment?: string
  toothNumber?: number
  page?: number
}): Promise<PaginatedResponse<ToothRecord>> {
  const response = await apiClient.get<PaginatedResponse<ToothRecord>>('tooth-records/', { params })
  return response.data
}
