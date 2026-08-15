import Swal, { type SweetAlertIcon } from 'sweetalert2'
import withReactContent from 'sweetalert2-react-content'

const MySwal = withReactContent(Swal)

/**
 * Custom Styled SweetAlert2 instance matching DentaCRM dark/light aesthetic.
 */
export const customSwal = MySwal.mixin({
  customClass: {
    confirmButton:
      'bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-xl text-xs font-bold mx-1 shadow-sm transition-all cursor-pointer',
    cancelButton:
      'bg-muted text-muted-foreground hover:bg-muted/80 px-4 py-2 rounded-xl text-xs font-medium mx-1 shadow-sm transition-all cursor-pointer',
    popup: 'rounded-2xl border border-border bg-card text-card-foreground shadow-xl p-6',
    title: 'text-lg font-bold tracking-tight text-foreground',
    htmlContainer: 'text-xs text-muted-foreground mt-2',
  },
  buttonsStyling: false,
})

/**
 * Interactive confirmation modal replacement for native confirm().
 */
export async function confirmSwal({
  title = 'Ishonchingiz komilmi?',
  text = 'Ushbu amalni ortga qaytarib bo’lmaydi.',
  icon = 'warning' as SweetAlertIcon,
  confirmButtonText = 'Ha, tasdiqlayman',
  cancelButtonText = 'Bekor qilish',
}: {
  title?: string
  text?: string
  icon?: SweetAlertIcon
  confirmButtonText?: string
  cancelButtonText?: string
}): Promise<boolean> {
  const result = await customSwal.fire({
    title,
    text,
    icon,
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText,
    reverseButtons: true,
  })
  return result.isConfirmed
}

/**
 * Toast or popup notification for success.
 */
export function successSwal(title: string, text?: string) {
  return customSwal.fire({
    title,
    text,
    icon: 'success',
    timer: 2500,
    showConfirmButton: false,
  })
}

/**
 * Error notification dialog.
 */
export function errorSwal(title: string, text?: string) {
  return customSwal.fire({
    title,
    text,
    icon: 'error',
    confirmButtonText: 'Tushundim',
  })
}

/**
 * Mobile camera vs gallery choice modal.
 */
export async function mobilePhotoPickerSwal(): Promise<'camera' | 'gallery' | null> {
  const result = await customSwal.fire({
    title: '📷 Rasm Yuklash Usulini Tanlang',
    text: 'Kameradan bevosita tushirasizmi yoki galereyadan rasm tanlaysizmi?',
    icon: 'question',
    showCancelButton: true,
    showDenyButton: true,
    confirmButtonText: '📷 Kameradan Tushirish',
    denyButtonText: '🖼️ Galereyadan Tanlash',
    cancelButtonText: 'Bekor qilish',
    reverseButtons: false,
  })

  if (result.isConfirmed) return 'camera'
  if (result.isDenied) return 'gallery'
  return null
}
