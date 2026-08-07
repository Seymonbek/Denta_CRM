import { apiClient } from './client'

export interface AIChatRequest {
  message: string
}

export interface AIChatResponse {
  message: string
  source: 'gemini-ai' | 'crm-smart-assistant'
  timestamp: string
  contextSummary?: {
    totalPatients?: number
    todayAppointments?: number
    lowStockMaterialsCount?: number
    revenueToday?: string
  }
}

export interface AIInventorySummary {
  lowStockItemsCount: number
  totalItemsCount: number
  criticalItems: Array<{
    id: string
    name: string
    quantityInStock: string
    minimumThreshold: string
    unit: string
  }>
  aiRecommendation: string
}

export interface AIPermissionConfig {
  id: string
  role: string
  canViewInventoryCosts: boolean
  canViewFinancialReports: boolean
  canViewOtherDoctorsStats: boolean
  canViewAllPatients: boolean
}

export async function postAIChatApi(message: string): Promise<AIChatResponse> {
  const response = await apiClient.post<any>('ai/chat/', { message })
  const data = response.data
  return {
    message: data.answer || data.message || '',
    source: data.source || 'gemini-ai',
    timestamp: new Date().toISOString(),
    contextSummary: data.contextSummary,
  }
}

export async function getAIInventorySummaryApi(): Promise<AIInventorySummary> {
  const response = await apiClient.get<AIInventorySummary>('ai/inventory-summary/')
  return response.data
}

export async function getAIPermissionConfigsApi(): Promise<AIPermissionConfig[]> {
  const response = await apiClient.get<any>('ai/permissions/')
  const results = Array.isArray(response.data) ? response.data : (response.data?.results || [])
  return results
}

export async function updateAIPermissionConfigApi(
  id: string,
  payload: Partial<AIPermissionConfig>
): Promise<AIPermissionConfig> {
  const response = await apiClient.patch<AIPermissionConfig>(`ai/permissions/${id}/`, payload)
  return response.data
}
