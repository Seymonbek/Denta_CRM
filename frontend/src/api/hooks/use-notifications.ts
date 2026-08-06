import { useQuery } from '@tanstack/react-query'
import { getNotificationsApi } from '../notifications'

export const NOTIFICATIONS_QUERY_KEY = ['notifications']

export function useNotifications(params?: { type?: string; status?: string; page?: number }) {
  return useQuery({
    queryKey: [...NOTIFICATIONS_QUERY_KEY, params],
    queryFn: () => getNotificationsApi(params),
  })
}
