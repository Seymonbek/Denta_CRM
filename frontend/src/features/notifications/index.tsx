import { useState, useEffect } from 'react'
import { Send, CheckCircle2, AlertCircle, Bell, Search } from 'lucide-react'
import { format } from 'date-fns'
import { useNotifications } from '@/api/hooks/use-notifications'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TablePagination } from '@/components/ui/table-pagination'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export function NotificationsList() {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  useEffect(() => {
    setPage(1)
  }, [searchTerm, statusFilter])

  const { data: notificationsData, isLoading } = useNotifications({
    search: searchTerm || undefined,
    status: statusFilter && statusFilter !== 'all' ? statusFilter : undefined,
    page,
    page_size: pageSize,
  })

  const notifications = Array.isArray(notificationsData?.results)
    ? notificationsData.results
    : Array.isArray(notificationsData)
    ? notificationsData
    : []

  const totalCount = notificationsData?.count ?? notifications.length

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
        <div className='mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight flex items-center gap-2'>
              <Bell className='h-6 w-6 text-primary' /> Tizim Bildirishnomalari Logi
            </h1>
            <p className='text-xs text-muted-foreground mt-1'>
              Telegram bot orqali yuborilgan eslatmalar, retseptlar va xabarlar ({totalCount} ta bildirishnoma).
            </p>
          </div>

          <div className='flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto'>
            <div className='relative w-full sm:w-72'>
              <Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
              <Input
                placeholder="Xabar matni yoki bemor ismi..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className='ps-9 text-xs h-9'
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className='w-full sm:w-40 text-xs h-9'>
                <SelectValue placeholder='Holati (Barchasi)' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>Barcha Holatlar</SelectItem>
                <SelectItem value='sent'>Yuborilgan</SelectItem>
                <SelectItem value='failed'>Xatolik</SelectItem>
                <SelectItem value='pending'>Kutilmoqda</SelectItem>
              </SelectContent>
            </Select>
          </div>
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

        <TablePagination
          page={page}
          pageSize={pageSize}
          totalItems={totalCount}
          onPageChange={setPage}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize)
            setPage(1)
          }}
        />
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
