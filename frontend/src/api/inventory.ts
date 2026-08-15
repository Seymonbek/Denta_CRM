import { apiClient } from './client'
import { type Material, type MaterialUsage, type ProcedureBOM, type PaginatedResponse } from '@/types/api'

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
}): Promise<Material> {
  const response = await apiClient.post<Material>('materials/', data)
  return response.data
}

export async function restockMaterialApi(id: string, amount: string): Promise<Material> {
  const response = await apiClient.patch<Material>(`materials/${id}/restock/`, { amount })
  return response.data
}

export async function adjustMaterialApi(id: string, newQuantity: string, reason?: string): Promise<Material> {
  const response = await apiClient.patch<Material>(`materials/${id}/adjust/`, {
    quantityInStock: newQuantity,
    reason,
  })
  return response.data
}

export async function getMaterialLogsApi(id: string): Promise<Record<string, unknown>[]> {
  const response = await apiClient.get<Record<string, unknown>[]>(`materials/${id}/logs/`)
  return response.data
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

