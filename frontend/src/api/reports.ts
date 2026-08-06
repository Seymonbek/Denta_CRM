import { apiClient } from './client'
import { DashboardReport } from '@/types/api'

export async function getDashboardReportApi(period: string = 'month'): Promise<DashboardReport> {
  const response = await apiClient.get<DashboardReport>('reports/dashboard/', {
    params: { period },
  })
  return response.data
}

export async function getRevenueReportApi(params?: { dateFrom?: string; dateTo?: string }): Promise<any> {
  const response = await apiClient.get('reports/revenue/', { params })
  return response.data
}

export async function getProceduresReportApi(params?: { dateFrom?: string; dateTo?: string }): Promise<any> {
  const response = await apiClient.get('reports/procedures/', { params })
  return response.data
}

export async function getDepartmentsReportApi(params?: { dateFrom?: string; dateTo?: string }): Promise<any> {
  const response = await apiClient.get('reports/departments/', { params })
  return response.data
}
