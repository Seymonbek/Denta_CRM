import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getMaterialsApi,
  createMaterialApi,
  restockMaterialApi,
  adjustMaterialApi,
  getMaterialLogsApi,
  getMaterialUsagesApi,
  createMaterialUsageApi,
  getProcedureBOMsApi,
  createProcedureBOMApi,
  deleteProcedureBOMApi,
} from '../inventory'

export const MATERIALS_QUERY_KEY = ['materials']

export function useMaterials() {
  return useQuery({
    queryKey: MATERIALS_QUERY_KEY,
    queryFn: getMaterialsApi,
  })
}

export function useCreateMaterial() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createMaterialApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MATERIALS_QUERY_KEY })
    },
  })
}

export function useRestockMaterial() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: string }) => restockMaterialApi(id, amount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MATERIALS_QUERY_KEY })
    },
  })
}

export function useAdjustMaterial() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, newQuantity, reason }: { id: string; newQuantity: string; reason?: string }) =>
      adjustMaterialApi(id, newQuantity, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MATERIALS_QUERY_KEY })
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

