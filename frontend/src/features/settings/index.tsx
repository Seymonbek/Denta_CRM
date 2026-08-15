import { useState, useEffect } from 'react'
import { ShieldCheck, Save } from 'lucide-react'
import {
  useMe,
  useUpdateMe,
  useEnable2FA,
  useDisable2FA,
} from '@/api/hooks/use-auth'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { ClinicSettingsCard } from './clinic-settings-card'

export function SettingsPage() {
  const { data: user } = useMe()
  const updateMeMutation = useUpdateMe()
  const enable2FAMutation = useEnable2FA()
  const disable2FAMutation = useDisable2FA()

  // Profile Form State
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [telegramChatId, setTelegramChatId] = useState('')

  // 2FA Modal State
  const [is2FAModalOpen, setIs2FAModalOpen] = useState(false)
  const [passwordFor2FA, setPasswordFor2FA] = useState('')
  const [target2FAState, setTarget2FAState] = useState<boolean>(false)

  useEffect(() => {
    if (user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFirstName(user.firstName || user.first_name || '')
      setLastName(user.lastName || user.last_name || '')
      const chatVal = user.telegramChatId ?? user.telegram_chat_id
      setTelegramChatId(chatVal ? String(chatVal) : '')
    }
  }, [user])

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await updateMeMutation.mutateAsync({
        firstName,
        lastName,
        telegramChatId: telegramChatId ? Number(telegramChatId) : null,
      })
      toast.success('Profil ma’lumotlari saqlandi!')
    } catch {
      toast.error('Saqlashda xatolik yuz berdi.')
    }
  }

  const handleToggle2FATrigger = (checked: boolean) => {
    setTarget2FAState(checked)
    setPasswordFor2FA('')
    setIs2FAModalOpen(true)
  }

  const handleConfirm2FAToggle = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!passwordFor2FA) {
      toast.error('Parolingizni kiriting.')
      return
    }

    try {
      if (target2FAState) {
        await enable2FAMutation.mutateAsync(passwordFor2FA)
        toast.success('Telegram 2FA muvaffaqiyatli yoqildi!')
      } else {
        await disable2FAMutation.mutateAsync(passwordFor2FA)
        toast.success('2FA o’chirildi.')
      }
      setIs2FAModalOpen(false)
    } catch (err: unknown) {
      toast.error(err?.response?.data?.detail || 'Parol noto’g’ri yoki xatolik yuz berdi.')
    }
  }

  const twoFactorEnabled = Boolean(user?.twoFactorEnabled ?? user?.two_factor_enabled)
  const phoneNumber = user?.phoneNumber || user?.phone_number || ''

  return (
    <>
      <Header>
        <div className='flex items-center gap-2 me-auto font-bold text-lg tracking-tight'>
          <span>⚙️ Sozlamalar va Profil</span>
        </div>
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main>
        <div className='mb-6'>
          <h1 className='text-2xl font-bold tracking-tight'>Shaxsiy Sozlamalar</h1>
          <p className='text-xs text-muted-foreground'>
            Profil ma'lumotlari, Telegram Chat ID va Ikki Bosqichli Autentifikatsiya (2FA).
          </p>
        </div>

        <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
          {/* Profile Form */}
          <Card className='shadow-sm'>
            <CardHeader>
              <CardTitle className='text-base font-bold'>Profil Ma'lumotlari</CardTitle>
              <CardDescription className='text-xs'>
                Ism, familiya va Telegram xabarnoma bog'lanmasi.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdateProfile} className='space-y-4'>
                <div className='grid grid-cols-2 gap-3'>
                  <div className='space-y-1'>
                    <label className='text-xs font-medium'>Ism</label>
                    <Input
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder='Ismingiz'
                    />
                  </div>
                  <div className='space-y-1'>
                    <label className='text-xs font-medium'>Familiya</label>
                    <Input
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder='Familiyangiz'
                    />
                  </div>
                </div>

                <div className='space-y-1'>
                  <label className='text-xs font-medium'>Telefon Raqami (Login)</label>
                  <Input value={phoneNumber} disabled className='bg-muted/50 font-mono' />
                </div>

                <div className='space-y-1'>
                  <label className='text-xs font-medium'>Telegram Chat ID (Xabarnomalar uchun)</label>
                  <Input
                    placeholder='Masalan: 123456789'
                    value={telegramChatId}
                    onChange={(e) => setTelegramChatId(e.target.value)}
                  />
                  <p className='text-[11px] text-muted-foreground'>
                    Telegram botimizga /start bosib Chat ID-ni oling.
                  </p>
                </div>

                <Button type='submit' size='sm' disabled={updateMeMutation.isPending}>
                  <Save className='me-1.5 h-4 w-4' /> Saqlash
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* 2FA Security Card */}
          <Card className='shadow-sm border-primary/20'>
            <CardHeader>
              <CardTitle className='text-base font-bold flex items-center gap-2'>
                <ShieldCheck className='h-5 w-5 text-primary' /> Ikki Bosqichli Himoya (2FA)
              </CardTitle>
              <CardDescription className='text-xs'>
                Tizimga har safar kirishda Telegram orqali 6 xonali tasdiqlash kodi talab qilinadi.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='flex items-center justify-between rounded-xl border bg-muted/20 p-4'>
                <div className='space-y-0.5'>
                  <span className='text-sm font-semibold'>Telegram 2FA Holati</span>
                  <p className='text-xs text-muted-foreground'>
                    {twoFactorEnabled ? "2FA yoqilgan — Hisobingiz maksimal himoyalangan." : "2FA o'chirilgan."}
                  </p>
                </div>
                <Switch
                  checked={twoFactorEnabled}
                  onCheckedChange={handleToggle2FATrigger}
                  disabled={!telegramChatId}
                />
              </div>
              {!telegramChatId && (
                <p className="text-xs font-semibold text-rose-500 mt-2">
                  2FA ni yoqish uchun avval Telegram botimizdan ro'yxatdan o'ting va Chat ID ni kiriting.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {user?.role === 'bosh_shifokor' && (
          <div className='mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6'>
            <ClinicSettingsCard />
          </div>
        )}

        {/* Password Re-enter Modal for 2FA */}
        <Dialog open={is2FAModalOpen} onOpenChange={setIs2FAModalOpen}>
          <DialogContent className='sm:max-w-md'>
            <DialogHeader>
              <DialogTitle>Parolni Tasdiqlang</DialogTitle>
              <CardDescription className='text-xs'>
                2FA sozlamasini o'zgartirish uchun amaldagi parolingizni kiriting.
              </CardDescription>
            </DialogHeader>

            <form onSubmit={handleConfirm2FAToggle} className='space-y-3 py-2'>
              <div className='space-y-1'>
                <label className='text-xs font-medium'>Parolingiz *</label>
                <Input
                  type='password'
                  placeholder='********'
                  value={passwordFor2FA}
                  onChange={(e) => setPasswordFor2FA(e.target.value)}
                  required
                />
              </div>

              <DialogFooter className='pt-2'>
                <Button type='button' variant='outline' onClick={() => setIs2FAModalOpen(false)}>
                  Bekor qilish
                </Button>
                <Button type='submit' disabled={enable2FAMutation.isPending || disable2FAMutation.isPending}>
                  Tasdiqlash
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </Main>
    </>
  )
}

export { SettingsPage as Settings }
