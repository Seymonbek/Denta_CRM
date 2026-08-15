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
        if (data.detail && typeof data.detail === 'string') return data.detail
        if (data.message && typeof data.message === 'string') return data.message
        if (data.error && typeof data.error === 'string') return data.error
        if (data.error?.message && typeof data.error.message === 'string') return data.error.message
        if (data.title && typeof data.title === 'string') return data.title

        // DRF Dictionary of field errors (e.g., non_field_errors, phone_number, password, etc.)
        const keys = Object.keys(data)
        if (keys.length > 0) {
          for (const key of keys) {
            const val = data[key]
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
