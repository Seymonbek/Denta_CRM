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

export function useRevenueReport(period: string = 'month') {
  return useQuery({
    queryKey: ['reports', 'revenue', period],
    queryFn: () => getRevenueReportApi(period),
  })
}

export function useProceduresReport(period: string = 'month', limit: number = 10) {
  return useQuery({
    queryKey: ['reports', 'procedures', period, limit],
    queryFn: () => getProceduresReportApi(period, limit),
  })
}

export function useDepartmentsReport(period: string = 'month') {
  return useQuery({
    queryKey: ['reports', 'departments', period],
    queryFn: () => getDepartmentsReportApi(period),
  })
}
