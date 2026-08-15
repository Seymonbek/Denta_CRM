import { apiClient } from './client'
import { type DashboardReport } from '@/types/api'

export interface DoctorAnalyticsPayload {
  period: string
  doctorName: string
  totalRevenue: string
  paidRevenue: string
  pendingRevenue: string
  commissionRate: string
  earnedCommission: string
  totalPatientsTreated: number
  totalTreatmentsCount: number
  procedureBreakdown: Array<{
    name: string
    count: number
    totalAmount: string
  }>
  appointments: {
    total: number
    completed: number
    scheduled: number
    canceled: number
    cancellationRatePercent: number
  }
  totalMaterialCost: string
  netDoctorProfit: string
  materialsUsed: Array<{
    materialName: string
    quantity: string
    unit: string
    totalCost: string
  }>
}

export interface ReceptionAnalyticsPayload {
  period: string
  totalPaymentsCollected: string
  paymentsCount: number
  byMethod: Array<{
    method: string
    total: string
    count: number
  }>
  appointments: {
    total: number
    completed: number
    scheduled: number
    canceled: number
  }
  unpaidTreatmentsCount: number
  unpaidTreatmentsTotal: string
}

export async function getDashboardReportApi(period: string = 'month'): Promise<DashboardReport> {
  const response = await apiClient.get<DashboardReport>('reports/dashboard/', {
    params: { period },
  })
  return response.data
}

export async function getRevenueReportApi(period: string = 'month'): Promise<Record<string, unknown>> {
  const response = await apiClient.get('reports/revenue/', {
    params: { period },
  })
  return response.data
}

export async function getProceduresReportApi(period: string = 'month', limit: number = 10): Promise<Record<string, unknown>> {
  const response = await apiClient.get('reports/procedures/', {
    params: { period, limit },
  })
  return response.data
}

export async function getDepartmentsReportApi(period: string = 'month'): Promise<Record<string, unknown>> {
  const response = await apiClient.get('reports/departments/', {
    params: { period },
  })
  return response.data
}

export async function getDoctorMyAnalyticsApi(
  period: string = 'month',
  doctorId?: string
): Promise<DoctorAnalyticsPayload> {
  const response = await apiClient.get<DoctorAnalyticsPayload>('reports/doctor-my-analytics/', {
    params: { period, doctor_id: doctorId },
  })
  return response.data
}

export async function getReceptionAnalyticsApi(
  period: string = 'month'
): Promise<ReceptionAnalyticsPayload> {
  const response = await apiClient.get<ReceptionAnalyticsPayload>('reports/reception-analytics/', {
    params: { period },
  })
  return response.data
}
