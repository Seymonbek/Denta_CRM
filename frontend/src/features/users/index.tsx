import { useState } from 'react'
import { Plus, Edit, CalendarDays, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { User } from '@/types/api'
import { Search } from '@/components/search'
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
              {(workingHours as any[]).length === 0 ? (
                <p className='text-xs text-muted-foreground col-span-2 italic'>Ish soatlari hali kiritilmagan.</p>
              ) : (
                (workingHours as any[]).map((wh: any) => (
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
              {(timeOffs as any[]).length === 0 ? (
                <p className='text-xs text-muted-foreground italic'>Ta'tillar hali kiritilmagan.</p>
              ) : (
                (timeOffs as any[]).map((to: any) => (
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
  const { data: users, isLoading } = useUsers()
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
        <Search />
        <div className='ml-auto flex items-center space-x-4'>
          <ProfileDropdown />
        </div>
      </Header>
      <Main>
        <div className='mb-4 flex items-center justify-between'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>Xodimlar</h1>
            <p className='text-muted-foreground'>
              Tizimga kirish huquqiga ega barcha xodimlarni boshqarish
            </p>
          </div>
          <Button onClick={openAddDialog}>
            <Plus className='mr-2 h-4 w-4' /> Yangi xodim
          </Button>
        </div>

        <div className='rounded-md border bg-card text-card-foreground'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ism, Familiya</TableHead>
                <TableHead>Telefon raqam</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead className='text-right'>Amallar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className='text-center py-4'>Yuklanmoqda...</TableCell>
                </TableRow>
              ) : users?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className='text-center py-4'>Xodimlar topilmadi</TableCell>
                </TableRow>
              ) : (
                users?.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className='font-medium'>{user.firstName} {user.lastName}</TableCell>
                    <TableCell>{user.phoneNumber}</TableCell>
                    <TableCell>{getRoleBadge(user.role)}</TableCell>
                    <TableCell className='text-right'>
                      <div className='flex items-center justify-end gap-1'>
                        <Button
                          variant='ghost' size='icon'
                          title='Smena jadvali'
                          onClick={() => setScheduleUser(user)}
                        >
                          <CalendarDays className='h-4 w-4' />
                        </Button>
                        <Button
                          variant='ghost' size='icon'
                          title='Tahrirlash'
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
