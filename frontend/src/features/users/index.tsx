import { useState, useEffect } from 'react'
import { Plus, Edit, CalendarDays, Trash2, Search as SearchIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TablePagination } from '@/components/ui/table-pagination'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import {
  useUsers,
  useUserWorkingHours,
  useCreateUserWorkingHours,
  useDeleteUserWorkingHours,
  useUserTimeOff,
  useCreateUserTimeOff,
  useDeleteUserTimeOff,
} from '@/api/hooks/use-users'
import { UserForm } from './user-form'
import { type User, type WorkingHours, type TimeOff } from '@/types/api'
import { toast } from 'sonner'

const WEEKDAYS = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba']

// ─── Schedule Dialog ─────────────────────────────────────────────────────────
function ScheduleDialog({ user, open, onClose }: { user: User; open: boolean; onClose: () => void }) {
  const [weekday, setWeekday] = useState(0)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('18:00')
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')
  const [reason, setReason] = useState('')

  const { data: workingHours = [] } = useUserWorkingHours(user.id)
  const { data: timeOffs = [] } = useUserTimeOff(user.id)
  const createWH = useCreateUserWorkingHours(user.id)
  const deleteWH = useDeleteUserWorkingHours(user.id)
  const createTO = useCreateUserTimeOff(user.id)
  const deleteTO = useDeleteUserTimeOff(user.id)

  const handleAddWH = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!startTime || !endTime) { toast.error('Vaqtni kiriting'); return }
    try {
      await createWH.mutateAsync({ weekday, startTime, endTime })
      toast.success('Ish soati qo\'shildi!')
    } catch {
      toast.error('Xatolik yuz berdi.')
    }
  }

  const handleAddTO = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!dateStart || !dateEnd) { toast.error('Sanani kiriting'); return }
    try {
      await createTO.mutateAsync({ dateStart, dateEnd, reason })
      toast.success('Ta\'til qo\'shildi!')
      setDateStart(''); setDateEnd(''); setReason('')
    } catch {
      toast.error('Xatolik yuz berdi.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-[550px]'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <CalendarDays className='h-5 w-5 text-primary' />
            {user.firstName} {user.lastName} — Smena Jadvali
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue='working-hours'>
          <TabsList className='w-full'>
            <TabsTrigger value='working-hours' className='flex-1'>Ish Soatlari</TabsTrigger>
            <TabsTrigger value='time-off' className='flex-1'>Ta'til / Dam olish</TabsTrigger>
          </TabsList>

          {/* ── Working Hours ─────────────────────────────────── */}
          <TabsContent value='working-hours' className='mt-3 space-y-3'>
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-2'>
              {workingHours.length === 0 ? (
                <p className='text-xs text-muted-foreground col-span-2 italic'>Ish soatlari hali kiritilmagan.</p>
              ) : (
                workingHours.map((wh: WorkingHours) => (
                  <div key={wh.id} className='flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2 text-xs font-mono'>
                    <span className='font-semibold'>{WEEKDAYS[wh.weekday] ?? 'Kun'}</span>
                    <div className='flex items-center gap-2'>
                      <span className='text-muted-foreground'>{wh.startTime} – {wh.endTime}</span>
                      {wh.id && (
                        <Button
                          size='icon' variant='ghost'
                          className='h-6 w-6 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10'
                          onClick={() => deleteWH.mutate(wh.id)}
                        >
                          <Trash2 className='h-3.5 w-3.5' />
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleAddWH} className='grid grid-cols-4 gap-2 pt-2 items-end border-t'>
              <div className='space-y-1 col-span-1'>
                <label className='text-[10px] font-medium'>Kun</label>
                <Select value={String(weekday)} onValueChange={v => setWeekday(Number(v))}>
                  <SelectTrigger className='text-xs h-8'><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WEEKDAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className='space-y-1'>
                <label className='text-[10px] font-medium'>Boshlanish</label>
                <Input type='time' className='h-8 text-xs' value={startTime} onChange={e => setStartTime(e.target.value)} />
              </div>
              <div className='space-y-1'>
                <label className='text-[10px] font-medium'>Tugash</label>
                <Input type='time' className='h-8 text-xs' value={endTime} onChange={e => setEndTime(e.target.value)} />
              </div>
              <Button type='submit' size='sm' className='h-8' disabled={createWH.isPending}>
                <Plus className='h-3.5 w-3.5 mr-1' /> Qo'sh
              </Button>
            </form>
          </TabsContent>

          {/* ── Time Off ──────────────────────────────────────── */}
          <TabsContent value='time-off' className='mt-3 space-y-3'>
            <div className='space-y-2'>
              {timeOffs.length === 0 ? (
                <p className='text-xs text-muted-foreground italic'>Ta'tillar hali kiritilmagan.</p>
              ) : (
                timeOffs.map((to: TimeOff) => (
                  <div key={to.id} className='flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2 text-xs'>
                    <div>
                      <span className='font-semibold'>{to.dateStart} → {to.dateEnd}</span>
                      {to.reason && <p className='text-muted-foreground mt-0.5'>{to.reason}</p>}
                    </div>
                    {to.id && (
                      <Button
                        size='icon' variant='ghost'
                        className='h-6 w-6 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10'
                        onClick={() => deleteTO.mutate(to.id)}
                      >
                        <Trash2 className='h-3.5 w-3.5' />
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleAddTO} className='grid grid-cols-2 gap-2 pt-2 border-t'>
              <div className='space-y-1'>
                <label className='text-[10px] font-medium'>Boshlanish sanasi</label>
                <Input type='date' className='h-8 text-xs' value={dateStart} onChange={e => setDateStart(e.target.value)} />
              </div>
              <div className='space-y-1'>
                <label className='text-[10px] font-medium'>Tugash sanasi</label>
                <Input type='date' className='h-8 text-xs' value={dateEnd} onChange={e => setDateEnd(e.target.value)} />
              </div>
              <div className='space-y-1 col-span-2'>
                <label className='text-[10px] font-medium'>Sabab (ixtiyoriy)</label>
                <Input className='h-8 text-xs' value={reason} onChange={e => setReason(e.target.value)} placeholder='Kasallik, bayram...' />
              </div>
              <Button type='submit' size='sm' className='col-span-2 h-8' disabled={createTO.isPending}>
                <Plus className='h-3.5 w-3.5 mr-1' /> Ta'til qo'shish
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Feature ────────────────────────────────────────────────────────────
export function UsersFeature() {
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  useEffect(() => {
    setPage(1)
  }, [searchTerm, roleFilter])

  const { data, isLoading } = useUsers({
    search: searchTerm || undefined,
    role: roleFilter && roleFilter !== 'all' ? roleFilter : undefined,
    page,
    page_size: pageSize,
  })

  const users = data?.results || []
  const totalCount = data?.count ?? users.length

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | undefined>()
  const [scheduleUser, setScheduleUser] = useState<User | undefined>()

  const openAddDialog = () => { setEditingUser(undefined); setIsDialogOpen(true) }
  const openEditDialog = (user: User) => { setEditingUser(user); setIsDialogOpen(true) }
  const handleCloseDialog = () => { setIsDialogOpen(false); setEditingUser(undefined) }

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'bosh_shifokor': return <Badge variant='default'>Bosh Shifokor</Badge>
      case 'doctor': return <Badge variant='secondary'>Shifokor</Badge>
      case 'administrator': return <Badge variant='outline'>Administrator</Badge>
      default: return <Badge>{role}</Badge>
    }
  }

  return (
    <>
      <Header>
        <div className='flex items-center gap-2 me-auto font-bold text-lg tracking-tight'>
          <span>👥 Xodimlar Boshqaruvi</span>
        </div>
        <div className='ml-auto flex items-center space-x-4'>
          <ProfileDropdown />
        </div>
      </Header>
      <Main>
        <div className='mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>Xodimlar</h1>
            <p className='text-xs text-muted-foreground'>
              Tizimga kirish huquqiga ega barcha xodimlarni boshqarish ({totalCount} ta xodim)
            </p>
          </div>
          <Button onClick={openAddDialog} className='shadow h-9 text-xs'>
            <Plus className='mr-2 h-4 w-4' /> Yangi xodim
          </Button>
        </div>

        {/* Search & Filter Toolbar */}
        <div className='mb-4 flex flex-col sm:flex-row items-center gap-3'>
          <div className='relative flex-1 w-full'>
            <SearchIcon className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
            <Input
              placeholder="Ism, familiya yoki telefon bo'yicha qidiruv..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className='ps-9 text-xs h-9'
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className='w-full sm:w-44 text-xs h-9'>
              <SelectValue placeholder='Rol (Barchasi)' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>Barcha Rollar</SelectItem>
              <SelectItem value='bosh_shifokor'>Bosh Shifokor</SelectItem>
              <SelectItem value='doctor'>Shifokor</SelectItem>
              <SelectItem value='administrator'>Administrator</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className='rounded-xl border bg-card text-card-foreground shadow-sm overflow-x-auto w-full'>
          <Table className='min-w-[600px] sm:min-w-full'>
            <TableHeader>
              <TableRow className='bg-muted/30'>
                <TableHead className='text-xs font-semibold'>Ism, Familiya</TableHead>
                <TableHead className='text-xs font-semibold'>Telefon raqam</TableHead>
                <TableHead className='text-xs font-semibold'>Rol</TableHead>
                <TableHead className='text-xs font-semibold text-right'>Amallar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className='text-center py-8 text-xs text-muted-foreground animate-pulse'>
                    Xodimlar yuklanmoqda...
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className='text-center py-8 text-xs text-muted-foreground'>
                    Xodimlar topilmadi.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user: User) => (
                  <TableRow key={user.id} className='hover:bg-muted/20'>
                    <TableCell className='font-medium text-xs'>
                      <div className='flex items-center gap-2'>
                        <div className='flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs shrink-0'>
                          {user.firstName?.[0] || 'X'}
                        </div>
                        <span className='font-semibold'>{user.firstName} {user.lastName}</span>
                      </div>
                    </TableCell>
                    <TableCell className='text-xs font-mono'>{user.phoneNumber}</TableCell>
                    <TableCell className='text-xs'>{getRoleBadge(user.role)}</TableCell>
                    <TableCell className='text-right'>
                      <div className='flex items-center justify-end gap-1'>
                        <Button
                          variant='ghost' size='icon'
                          title='Smena jadvali'
                          className='h-8 w-8'
                          onClick={() => setScheduleUser(user)}
                        >
                          <CalendarDays className='h-4 w-4' />
                        </Button>
                        <Button
                          variant='ghost' size='icon'
                          title='Tahrirlash'
                          className='h-8 w-8'
                          onClick={() => openEditDialog(user)}
                        >
                          <Edit className='h-4 w-4' />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <TablePagination
          totalCount={totalCount}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize)
            setPage(1)
          }}
        />

        {/* Edit/Create User Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className='sm:max-w-[425px]'>
            <DialogHeader>
              <DialogTitle>
                {editingUser ? 'Xodimni tahrirlash' : 'Yangi xodim qo\'shish'}
              </DialogTitle>
            </DialogHeader>
            <UserForm
              user={editingUser}
              onSuccess={handleCloseDialog}
              onCancel={handleCloseDialog}
            />
          </DialogContent>
        </Dialog>

        {/* Schedule Dialog */}
        {scheduleUser && (
          <ScheduleDialog
            user={scheduleUser}
            open={!!scheduleUser}
            onClose={() => setScheduleUser(undefined)}
          />
        )}
      </Main>
    </>
  )
}
