import { apiClient } from './client'
import { DashboardReport } from '@/types/api'

export async function getDashboardReportApi(period: string = 'month'): Promise<DashboardReport> {
  const response = await apiClient.get<DashboardReport>('reports/dashboard/', {
    params: { period },
  })
  return response.data
}

export async function getRevenueReportApi(period: string = 'month'): Promise<any> {
  const response = await apiClient.get('reports/revenue/', {
    params: { period },
  })
  return response.data
}

export async function getProceduresReportApi(period: string = 'month', limit: number = 10): Promise<any> {
  const response = await apiClient.get('reports/procedures/', {
    params: { period, limit },
  })
  return response.data
}

export async function getDepartmentsReportApi(period: string = 'month'): Promise<any> {
  const response = await apiClient.get('reports/departments/', {
    params: { period },
  })
  return response.data
}
