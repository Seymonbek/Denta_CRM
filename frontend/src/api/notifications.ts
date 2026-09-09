import { apiClient } from './client'
import { type NotificationLog, type PaginatedResponse } from '@/types/api'

export async function getNotificationsApi(params?: {
  search?: string
  type?: string
  status?: string
  page?: number
  page_size?: number
}): Promise<PaginatedResponse<NotificationLog>> {
  const response = await apiClient.get<PaginatedResponse<NotificationLog>>('notifications/', { params })
  return response.data
}
