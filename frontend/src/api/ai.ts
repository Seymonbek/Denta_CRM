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
  role: 'bosh_shifokor' | 'admin' | 'doctor' | 'reception'
  enabled: boolean
  updatedAt: string
}

export async function postAIChatApi(message: string): Promise<AIChatResponse> {
  const response = await apiClient.post<AIChatResponse>('ai/chat/', { message })
  return response.data
}

export async function getAIInventorySummaryApi(): Promise<AIInventorySummary> {
  const response = await apiClient.get<AIInventorySummary>('ai/inventory-summary/')
  return response.data
}

export async function getAIPermissionConfigsApi(): Promise<AIPermissionConfig[]> {
  const response = await apiClient.get<AIPermissionConfig[]>('ai/permissions/')
  return response.data
}

export async function updateAIPermissionConfigApi(
  id: string,
  enabled: boolean
): Promise<AIPermissionConfig> {
  const response = await apiClient.patch<AIPermissionConfig>(`ai/permissions/${id}/`, { enabled })
  return response.data
}
