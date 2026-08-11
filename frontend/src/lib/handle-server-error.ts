import { toast } from 'sonner'
import { getErrorMessage } from './get-error-message'

export function handleServerError(error: unknown) {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log(error)
  }

  const errMsg = getErrorMessage(error, 'Xatolik yuz berdi.')
  toast.error(errMsg)
}
