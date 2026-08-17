import { clearCookies } from '@/test-utils/cookies'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type User } from '@/types/api'

async function importAuthStore() {
  const { useAuthStore } = await import('./auth-store')
  return useAuthStore
}

const sampleUser: User = {
  id: 'test-uuid-1',
  firstName: 'Test',
  lastName: 'User',
  phoneNumber: '+998901234567',
  role: 'bosh_shifokor',
  twoFactorEnabled: false,
  telegramChatId: null,
}

describe('useAuthStore', () => {
  beforeEach(() => {
    clearCookies()
    vi.resetModules()
  })

  it('starts with an empty access token when nothing is persisted', async () => {
    const useAuthStore = await importAuthStore()

    expect(useAuthStore.getState().accessToken).toBe('')
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('persists tokens so a new store instance reads it back', async () => {
    const useAuthStore = await importAuthStore()
    useAuthStore.getState().setTokens('session-token', 'refresh-token')

    vi.resetModules()
    const useAuthStoreAfterReload = await importAuthStore()

    expect(useAuthStoreAfterReload.getState().accessToken).toBe('session-token')
    expect(useAuthStoreAfterReload.getState().refreshToken).toBe('refresh-token')
  })

  it('updates the signed-in user via setUser', async () => {
    const useAuthStore = await importAuthStore()

    useAuthStore.getState().setUser({ ...sampleUser })

    expect(useAuthStore.getState().user).toEqual(sampleUser)
    expect(useAuthStore.getState().isBoshShifokor()).toBe(true)
  })

  it('reset clears user and access token and drops persistence', async () => {
    const useAuthStore = await importAuthStore()
    useAuthStore.getState().setTokens('will-be-cleared', 'refresh-cleared')
    useAuthStore.getState().setUser({ ...sampleUser })

    useAuthStore.getState().reset()

    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().accessToken).toBe('')
    expect(useAuthStore.getState().refreshToken).toBe('')

    vi.resetModules()
    const useAuthStoreAfterReload = await importAuthStore()

    expect(useAuthStoreAfterReload.getState().user).toBeNull()
    expect(useAuthStoreAfterReload.getState().accessToken).toBe('')
  })
})

