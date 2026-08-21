import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getProcedureTypesApi, createProcedureTypeApi } from '../procedure-types'

export const PROCEDURE_TYPES_QUERY_KEY = ['procedure-types']

export function useProcedureTypes(params?: { department?: string }) {
  return useQuery({
    queryKey: [...PROCEDURE_TYPES_QUERY_KEY, params],
    queryFn: () => getProcedureTypesApi(params),
  })
}

export function useCreateProcedureType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createProcedureTypeApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROCEDURE_TYPES_QUERY_KEY })
    },
  })
}
