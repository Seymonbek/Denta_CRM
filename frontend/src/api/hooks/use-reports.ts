import { useQuery } from '@tanstack/react-query'
import {
  getDashboardReportApi,
  getRevenueReportApi,
  getProceduresReportApi,
  getDepartmentsReportApi,
  getDoctorMyAnalyticsApi,
  getReceptionAnalyticsApi,
  type ReportFilterOptions,
} from '../reports'

interface UseReportOptions extends ReportFilterOptions {
  enabled?: boolean
}

export function useDashboardReport(period: string = 'month', options?: UseReportOptions) {
  return useQuery({
    queryKey: ['reports', 'dashboard', period, options?.startDate, options?.endDate],
    queryFn: () => getDashboardReportApi(period, options),
    enabled: options?.enabled ?? true,
  })
}

export function useRevenueReport(period: string = 'month', options?: ReportFilterOptions) {
  return useQuery({
    queryKey: ['reports', 'revenue', period, options?.startDate, options?.endDate],
    queryFn: () => getRevenueReportApi(period, options),
  })
}

export function useProceduresReport(period: string = 'month', limit: number = 10, options?: ReportFilterOptions) {
  return useQuery({
    queryKey: ['reports', 'procedures', period, limit, options?.startDate, options?.endDate],
    queryFn: () => getProceduresReportApi(period, limit, options),
  })
}

export function useDepartmentsReport(period: string = 'month', options?: ReportFilterOptions) {
  return useQuery({
    queryKey: ['reports', 'departments', period, options?.startDate, options?.endDate],
    queryFn: () => getDepartmentsReportApi(period, options),
  })
}

export function useDoctorMyAnalytics(period: string = 'month', doctorId?: string, options?: UseReportOptions) {
  return useQuery({
    queryKey: ['reports', 'doctor-my-analytics', period, doctorId || 'me', options?.startDate, options?.endDate],
    queryFn: () => getDoctorMyAnalyticsApi(period, doctorId, options),
    enabled: options?.enabled ?? true,
  })
}

export function useReceptionAnalytics(period: string = 'month', options?: UseReportOptions) {
  return useQuery({
    queryKey: ['reports', 'reception-analytics', period, options?.startDate, options?.endDate],
    queryFn: () => getReceptionAnalyticsApi(period, options),
    enabled: options?.enabled ?? true,
  })
}
