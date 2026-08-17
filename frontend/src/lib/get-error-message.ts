import { AxiosError } from 'axios'

/**
 * Universal utility to extract exact, user-friendly error messages
 * from Django REST Framework API responses, Axios errors, or standard Error objects.
 */
export function getErrorMessage(err: unknown, fallback: string = 'Xatolik yuz berdi.'): string {
  if (!err) return fallback

  if (err instanceof AxiosError || (typeof err === 'object' && err !== null && 'response' in err)) {
    const data = (err as AxiosError<Record<string, unknown>>)?.response?.data || (err as Record<string, { data?: unknown }>).response?.data
    if (data) {
      if (typeof data === 'string' && data.trim().length > 0) {
        return data
      }
      if (typeof data === 'object' && data !== null) {
        const obj = data as Record<string, any>
        if (obj.detail && typeof obj.detail === 'string') return obj.detail
        if (obj.message && typeof obj.message === 'string') return obj.message
        if (obj.error && typeof obj.error === 'string') return obj.error
        if (obj.error?.message && typeof obj.error.message === 'string') return obj.error.message
        if (obj.title && typeof obj.title === 'string') return obj.title

        // DRF Dictionary of field errors (e.g., non_field_errors, phone_number, password, etc.)
        const keys = Object.keys(obj)
        if (keys.length > 0) {
          for (const key of keys) {
            const val = obj[key]
            if (Array.isArray(val) && val.length > 0) {
              const first = val[0]
              if (typeof first === 'string') {
                return first
              }
            } else if (typeof val === 'string' && val.trim().length > 0) {
              return val
            }
          }
        }
      }
    }
  }

  if (err instanceof Error && err.message) {
    return err.message
  }

  return fallback
}
