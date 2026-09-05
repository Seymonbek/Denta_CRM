import { useQuery } from '@tanstack/react-query'
import { getAuditLogsApi, type AuditLog } from '../audit'

export type { AuditLog }
export const AUDIT_LOGS_QUERY_KEY = ['audit-logs']

export function useAuditLogs(params?: {
  action?: string
  user?: string
  model_name?: string
  date_from?: string
  date_to?: string
  search?: string
  page?: number
  page_size?: number
}) {
  return useQuery({
    queryKey: [...AUDIT_LOGS_QUERY_KEY, params],
    queryFn: () => getAuditLogsApi(params),
  })
}
