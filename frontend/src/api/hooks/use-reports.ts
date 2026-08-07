import { useQuery } from '@tanstack/react-query'
import {
  getDashboardReportApi,
  getRevenueReportApi,
  getProceduresReportApi,
  getDepartmentsReportApi,
  getDoctorMyAnalyticsApi,
  getReceptionAnalyticsApi,
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

export function useDoctorMyAnalytics(period: string = 'month', doctorId?: string) {
  return useQuery({
    queryKey: ['reports', 'doctor-my-analytics', period, doctorId || 'me'],
    queryFn: () => getDoctorMyAnalyticsApi(period, doctorId),
  })
}

export function useReceptionAnalytics(period: string = 'month') {
  return useQuery({
    queryKey: ['reports', 'reception-analytics', period],
    queryFn: () => getReceptionAnalyticsApi(period),
  })
}
