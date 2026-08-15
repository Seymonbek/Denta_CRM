import { useState, useEffect } from 'react'
import { Building, Save } from 'lucide-react'
import { useSettings, useUpdateSettings } from '@/api/hooks/use-settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { toast } from 'sonner'

export function ClinicSettingsCard() {
  const { data: settings, isLoading } = useSettings()
  const updateSettingsMutation = useUpdateSettings()

  const [name, setName] = useState('')
  const [inn, setInn] = useState('')
  const [address, setAddress] = useState('')

  useEffect(() => {
    if (settings) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(settings.name || '')
      setInn(settings.inn || '')
      setAddress(settings.address || '')
    }
  }, [settings])

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await updateSettingsMutation.mutateAsync({ name, inn, address })
      toast.success("Klinika ma'lumotlari saqlandi!")
    } catch {
      toast.error("Saqlashda xatolik yuz berdi.")
    }
  }

  return (
    <Card className='shadow-sm'>
      <CardHeader>
        <CardTitle className='text-base font-bold flex items-center gap-2'>
          <Building className='h-5 w-5 text-primary' /> Klinika Ma'lumotlari
        </CardTitle>
        <CardDescription className='text-xs'>
          PDF hujjatlar va kassa cheklarida chiqadigan rasmiy rekvizitlar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm">Yuklanmoqda...</p>
        ) : (
          <form onSubmit={handleUpdate} className='space-y-4'>
            <div className='space-y-1'>
              <label className='text-xs font-medium'>Klinika Nomi *</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder='Masalan: DentaMed MChJ'
                required
              />
            </div>

            <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
              <div className='space-y-1'>
                <label className='text-xs font-medium'>STIR (INN) *</label>
                <Input
                  value={inn}
                  onChange={(e) => setInn(e.target.value)}
                  placeholder='9 xonali raqam'
                  required
                />
              </div>
              <div className='space-y-1'>
                <label className='text-xs font-medium'>Manzil *</label>
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder='Toshkent sh, Yunusobod tumani'
                  required
                />
              </div>
            </div>

            <Button type='submit' size='sm' disabled={updateSettingsMutation.isPending}>
              <Save className='me-1.5 h-4 w-4' /> Saqlash
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
