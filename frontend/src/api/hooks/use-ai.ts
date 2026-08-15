import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  postAIChatApi,
  getAIInventorySummaryApi,
  getAIPermissionConfigsApi,
  updateAIPermissionConfigApi,
} from '../ai'

export function useAIChat() {
  return useMutation({
    mutationFn: (message: string) => postAIChatApi(message),
  })
}

export function useAIInventorySummary() {
  return useQuery({
    queryKey: ['ai', 'inventory-summary'],
    queryFn: getAIInventorySummaryApi,
  })
}

export function useAIPermissions() {
  return useQuery({
    queryKey: ['ai', 'permissions'],
    queryFn: getAIPermissionConfigsApi,
  })
}

export function useUpdateAIPermission() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & Record<string, unknown>) =>
      updateAIPermissionConfigApi(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai', 'permissions'] })
    },
  })
}
