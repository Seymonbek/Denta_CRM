import { useState } from 'react'
import { Clock, CalendarX, Plus, Stethoscope, Search } from 'lucide-react'
import {
  useDoctors,
  useWorkingHours,
  useTimeOff,
  useCreateWorkingHours,
  useCreateTimeOff,
} from '@/api/hooks/use-doctors'
import { DoctorProfile } from '@/types/api'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'

const WEEKDAYS = [
  'Dushanba',
  'Seshanba',
  'Chorshanba',
  'Payshanba',
  'Juma',
  'Shanba',
  'Yakshanba',
]

export function DoctorsList() {
  const [searchTerm, setSearchTerm] = useState('')
  const { data: doctorsData = [], isLoading } = useDoctors()
  const doctorsList = Array.isArray(doctorsData?.results)
    ? doctorsData.results
    : Array.isArray(doctorsData)
    ? doctorsData
    : []

  const filteredDoctors = doctorsList.filter((doc: any) => {
    const name = (doc?.user?.firstName || doc?.user?.first_name || '') + ' ' + (doc?.user?.lastName || doc?.user?.last_name || '') + ' ' + (doc?.specialization || '')
    return name.toLowerCase().includes(searchTerm.toLowerCase())
  })

  const [selectedDoctor, setSelectedDoctor] = useState<DoctorProfile | null>(null)

  // Working Hours Form State
  const [weekday, setWeekday] = useState<number>(0)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('18:00')

  // Time Off Form State
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')
  const [reason, setReason] = useState('')

  const { data: workingHoursData = [] } = useWorkingHours(selectedDoctor?.id || '')
  const workingHours = Array.isArray(workingHoursData) ? workingHoursData : []

  const { data: timeOffsData = [] } = useTimeOff(selectedDoctor?.id || '')
  const timeOffs = Array.isArray(timeOffsData) ? timeOffsData : []

  const createWorkingHoursMutation = useCreateWorkingHours(selectedDoctor?.id || '')
  const createTimeOffMutation = useCreateTimeOff(selectedDoctor?.id || '')

  const handleAddWorkingHours = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedDoctor) return
    try {
      await createWorkingHoursMutation.mutateAsync({
        weekday,
        startTime,
        endTime,
      })
      toast.success('Ish soati qo’shildi!')
    } catch {
      toast.error('Ish soati qo’shishda xatolik.')
    }
  }

  const handleAddTimeOff = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedDoctor || !dateStart || !dateEnd) return
    try {
      await createTimeOffMutation.mutateAsync({
        dateStart,
        dateEnd,
        reason,
      })
      toast.success('Ta’til/Dam olish kuni kiritildi!')
      setDateStart('')
      setDateEnd('')
      setReason('')
    } catch {
      toast.error('Ta’til kiritishda xatolik.')
    }
  }

  return (
    <>
      <Header>
        <div className='flex items-center gap-2 me-auto font-bold text-lg tracking-tight'>
          <Stethoscope className='h-5 w-5 text-primary' />
          <span>Shifokorlar Ro'yxati</span>
        </div>
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main>
        <div className='mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight flex items-center gap-2'>
              <Stethoscope className='h-6 w-6 text-primary' /> Klinika Shifokorlari
            </h1>
            <p className='text-xs text-muted-foreground mt-1'>
              Shifokorlar profili, mutaxassislik, komissiya stavkalari va ish jadvallari.
            </p>
          </div>
        </div>

        {/* Search Toolbar */}
        <div className='mb-4 relative w-full sm:w-80'>
          <Search className='absolute left-3 top-2.5 h-4 w-4 text-muted-foreground' />
          <Input
            placeholder="Shifokor ismi yoki mutaxassislik..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className='ps-9 text-xs h-9'
          />
        </div>

        {/* Doctors Table with Mobile Responsive Horizontal Scroll */}
        <div className='rounded-xl border bg-card shadow-sm overflow-x-auto w-full'>
          <Table className='min-w-[650px] sm:min-w-full'>
            <TableHeader>
              <TableRow className='bg-muted/30'>
                <TableHead className='text-xs font-semibold'>Shifokor Ismi</TableHead>
                <TableHead className='text-xs font-semibold'>Mutaxassislik</TableHead>
                <TableHead className='text-xs font-semibold'>Bo'limlar</TableHead>
                <TableHead className='text-xs font-semibold'>Komissiya Asosi</TableHead>
                <TableHead className='text-xs font-semibold'>Komissiya %</TableHead>
                <TableHead className='text-xs font-semibold text-end'>Ish Jadvali</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className='text-center py-8 text-xs text-muted-foreground animate-pulse'>
                    Shifokorlar yuklanmoqda...
                  </TableCell>
                </TableRow>
              ) : filteredDoctors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className='text-center py-8 text-xs text-muted-foreground'>
                    Hech qanday shifokor topilmadi.
                  </TableCell>
                </TableRow>
              ) : (
                filteredDoctors.map((doc: any) => {
                  const firstName = doc?.user?.firstName || doc?.user?.first_name || 'Shifokor'
                  const lastName = doc?.user?.lastName || doc?.user?.last_name || ''
                  const phoneNumber = doc?.user?.phoneNumber || doc?.user?.phone_number || ''
                  const specialization = doc?.specialization || 'Stomatolog'
                  const departments = Array.isArray(doc?.departments) ? doc.departments : []
                  const commissionBasis = doc?.commissionBasis || doc?.commission_basis || 'from_total'
                  const commissionRate = doc?.defaultCommissionRate ?? doc?.default_commission_rate ?? 0

                  return (
                    <TableRow key={doc?.id || Math.random()} className='hover:bg-muted/20'>
                      <TableCell className='font-medium text-xs'>
                        <div className='flex items-center gap-2'>
                          <div className='flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs'>
                            {firstName[0] || 'D'}
                          </div>
                          <div>
                            <p className='font-semibold'>
                              Dr. {firstName} {lastName}
                            </p>
                            {phoneNumber && (
                              <p className='text-[10px] text-muted-foreground font-mono'>
                                {phoneNumber}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className='text-xs font-medium'>{specialization}</TableCell>
                      <TableCell className='text-xs'>
                        <div className='flex flex-wrap gap-1'>
                          {departments.map((dep: any) => (
                            <Badge key={dep.id} variant='outline' className='text-[10px]'>
                              {dep.name}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className='text-xs'>
                        <Badge variant='secondary' className='text-[10px]'>
                          {commissionBasis === 'from_total' ? 'Umumiy summa (Total)' : 'Sofi foyda (Net)'}
                        </Badge>
                      </TableCell>
                      <TableCell className='text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400'>
                        {commissionRate}%
                      </TableCell>
                      <TableCell className='text-end'>
                        <Button
                          size='sm'
                          variant='outline'
                          className='h-8 text-xs'
                          onClick={() => setSelectedDoctor(doc)}
                        >
                          <Clock className='me-1.5 h-3.5 w-3.5' /> Jadvalni Boshqarish
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Schedule & TimeOff Management Modal */}
        <Dialog open={selectedDoctor !== null} onOpenChange={(open) => !open && setSelectedDoctor(null)}>
          <DialogContent className='sm:max-w-xl max-h-[85vh] overflow-y-auto'>
            <DialogHeader>
              <DialogTitle>
                Dr. {selectedDoctor?.user?.firstName || selectedDoctor?.user?.first_name || ''} {selectedDoctor?.user?.lastName || selectedDoctor?.user?.last_name || ''} - Ish Jadvali va Ta'tillar
              </DialogTitle>
            </DialogHeader>

            <div className='space-y-6 py-2'>
              {/* Working Hours Section */}
              <div className='space-y-3 border-b pb-4'>
                <h4 className='text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5'>
                  <Clock className='h-3.5 w-3.5 text-primary' /> Haftalik Doimiy Ish Soatlari
                </h4>

                {/* Existing working hours */}
                <div className='grid grid-cols-1 sm:grid-cols-2 gap-2'>
                  {workingHours.length === 0 ? (
                    <p className='text-xs text-muted-foreground col-span-2 italic'>
                      Ish soatlari hali kiritilmagan.
                    </p>
                  ) : (
                    workingHours.map((wh: any) => (
                      <div
                        key={wh.id || Math.random()}
                        className='flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2 text-xs font-mono'
                      >
                        <span className='font-semibold text-foreground'>{WEEKDAYS[wh.weekday] || 'Kun'}</span>
                        <span className='text-muted-foreground'>
                          {wh.startTime || wh.start_time} - {wh.endTime || wh.end_time}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                {/* Add working hours form */}
                <form onSubmit={handleAddWorkingHours} className='grid grid-cols-4 gap-2 pt-2 items-end'>
                  <div className='space-y-1 col-span-1'>
                    <label className='text-[10px] font-medium'>Kuni</label>
                    <Select value={String(weekday)} onValueChange={(val) => setWeekday(Number(val))}>
                      <SelectTrigger className='text-xs h-8'>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WEEKDAYS.map((day, idx) => (
                          <SelectItem key={idx} value={String(idx)}>
                            {day}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className='space-y-1 col-span-1'>
                    <label className='text-[10px] font-medium'>Boshlanish</label>
                    <Input
                      type='time'
                      className='h-8 text-xs font-mono'
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                    />
                  </div>
                  <div className='space-y-1 col-span-1'>
                    <label className='text-[10px] font-medium'>Tugash</label>
                    <Input
                      type='time'
                      className='h-8 text-xs font-mono'
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                    />
                  </div>
                  <Button type='submit' size='sm' className='h-8 text-xs col-span-1'>
                    <Plus className='h-3.5 w-3.5 me-1' /> Qo'shish
                  </Button>
                </form>
              </div>

              {/* Time Off Section */}
              <div className='space-y-3'>
                <h4 className='text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5'>
                  <CalendarX className='h-3.5 w-3.5 text-rose-500' /> Ta'til va Dam Olish Kunlari
                </h4>

                <div className='space-y-2'>
                  {timeOffs.length === 0 ? (
                    <p className='text-xs text-muted-foreground italic'>Ta'tillar ro'yxati bo'sh.</p>
                  ) : (
                    timeOffs.map((to: any) => (
                      <div
                        key={to.id || Math.random()}
                        className='flex items-center justify-between rounded-lg border bg-rose-500/10 border-rose-500/20 px-3 py-2 text-xs font-mono'
                      >
                        <div>
                          <span className='font-bold text-rose-700 dark:text-rose-400'>
                            {to.dateStart || to.date_start} — {to.dateEnd || to.date_end}
                          </span>
                          {to.reason && <p className='text-[11px] text-muted-foreground font-sans'>{to.reason}</p>}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <form onSubmit={handleAddTimeOff} className='space-y-2 pt-2 border-t'>
                  <div className='grid grid-cols-2 gap-2'>
                    <div className='space-y-1'>
                      <label className='text-[10px] font-medium'>Boshlanish sanasi</label>
                      <Input
                        type='date'
                        className='h-8 text-xs font-mono'
                        value={dateStart}
                        onChange={(e) => setDateStart(e.target.value)}
                        required
                      />
                    </div>
                    <div className='space-y-1'>
                      <label className='text-[10px] font-medium'>Tugash sanasi</label>
                      <Input
                        type='date'
                        className='h-8 text-xs font-mono'
                        value={dateEnd}
                        onChange={(e) => setDateEnd(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className='flex gap-2 items-center'>
                    <Input
                      placeholder='Sababi (Masalan: Yillik ta’til)...'
                      className='h-8 text-xs flex-1'
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                    <Button type='submit' size='sm' className='h-8 text-xs'>
                      Kiritish
                    </Button>
                  </div>
                </form>
              </div>
            </div>

            <DialogFooter>
              <Button variant='outline' onClick={() => setSelectedDoctor(null)}>
                Yopish
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Main>
    </>
  )
}
