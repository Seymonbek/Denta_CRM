import { apiClient } from './client'
import { LoginResponse, User } from '@/types/api'

export async function loginApi(phoneNumber: string, password: string): Promise<LoginResponse> {
  const response = await apiClient.post<LoginResponse>('auth/login/', {
    phoneNumber,
    password,
  })
  return response.data
}

export async function verify2FAApi(phoneNumber: string, password: string, code: string): Promise<LoginResponse> {
  const response = await apiClient.post<LoginResponse>('auth/2fa/verify/', {
    phoneNumber,
    password,
    code,
  })
  return response.data
}

export async function getMeApi(): Promise<User> {
  const response = await apiClient.get<User>('auth/me/')
  return response.data
}

export async function updateMeApi(data: Partial<{ firstName: string; lastName: string; telegramChatId: number | null }>): Promise<User> {
  const response = await apiClient.patch<User>('auth/me/', data)
  return response.data
}

export async function enable2FAApi(password: string): Promise<{ detail: string; twoFactorEnabled: boolean }> {
  const response = await apiClient.post('auth/2fa/enable/', { password })
  return response.data
}

export async function disable2FAApi(password: string): Promise<{ detail: string; twoFactorEnabled: boolean }> {
  const response = await apiClient.post('auth/2fa/disable/', { password })
  return response.data
}

export async function requestPasswordResetApi(phoneNumber: string): Promise<{ detail: string }> {
  const response = await apiClient.post('auth/password-reset/request/', { phoneNumber })
  return response.data
}

export async function confirmPasswordResetApi(phoneNumber: string, code: string, newPassword: string): Promise<{ detail: string }> {
  const response = await apiClient.post('auth/password-reset/confirm/', {
    phoneNumber,
    code,
    newPassword,
  })
  return response.data
}
