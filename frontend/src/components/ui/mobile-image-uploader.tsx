import { useRef } from 'react'
import { Camera, Image as ImageIcon, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { mobilePhotoPickerSwal } from '@/lib/sweetalert'

interface MobileImageUploaderProps {
  onFileSelect: (file: File) => void
  disabled?: boolean
  label?: string
  className?: string
}

export function MobileImageUploader({
  onFileSelect,
  disabled = false,
  label = 'Rasm Yuklash',
  className,
}: MobileImageUploaderProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  const isMobile =
    typeof window !== 'undefined' &&
    /Android|iPhone|iPad|iPod|Opera Mini|IEMobile/i.test(navigator.userAgent)

  const handleClick = async () => {
    if (disabled) return

    if (isMobile) {
      const choice = await mobilePhotoPickerSwal()
      if (choice === 'camera') {
        cameraInputRef.current?.click()
      } else if (choice === 'gallery') {
        galleryInputRef.current?.click()
      }
    } else {
      galleryInputRef.current?.click()
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onFileSelect(file)
    }
  }

  return (
    <div className={className}>
      {/* Hidden file inputs for direct camera capture vs gallery pick */}
      <input
        type='file'
        ref={cameraInputRef}
        accept='image/*'
        capture='environment'
        onChange={handleInputChange}
        className='hidden'
      />
      <input
        type='file'
        ref={galleryInputRef}
        accept='image/*'
        onChange={handleInputChange}
        className='hidden'
      />

      <Button
        type='button'
        variant='outline'
        size='sm'
        disabled={disabled}
        onClick={handleClick}
        className='text-xs font-semibold gap-2 shadow-sm hover:border-primary'
      >
        {isMobile ? <Camera className='h-4 w-4 text-primary' /> : <Upload className='h-4 w-4' />}
        <span>{label}</span>
      </Button>
    </div>
  )
}
