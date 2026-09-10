import { apiClient } from './client'
import {
  type Material,
  type MaterialUsage,
  type ProcedureBOM,
  type PaginatedResponse,
  type MaterialStockLogItem,
  type InventoryStats,
} from '@/types/api'

export async function getMaterialsApi(): Promise<Material[]> {
  const response = await apiClient.get<Material[] | PaginatedResponse<Material>>('materials/')
  if (Array.isArray(response.data)) {
    return response.data
  }
  return response.data.results || []
}

export async function createMaterialApi(data: {
  name: string
  unit: string
  quantityInStock: string
  minimumThreshold: string
  unitCost?: string
  notes?: string
}): Promise<Material> {
  const response = await apiClient.post<Material>('materials/', data)
  return response.data
}

export async function updateMaterialApi(
  id: string,
  data: {
    name?: string
    unit?: string
    minimumThreshold?: string
    unitCost?: string | null
    notes?: string
  }
): Promise<Material> {
  const response = await apiClient.patch<Material>(`materials/${id}/`, data)
  return response.data
}

export async function restockMaterialApi(id: string, amount: string): Promise<Material> {
  const response = await apiClient.patch<Material>(`materials/${id}/restock/`, { amount })
  return response.data
}

export async function adjustMaterialApi(id: string, delta: string, note?: string): Promise<Material> {
  const response = await apiClient.post<Material>(`materials/${id}/adjust/`, {
    delta,
    note: note || '',
  })
  return response.data
}

export async function getInventoryStatsApi(): Promise<InventoryStats> {
  const response = await apiClient.get<InventoryStats>('materials/stats/')
  return response.data
}

export async function getAllStockLogsApi(params?: {
  reason?: string
  search?: string
  material?: string
  page?: number
  page_size?: number
}): Promise<PaginatedResponse<MaterialStockLogItem> | MaterialStockLogItem[]> {
  const response = await apiClient.get<PaginatedResponse<MaterialStockLogItem> | MaterialStockLogItem[]>(
    'materials/all-logs/',
    { params }
  )
  return response.data
}

export async function getMaterialLogsApi(id: string): Promise<MaterialStockLogItem[]> {
  const response = await apiClient.get<MaterialStockLogItem[] | PaginatedResponse<MaterialStockLogItem>>(`materials/${id}/logs/`)
  if (Array.isArray(response.data)) {
    return response.data
  }
  return response.data.results || []
}

export async function getMaterialUsagesApi(params?: { treatment?: string }): Promise<MaterialUsage[]> {
  const response = await apiClient.get<MaterialUsage[] | PaginatedResponse<MaterialUsage>>('material-usages/', { params })
  if (Array.isArray(response.data)) {
    return response.data
  }
  return response.data.results || []
}

export async function createMaterialUsageApi(data: {
  treatment: string
  material: string
  quantityUsed: string
}): Promise<MaterialUsage> {
  const response = await apiClient.post<MaterialUsage>('material-usages/', data)
  return response.data
}

export async function getProcedureBOMsApi(params?: { procedure_type?: string }): Promise<ProcedureBOM[]> {
  const response = await apiClient.get<ProcedureBOM[] | PaginatedResponse<ProcedureBOM>>('procedure-boms/', { params })
  if (Array.isArray(response.data)) {
    return response.data
  }
  return response.data.results || []
}

export async function createProcedureBOMApi(data: {
  procedureType: string
  material: string
  defaultQuantity: string
}): Promise<ProcedureBOM> {
  const response = await apiClient.post<ProcedureBOM>('procedure-boms/', data)
  return response.data
}

export async function deleteProcedureBOMApi(id: string): Promise<void> {
  await apiClient.delete(`procedure-boms/${id}/`)
}

