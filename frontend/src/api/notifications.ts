import { apiClient } from './client'
import { NotificationLog, PaginatedResponse } from '@/types/api'

export async function getNotificationsApi(params?: {
  type?: string
  status?: string
  page?: number
}): Promise<PaginatedResponse<NotificationLog>> {
  const response = await apiClient.get<PaginatedResponse<NotificationLog>>('notifications/', { params })
  return response.data
}
