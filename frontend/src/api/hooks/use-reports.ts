import { useQuery } from '@tanstack/react-query'
import {
  getDashboardReportApi,
  getRevenueReportApi,
  getProceduresReportApi,
  getDepartmentsReportApi,
} from '../reports'

export function useDashboardReport(period: string = 'month') {
  return useQuery({
    queryKey: ['reports', 'dashboard', period],
    queryFn: () => getDashboardReportApi(period),
  })
}

export function useRevenueReport(params?: { dateFrom?: string; dateTo?: string }) {
  return useQuery({
    queryKey: ['reports', 'revenue', params],
    queryFn: () => getRevenueReportApi(params),
  })
}

export function useProceduresReport(params?: { dateFrom?: string; dateTo?: string }) {
  return useQuery({
    queryKey: ['reports', 'procedures', params],
    queryFn: () => getProceduresReportApi(params),
  })
}

export function useDepartmentsReport(params?: { dateFrom?: string; dateTo?: string }) {
  return useQuery({
    queryKey: ['reports', 'departments', params],
    queryFn: () => getDepartmentsReportApi(params),
  })
}
