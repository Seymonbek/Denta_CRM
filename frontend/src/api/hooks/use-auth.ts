import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  loginApi,
  verify2FAApi,
  getMeApi,
  updateMeApi,
  enable2FAApi,
  disable2FAApi,
} from '../auth'
import { useAuthStore } from '@/stores/auth-store'

export const AUTH_QUERY_KEY = ['auth', 'me']

export function useMe() {
  const { accessToken, setUser } = useAuthStore()

  return useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: async () => {
      const user = await getMeApi()
      setUser(user)
      return user
    },
    enabled: Boolean(accessToken),
    staleTime: 5 * 60 * 1000,
  })
}

export function useLogin() {
  const queryClient = useQueryClient()
  const { setTokens, setUser } = useAuthStore()

  return useMutation({
    mutationFn: async ({ phoneNumber, password }: { phoneNumber: string; password: string }) => {
      const data = await loginApi(phoneNumber, password)
      if (data.access && data.refresh) {
        setTokens(data.access, data.refresh)
        const user = await getMeApi()
        setUser(user)
        queryClient.setQueryData(AUTH_QUERY_KEY, user)
      }
      return data
    },
  })
}

export function useVerify2FA() {
  const queryClient = useQueryClient()
  const { setTokens, setUser } = useAuthStore()

  return useMutation({
    mutationFn: async ({
      phoneNumber,
      password,
      code,
    }: {
      phoneNumber: string
      password: string
      code: string
    }) => {
      const data = await verify2FAApi(phoneNumber, password, code)
      if (data.access && data.refresh) {
        setTokens(data.access, data.refresh)
        const user = await getMeApi()
        setUser(user)
        queryClient.setQueryData(AUTH_QUERY_KEY, user)
      }
      return data
    },
  })
}

export function useUpdateMe() {
  const queryClient = useQueryClient()
  const { setUser } = useAuthStore()

  return useMutation({
    mutationFn: updateMeApi,
    onSuccess: (updatedUser) => {
      setUser(updatedUser)
      queryClient.setQueryData(AUTH_QUERY_KEY, updatedUser)
    },
  })
}

export function useEnable2FA() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: enable2FAApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY })
    },
  })
}

export function useDisable2FA() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: disable2FAApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY })
    },
  })
}
