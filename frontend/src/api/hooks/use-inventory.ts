import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getMaterialsApi,
  createMaterialApi,
  updateMaterialApi,
  restockMaterialApi,
  adjustMaterialApi,
  getInventoryStatsApi,
  getAllStockLogsApi,
  getMaterialLogsApi,
  getMaterialUsagesApi,
  createMaterialUsageApi,
  getProcedureBOMsApi,
  createProcedureBOMApi,
  deleteProcedureBOMApi,
} from '../inventory'

export const MATERIALS_QUERY_KEY = ['materials']
export const INVENTORY_STATS_QUERY_KEY = ['inventory-stats']
export const STOCK_LOGS_QUERY_KEY = ['stock-logs']

export function useMaterials() {
  return useQuery({
    queryKey: MATERIALS_QUERY_KEY,
    queryFn: getMaterialsApi,
  })
}

export function useInventoryStats() {
  return useQuery({
    queryKey: INVENTORY_STATS_QUERY_KEY,
    queryFn: getInventoryStatsApi,
  })
}

export function useAllStockLogs(params?: {
  reason?: string
  search?: string
  material?: string
  page?: number
  page_size?: number
}) {
  return useQuery({
    queryKey: [...STOCK_LOGS_QUERY_KEY, params],
    queryFn: () => getAllStockLogsApi(params),
  })
}

export function useCreateMaterial() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createMaterialApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MATERIALS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: INVENTORY_STATS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: STOCK_LOGS_QUERY_KEY })
    },
  })
}

export function useUpdateMaterial() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string
      data: {
        name?: string
        unit?: string
        minimumThreshold?: string
        unitCost?: string | null
        notes?: string
      }
    }) => updateMaterialApi(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MATERIALS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: INVENTORY_STATS_QUERY_KEY })
    },
  })
}

export function useRestockMaterial() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: string }) => restockMaterialApi(id, amount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MATERIALS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: INVENTORY_STATS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: STOCK_LOGS_QUERY_KEY })
    },
  })
}

export function useAdjustMaterial() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, delta, note }: { id: string; delta: string; note?: string }) =>
      adjustMaterialApi(id, delta, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MATERIALS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: INVENTORY_STATS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: STOCK_LOGS_QUERY_KEY })
    },
  })
}

export function useMaterialLogs(id: string) {
  return useQuery({
    queryKey: ['materials', id, 'logs'],
    queryFn: () => getMaterialLogsApi(id),
    enabled: Boolean(id),
  })
}

export function useMaterialUsages(params?: { treatment?: string }) {
  return useQuery({
    queryKey: ['material-usages', params],
    queryFn: () => getMaterialUsagesApi(params),
  })
}

export function useCreateMaterialUsage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createMaterialUsageApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MATERIALS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: ['material-usages'] })
    },
  })
}

export const PROCEDURE_BOMS_QUERY_KEY = ['procedure-boms']

export function useProcedureBOMs(params?: { procedure_type?: string }) {
  return useQuery({
    queryKey: [...PROCEDURE_BOMS_QUERY_KEY, params],
    queryFn: () => getProcedureBOMsApi(params),
  })
}

export function useCreateProcedureBOM() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createProcedureBOMApi,
    onSuccess: (_, _variables) => {
      queryClient.invalidateQueries({ queryKey: PROCEDURE_BOMS_QUERY_KEY })
    },
  })
}

export function useDeleteProcedureBOM() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteProcedureBOMApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROCEDURE_BOMS_QUERY_KEY })
    },
  })
}

