import { apiClient } from './client'
import { type PaginatedResponse } from '@/types/api'

export interface AuditLog {
  id: string
  action: string
  user: {
    id: string
    firstName: string
    lastName: string
    role: string
  }
  model_name: string
  object_id: string
  changes: Record<string, { old: unknown; new: unknown }>
  ip_address: string
  timestamp: string
}

export async function getAuditLogsApi(params?: {
  action?: string
  user?: string
  model_name?: string
  date_from?: string
  date_to?: string
  page?: number
}): Promise<PaginatedResponse<AuditLog>> {
  const response = await apiClient.get<PaginatedResponse<AuditLog>>('audit-logs/', { params })
  return response.data
}
