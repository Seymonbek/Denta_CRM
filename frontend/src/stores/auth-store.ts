import { create } from 'zustand'
import { type User } from '@/types/api'
import { getCookie, setCookie, removeCookie } from '@/lib/cookies'

const ACCESS_TOKEN_KEY = 'dentacrm_access_token'
const REFRESH_TOKEN_KEY = 'dentacrm_refresh_token'
const USER_KEY = 'dentacrm_user'

interface AuthState {
  user: User | null
  accessToken: string
  refreshToken: string
  setUser: (user: User | null) => void
  setTokens: (accessToken: string, refreshToken: string) => void
  reset: () => void
  isAuthenticated: () => boolean
  isBoshShifokor: () => boolean
  isDoctor: () => boolean
  isAdministrator: () => boolean
}

export const useAuthStore = create<AuthState>()((set, get) => {
  const initAccess = getCookie(ACCESS_TOKEN_KEY) || ''
  const initRefresh = getCookie(REFRESH_TOKEN_KEY) || ''
  const initUserStr = getCookie(USER_KEY)
  let initUser: User | null = null
  if (initUserStr) {
    try {
      initUser = JSON.parse(decodeURIComponent(initUserStr))
    } catch {
      initUser = null
    }
  }

  return {
    user: initUser,
    accessToken: initAccess,
    refreshToken: initRefresh,
    setUser: (user) => {
      if (user) {
        setCookie(USER_KEY, encodeURIComponent(JSON.stringify(user)))
      } else {
        removeCookie(USER_KEY)
      }
      set({ user })
    },
    setTokens: (accessToken, refreshToken) => {
      setCookie(ACCESS_TOKEN_KEY, accessToken)
      setCookie(REFRESH_TOKEN_KEY, refreshToken)
      set({ accessToken, refreshToken })
    },
    reset: () => {
      removeCookie(ACCESS_TOKEN_KEY)
      removeCookie(REFRESH_TOKEN_KEY)
      removeCookie(USER_KEY)
      set({ user: null, accessToken: '', refreshToken: '' })
    },
    isAuthenticated: () => {
      return Boolean(get().accessToken)
    },
    isBoshShifokor: () => {
      return get().user?.role === 'bosh_shifokor'
    },
    isDoctor: () => {
      return get().user?.role === 'doctor'
    },
    isAdministrator: () => {
      return get().user?.role === 'administrator'
    },
  }
})
