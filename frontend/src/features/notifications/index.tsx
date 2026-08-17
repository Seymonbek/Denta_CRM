import { Send, CheckCircle2, AlertCircle, Bell } from 'lucide-react'
import { format } from 'date-fns'
import { useNotifications } from '@/api/hooks/use-notifications'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export function NotificationsList() {
  const { data: notificationsData, isLoading } = useNotifications()
  const notifications = Array.isArray(notificationsData?.results)
    ? notificationsData.results
    : Array.isArray(notificationsData)
    ? notificationsData
    : []

  return (
    <>
      <Header>
        <div className='flex items-center gap-2 me-auto font-bold text-lg tracking-tight'>
          <Bell className='h-5 w-5 text-primary' />
          <span>Bildirishnomalar Logi</span>
        </div>
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main>
        <div className='mb-6'>
          <h1 className='text-2xl font-bold tracking-tight flex items-center gap-2'>
            <Bell className='h-6 w-6 text-primary' /> Tizim Bildirishnomalari Logi
          </h1>
          <p className='text-xs text-muted-foreground mt-1'>
            Telegram bot orqali yuborilgan eslatmalar, retseptlar va low-stock xabarlari.
          </p>
        </div>

        {/* Notifications Table with Mobile Responsive Horizontal Scroll */}
        <div className='rounded-xl border bg-card shadow-sm overflow-x-auto w-full'>
          <Table className='min-w-[600px] sm:min-w-full'>
            <TableHeader>
              <TableRow className='bg-muted/30'>
                <TableHead className='text-xs font-semibold'>Xabar Mazmuni</TableHead>
                <TableHead className='text-xs font-semibold'>Turi</TableHead>
                <TableHead className='text-xs font-semibold'>Kanal</TableHead>
                <TableHead className='text-xs font-semibold'>Yuborilgan Vaqt</TableHead>
                <TableHead className='text-xs font-semibold text-end'>Holati</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className='text-center py-8 text-xs text-muted-foreground animate-pulse'>
                    Bildirishnomalar yuklanmoqda...
                  </TableCell>
                </TableRow>
              ) : notifications.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className='text-center py-8 text-xs text-muted-foreground'>
                    Hozircha hech qanday bildirishnoma mavjud emas.
                  </TableCell>
                </TableRow>
              ) : (
                notifications.map((n: any) => {
                  const sentAt = String(n?.sentAt || n?.sent_at || '')
                  const nType = String(n?.type || 'notification')
                  const nStatus = String(n?.status || 'sent')
                  const channel = String(n?.channel || 'telegram')

                  return (
                    <TableRow key={String(n?.id)} className='hover:bg-muted/20'>
                      <TableCell className='text-xs font-medium max-w-md truncate'>
                        {String(n?.message || '—')}
                      </TableCell>
                      <TableCell className='text-xs'>
                        <Badge variant='outline' className='text-[10px] uppercase'>
                          {nType}
                        </Badge>
                      </TableCell>
                      <TableCell className='text-xs font-mono'>
                        <span className='flex items-center gap-1 text-sky-600 dark:text-sky-400'>
                          <Send className='h-3 w-3' /> {channel}
                        </span>
                      </TableCell>
                      <TableCell className='text-xs font-mono text-muted-foreground'>
                        {formatDateSafely(sentAt)}
                      </TableCell>
                      <TableCell className='text-end'>
                        {nStatus === 'sent' ? (
                          <Badge variant='default' className='text-[10px] bg-emerald-600'>
                            <CheckCircle2 className='me-1 h-3 w-3' /> Yuborilgan
                          </Badge>
                        ) : nStatus === 'failed' ? (
                          <Badge variant='destructive' className='text-[10px]'>
                            <AlertCircle className='me-1 h-3 w-3' /> Xatolik
                          </Badge>
                        ) : (
                          <Badge variant='secondary' className='text-[10px]'>
                            Kutilmoqda
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Main>
    </>
  )
}

function formatDateSafely(dateStr: string) {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return String(dateStr)
    return format(d, 'dd.MM.yyyy HH:mm')
  } catch {
    return String(dateStr)
  }
}
