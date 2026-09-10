import { useState, useEffect, useMemo } from 'react'
import {
  Clock,
  CalendarX,
  Plus,
  Stethoscope,
  Search,
  Trash2,
  Download,
  Star,
  Pencil,
  Percent,
  CalendarCheck,
  Building2,
  CheckCircle2,
} from 'lucide-react'
import {
  useDoctors,
  useWorkingHours,
  useTimeOff,
  useCreateWorkingHours,
  useDeleteWorkingHours,
  useCreateTimeOff,
  useDeleteTimeOff,
  useUpdateDoctor,
} from '@/api/hooks/use-doctors'
import { useDepartments } from '@/api/hooks/use-departments'
import { type DoctorProfile, type WorkingHours, type TimeOff } from '@/types/api'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TablePagination } from '@/components/ui/table-pagination'
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
import { useAuthStore } from '@/stores/auth-store'
import { getErrorMessage } from '@/lib/get-error-message'

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
  const authUser = useAuthStore((state) => state.user)
  const isDoctor = authUser?.role === 'doctor'
  const isHeadDoctor = authUser?.role === 'bosh_shifokor'

  const [searchTerm, setSearchTerm] = useState('')
  const { data: doctorsData = [], isLoading } = useDoctors()
  const { data: departmentsData = [] } = useDepartments()
  const departmentsList = Array.isArray(departmentsData) ? departmentsData : []

  const doctorsList: DoctorProfile[] = useMemo(() => {
    return Array.isArray(doctorsData) ? doctorsData : []
  }, [doctorsData])

  const filteredDoctors = doctorsList.filter((doc: DoctorProfile) => {
    const name =
      (doc.user?.firstName || '') +
      ' ' +
      (doc.user?.lastName || '') +
      ' ' +
      (doc.specialization || '')
    return name.toLowerCase().includes(searchTerm.toLowerCase())
  })

  // For doctor role, strictly restrict list to only their own doctor profile!
  const displayDoctors = isDoctor
    ? doctorsList.filter((doc: DoctorProfile) => doc.user?.id === authUser?.id)
    : filteredDoctors

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  useEffect(() => {
    setPage(1)
  }, [searchTerm])

  const paginatedDoctors = useMemo(() => {
    const start = (page - 1) * pageSize
    return displayDoctors.slice(start, start + pageSize)
  }, [displayDoctors, page, pageSize])

  // Modals state
  const [selectedDoctor, setSelectedDoctor] = useState<DoctorProfile | null>(null)
  const [editDoctor, setEditDoctor] = useState<DoctorProfile | null>(null)
  const [hasAutoOpened, setHasAutoOpened] = useState(false)

  // Edit Doctor form state
  const [editSpecialization, setEditSpecialization] = useState('')
  const [editCommissionBasis, setEditCommissionBasis] = useState<'from_total' | 'from_net'>('from_total')
  const [editCommissionRate, setEditCommissionRate] = useState('30')
  const [editCanViewOthers, setEditCanViewOthers] = useState(false)
  const [editBio, setEditBio] = useState('')
  const [editDepartmentIds, setEditDepartmentIds] = useState<string[]>([])

  useEffect(() => {
    if (isDoctor && !hasAutoOpened && doctorsList.length > 0) {
      const myDoc = doctorsList.find((d: DoctorProfile) => d.user?.id === authUser?.id)
      if (myDoc) {
        setSelectedDoctor(myDoc)
        setHasAutoOpened(true)
      }
    }
  }, [isDoctor, hasAutoOpened, doctorsList, authUser])

  // Working Hours Form State
  const [weekday, setWeekday] = useState<number>(0)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('18:00')

  // Time Off Form State
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')
  const [reason, setReason] = useState('')

  const { data: workingHoursData = [] } = useWorkingHours(selectedDoctor?.user?.id || '')
  const workingHours = Array.isArray(workingHoursData) ? workingHoursData : []

  const { data: timeOffsData = [] } = useTimeOff(selectedDoctor?.user?.id || '')
  const timeOffs = Array.isArray(timeOffsData) ? timeOffsData : []

  const createWorkingHoursMutation = useCreateWorkingHours(selectedDoctor?.user?.id || '')
  const deleteWorkingHoursMutation = useDeleteWorkingHours(selectedDoctor?.user?.id || '')
  const createTimeOffMutation = useCreateTimeOff(selectedDoctor?.user?.id || '')
  const deleteTimeOffMutation = useDeleteTimeOff(selectedDoctor?.user?.id || '')
  const updateDoctorMutation = useUpdateDoctor()

  // Calculate top KPI statistics
  const currentWeekday = (new Date().getDay() + 6) % 7 // 0=Mon, 6=Sun
  const totalDoctorsCount = doctorsList.length

  const onDutyTodayCount = useMemo(() => {
    return doctorsList.filter((doc) => {
      const hours = (doc as any).workingHours || []
      return hours.some((wh: any) => wh.weekday === currentWeekday)
    }).length
  }, [doctorsList, currentWeekday])

  const avgRating = useMemo(() => {
    const rated = doctorsList.filter((d: any) => d.averageRating && Number(d.averageRating) > 0)
    if (rated.length === 0) return '5.0'
    const sum = rated.reduce((acc: number, d: any) => acc + Number(d.averageRating), 0)
    return (sum / rated.length).toFixed(1)
  }, [doctorsList])

  const avgCommission = useMemo(() => {
    if (doctorsList.length === 0) return '30%'
    const sum = doctorsList.reduce(
      (acc, d) => acc + Number(d.defaultCommissionRate || 30),
      0
    )
    return `${Math.round(sum / doctorsList.length)}%`
  }, [doctorsList])

  // Open Edit Doctor modal
  const handleOpenEdit = (doc: DoctorProfile) => {
    setEditDoctor(doc)
    setEditSpecialization(doc.specialization || '')
    setEditCommissionBasis((doc.commissionBasis as any) || 'from_total')
    setEditCommissionRate(String(doc.defaultCommissionRate ?? 30))
    setEditCanViewOthers(Boolean(doc.canViewOtherDoctors))
    setEditBio(doc.bio || '')
    const deptIds = Array.isArray(doc.departments)
      ? doc.departments.map((d: any) => String(d.id))
      : []
    setEditDepartmentIds(deptIds)
  }

  const handleSaveEditDoctor = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editDoctor) return

    try {
      await updateDoctorMutation.mutateAsync({
        id: editDoctor.id,
        data: {
          specialization: editSpecialization,
          commission_basis: editCommissionBasis,
          default_commission_rate: editCommissionRate,
          can_view_other_doctors: editCanViewOthers,
          bio: editBio,
          department_ids: editDepartmentIds,
        },
      })
      toast.success("Shifokor ma'lumotlari muvaffaqiyatli yangilandi!")
      setEditDoctor(null)
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Shifokor profilini yangilashda xatolik."))
    }
  }

  const handleDeleteWorkingHours = async (whId: string) => {
    try {
      await deleteWorkingHoursMutation.mutateAsync(whId)
      toast.success("Ish soati o'chirildi!")
    } catch {
      toast.error("Ish soatini o'chirishda xatolik.")
    }
  }

  const handleDeleteTimeOff = async (toId: string) => {
    try {
      await deleteTimeOffMutation.mutateAsync(toId)
      toast.success("Ta'til yozuvi o'chirildi!")
    } catch {
      toast.error("Ta'til yozuvini o'chirishda xatolik.")
    }
  }

  const handleAddWorkingHours = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedDoctor) return
    if (!startTime || !endTime) {
      toast.error('Boshlanish va tugash vaqtini kiritishingiz shart.')
      return
    }
    try {
      await createWorkingHoursMutation.mutateAsync({
        weekday,
        startTime,
        endTime,
      })
      toast.success('Ish soati qo’shildi!')
      setStartTime('09:00')
      setEndTime('18:00')
    } catch (err: any) {
      const data = err?.response?.data
      const errorMsg =
        data?.start_time?.[0] ||
        data?.end_time?.[0] ||
        data?.weekday?.[0] ||
        data?.error?.message ||
        data?.detail ||
        (typeof data === 'string' ? data : null) ||
        'Ish soati qo’shishda xatolik.'
      toast.error(errorMsg)
    }
  }

  const handleAddTimeOff = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedDoctor) return
    const finalDateStart = dateStart
    const finalDateEnd = dateEnd || dateStart
    if (!finalDateStart) {
      toast.error('Boshlanish sanasini tanlang.')
      return
    }
    try {
      await createTimeOffMutation.mutateAsync({
        dateStart: finalDateStart,
        dateEnd: finalDateEnd,
        reason,
      })
      toast.success('Ta’til/Dam olish kuni kiritildi!')
      setDateStart('')
      setDateEnd('')
      setReason('')
    } catch (err: any) {
      const data = err?.response?.data
      const errorMsg =
        data?.date_start?.[0] ||
        data?.date_end?.[0] ||
        data?.reason?.[0] ||
        data?.error?.message ||
        data?.detail ||
        (typeof data === 'string' ? data : null) ||
        'Ta’til qo’shishda xatolik.'
      toast.error(errorMsg)
    }
  }

  const handleExportCSV = () => {
    if (doctorsList.length === 0) {
      toast.error('Eksport uchun shifokorlar mavjud emas.')
      return
    }

    const headers = [
      'Shifokor Ismi',
      'Telefon Raqami',
      'Mutaxassisligi',
      "Bo'limlar",
      'Komissiya Asosi',
      'Komissiya Stavkasi %',
      'O‘rtacha Reyting',
    ]

    const rows = doctorsList.map((doc) => {
      const name = `${doc.user?.firstName || ''} ${doc.user?.lastName || ''}`.trim()
      const phone = doc.user?.phoneNumber || ''
      const spec = doc.specialization || 'Stomatolog'
      const depts = Array.isArray(doc.departments)
        ? doc.departments.map((d: any) => d.name).join('; ')
        : ''
      const basis =
        doc.commissionBasis === 'from_total' ? 'Umumiy narxdan' : 'Sof daromaddan'
      const rate = `${doc.defaultCommissionRate ?? 30}%`
      const rating = (doc as any).averageRating || '5.0'

      return [
        `"${name}"`,
        `"${phone}"`,
        `"${spec}"`,
        `"${depts}"`,
        `"${basis}"`,
        `"${rate}"`,
        rating,
      ]
    })

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `Klinika_Shifokorlari_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast.success('Shifokorlar ro‘yxati CSV formatda yuklab olindi!')
  }

  return (
    <>
      <Header>
        <div className='flex items-center gap-2.5 me-auto font-bold text-lg tracking-tight'>
          <div className='p-2 rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-sm'>
            <Stethoscope className='h-5 w-5' />
          </div>
          <div>
            <div className='text-base font-bold'>
              {isDoctor ? 'Mening Ish Jadvalim' : 'Klinika Shifokorlari'}
            </div>
            <div className='text-xs font-normal text-muted-foreground'>
              {isDoctor
                ? 'Shaxsiy haftalik smenalar va ta’tillar boshqaruvi'
                : 'Shifokorlar profillari, komissiya stavkalari va ish soatlari'}
            </div>
          </div>
        </div>

        <div className='flex items-center gap-2'>
          {!isDoctor && (
            <Button
              variant='outline'
              size='sm'
              onClick={handleExportCSV}
              className='h-9 text-xs font-medium gap-1.5 shadow-sm'
            >
              <Download className='h-3.5 w-3.5 text-muted-foreground' /> Eksport (CSV)
            </Button>
          )}
          <ThemeSwitch />
          <ProfileDropdown />
        </div>
      </Header>

      <Main>
        {/* KPI Cards */}
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6'>
          <div className='p-4 rounded-xl border bg-card/60 backdrop-blur shadow-sm hover:shadow transition-shadow'>
            <div className='flex items-center justify-between'>
              <span className='text-xs font-medium text-muted-foreground'>Jami Shifokorlar</span>
              <div className='p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400'>
                <Stethoscope className='h-4 w-4' />
              </div>
            </div>
            <div className='mt-2 flex items-baseline gap-2'>
              <span className='text-2xl font-black tracking-tight'>{totalDoctorsCount}</span>
              <span className='text-xs text-muted-foreground'>nafar</span>
            </div>
            <p className='text-[11px] text-muted-foreground mt-1'>
              Klinikaning barcha mutaxassislari
            </p>
          </div>

          <div className='p-4 rounded-xl border bg-card/60 backdrop-blur shadow-sm hover:shadow transition-shadow'>
            <div className='flex items-center justify-between'>
              <span className='text-xs font-medium text-muted-foreground'>Bugun Ishda</span>
              <div className='p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'>
                <CalendarCheck className='h-4 w-4' />
              </div>
            </div>
            <div className='mt-2 flex items-baseline gap-2'>
              <span className='text-2xl font-black tracking-tight text-emerald-600 dark:text-emerald-400'>
                {onDutyTodayCount}
              </span>
              <span className='text-xs text-muted-foreground'>shifokor</span>
            </div>
            <p className='text-[11px] text-muted-foreground mt-1'>
              Bugungi {WEEKDAYS[currentWeekday]} kunida navbatchi
            </p>
          </div>

          <div className='p-4 rounded-xl border bg-card/60 backdrop-blur shadow-sm hover:shadow transition-shadow'>
            <div className='flex items-center justify-between'>
              <span className='text-xs font-medium text-muted-foreground'>O'rtacha Reyting</span>
              <div className='p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400'>
                <Star className='h-4 w-4 fill-amber-500 text-amber-500' />
              </div>
            </div>
            <div className='mt-2 flex items-baseline gap-2'>
              <span className='text-2xl font-black tracking-tight text-amber-600 dark:text-amber-400'>
                {avgRating}
              </span>
              <span className='text-xs text-muted-foreground'>/ 5.0</span>
            </div>
            <p className='text-[11px] text-muted-foreground mt-1'>
              Bemorlar fikrlari asosida hisoblangan
            </p>
          </div>

          <div className='p-4 rounded-xl border bg-card/60 backdrop-blur shadow-sm hover:shadow transition-shadow'>
            <div className='flex items-center justify-between'>
              <span className='text-xs font-medium text-muted-foreground'>O'rtacha Komissiya</span>
              <div className='p-2 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400'>
                <Percent className='h-4 w-4' />
              </div>
            </div>
            <div className='mt-2 flex items-baseline gap-2'>
              <span className='text-2xl font-black tracking-tight text-violet-600 dark:text-violet-400 font-mono'>
                {avgCommission}
              </span>
              <span className='text-xs text-muted-foreground'>stavka</span>
            </div>
            <p className='text-[11px] text-muted-foreground mt-1'>
              Standart xizmat ko'rsatish ulushi
            </p>
          </div>
        </div>

        {/* Search Toolbar (only for bosh_shifokor) */}
        {!isDoctor && (
          <div className='mb-4 relative w-full sm:w-80'>
            <Search className='absolute left-3 top-2.5 h-4 w-4 text-muted-foreground' />
            <Input
              placeholder="Shifokor ismi yoki mutaxassislik..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className='ps-9 text-xs h-9'
            />
          </div>
        )}

        {/* Doctors Table */}
        <div className='rounded-xl border bg-card shadow-sm overflow-x-auto w-full'>
          <Table className='min-w-[800px] sm:min-w-full'>
            <TableHeader>
              <TableRow className='bg-muted/40'>
                <TableHead className='text-xs font-semibold'>Shifokor Ismi</TableHead>
                <TableHead className='text-xs font-semibold'>Baho (Reyting)</TableHead>
                <TableHead className='text-xs font-semibold'>Mutaxassislik</TableHead>
                <TableHead className='text-xs font-semibold'>Bo'limlar</TableHead>
                {!isDoctor && <TableHead className='text-xs font-semibold'>Komissiya Asosi</TableHead>}
                {!isDoctor && <TableHead className='text-xs font-semibold'>Komissiya %</TableHead>}
                <TableHead className='text-xs font-semibold'>Bugungi Holat</TableHead>
                <TableHead className='text-xs font-semibold text-end'>Amallar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={isDoctor ? 6 : 8}
                    className='text-center py-8 text-xs text-muted-foreground animate-pulse'
                  >
                    Ma'lumotlar yuklanmoqda...
                  </TableCell>
                </TableRow>
              ) : displayDoctors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isDoctor ? 6 : 8} className='text-center py-8 text-xs text-muted-foreground'>
                    Ma'lumot topilmadi.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedDoctors.map((doc: DoctorProfile) => {
                  const firstName = doc.user?.firstName || 'Shifokor'
                  const lastName = doc.user?.lastName || ''
                  const phoneNumber = doc.user?.phoneNumber || ''
                  const specialization = doc.specialization || 'Stomatolog'
                  const departments = Array.isArray(doc.departments) ? doc.departments : []
                  const commissionBasis = doc.commissionBasis || 'from_total'
                  const commissionRate = doc.defaultCommissionRate ?? 0

                  const docHours = (doc as any).workingHours || []
                  const todayShift = docHours.find((wh: any) => wh.weekday === currentWeekday)

                  return (
                    <TableRow key={doc.id} className='hover:bg-muted/20 transition-colors'>
                      <TableCell className='font-medium text-xs'>
                        <div className='flex items-center gap-2.5'>
                          <div className='flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs border border-primary/20'>
                            {firstName[0] || 'D'}
                          </div>
                          <div>
                            <p className='font-bold text-xs text-foreground'>
                              Dr. {firstName} {lastName}
                            </p>
                            {phoneNumber && (
                              <p className='text-[10px] text-muted-foreground font-mono tracking-wide'>
                                {phoneNumber}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className='text-xs'>
                        <div className='flex items-center gap-1 font-bold text-amber-500'>
                          <Star className='h-3.5 w-3.5 fill-amber-500 text-amber-500' />
                          <span>
                            {(doc as any).averageRating ? Number((doc as any).averageRating).toFixed(1) : '5.0'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className='text-xs text-muted-foreground font-medium'>
                        {specialization}
                      </TableCell>
                      <TableCell className='text-xs'>
                        <div className='flex flex-wrap gap-1'>
                          {departments.length === 0 ? (
                            <span className='text-muted-foreground text-[11px]'>—</span>
                          ) : (
                            departments.map((dep: any) => (
                              <Badge key={dep.id} variant='outline' className='text-[10px] font-normal'>
                                <Building2 className='h-2.5 w-2.5 me-1 text-muted-foreground' />
                                {dep.name}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      {!isDoctor && (
                        <TableCell className='text-xs'>
                          <Badge
                            variant='secondary'
                            className='text-[10px] font-normal border bg-muted/60'
                          >
                            {commissionBasis === 'from_total' ? 'Umumiy summa' : 'Sof foyda'}
                          </Badge>
                        </TableCell>
                      )}
                      {!isDoctor && (
                        <TableCell className='text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400'>
                          {commissionRate}%
                        </TableCell>
                      )}
                      <TableCell className='text-xs'>
                        {todayShift ? (
                          <Badge
                            variant='outline'
                            className='text-[10px] text-emerald-600 border-emerald-500/30 bg-emerald-500/10 font-mono gap-1'
                          >
                            <CheckCircle2 className='h-3 w-3' />
                            {todayShift.startTime} - {todayShift.endTime}
                          </Badge>
                        ) : (
                          <Badge
                            variant='outline'
                            className='text-[10px] text-muted-foreground border-muted-foreground/30 font-normal'
                          >
                            Dam olish
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className='text-end'>
                        <div className='flex items-center justify-end gap-1.5'>
                          {isHeadDoctor && (
                            <Button
                              size='sm'
                              variant='ghost'
                              className='h-7 w-7 p-0 text-muted-foreground hover:text-foreground'
                              onClick={() => handleOpenEdit(doc)}
                              title='Profilni tahrirlash'
                            >
                              <Pencil className='h-3.5 w-3.5' />
                            </Button>
                          )}
                          <Button
                            size='sm'
                            variant='outline'
                            className='h-8 text-xs font-medium gap-1'
                            onClick={() => setSelectedDoctor(doc)}
                          >
                            <Clock className='h-3.5 w-3.5 text-primary' /> Jadval
                          </Button>
                        </div>
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
          totalItems={displayDoctors.length}
          onPageChange={setPage}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize)
            setPage(1)
          }}
          className='mt-2'
        />

        {/* 1. Schedule & TimeOff Management Modal */}
        <Dialog open={selectedDoctor !== null} onOpenChange={(open) => !open && setSelectedDoctor(null)}>
          <DialogContent className='sm:max-w-2xl max-h-[88vh] overflow-y-auto'>
            <DialogHeader>
              <DialogTitle className='text-base font-bold flex items-center gap-2'>
                <Clock className='h-4 w-4 text-primary' />
                Dr. {selectedDoctor?.user?.firstName || ''} {selectedDoctor?.user?.lastName || ''} — Ish Jadvali va Ta'tillar
              </DialogTitle>
            </DialogHeader>

            <div className='space-y-6 py-2'>
              {/* Weekly Visual Grid */}
              <div className='space-y-3'>
                <h4 className='text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between'>
                  <span className='flex items-center gap-1.5'>
                    <CalendarCheck className='h-3.5 w-3.5 text-primary' /> Haftalik Ish Smenalari
                  </span>
                  <span className='text-[10px] lowercase font-normal text-muted-foreground'>
                    (7 kunlik ko'rinish)
                  </span>
                </h4>

                <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2'>
                  {WEEKDAYS.map((dayName, dayIndex) => {
                    const shifts = workingHours.filter((wh: WorkingHours) => wh.weekday === dayIndex)
                    const isTodayDay = dayIndex === currentWeekday

                    return (
                      <div
                        key={dayIndex}
                        className={`p-2.5 rounded-lg border text-xs flex flex-col justify-between min-h-[75px] ${
                          isTodayDay ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20' : 'bg-card/60'
                        }`}
                      >
                        <div className='flex items-center justify-between mb-1'>
                          <span className='font-bold text-[11px]'>{dayName}</span>
                          {isTodayDay && (
                            <Badge className='text-[9px] px-1 py-0 h-4 bg-primary text-primary-foreground'>
                              Bugun
                            </Badge>
                          )}
                        </div>

                        {shifts.length === 0 ? (
                          <span className='text-[10px] text-muted-foreground italic mt-auto'>
                            Dam olish kuni
                          </span>
                        ) : (
                          <div className='space-y-1 mt-auto'>
                            {shifts.map((s: WorkingHours) => (
                              <div
                                key={s.id}
                                className='flex items-center justify-between bg-muted/70 px-2 py-0.5 rounded text-[10px] font-mono'
                              >
                                <span>
                                  {s.startTime} - {s.endTime}
                                </span>
                                {(isHeadDoctor || isDoctor) && (
                                  <button
                                    type='button'
                                    onClick={() => handleDeleteWorkingHours(s.id)}
                                    className='text-muted-foreground hover:text-rose-500 ms-1'
                                    title="O'chirish"
                                  >
                                    <Trash2 className='h-3 w-3' />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Add working hours form */}
                <div className='p-3.5 rounded-xl border bg-muted/20 space-y-2 mt-3'>
                  <div className='text-xs font-semibold flex items-center justify-between'>
                    <span>Yangi ish soati qo'shish</span>
                    {/* Presets */}
                    <div className='flex items-center gap-1'>
                      <span className='text-[10px] text-muted-foreground me-1'>Shablon:</span>
                      {[
                        { label: '09:00 - 18:00', s: '09:00', e: '18:00' },
                        { label: '08:30 - 14:00', s: '08:30', e: '14:00' },
                        { label: '14:00 - 20:00', s: '14:00', e: '20:00' },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          type='button'
                          onClick={() => {
                            setStartTime(preset.s)
                            setEndTime(preset.e)
                          }}
                          className='text-[9px] px-1.5 py-0.5 rounded border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors'
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <form onSubmit={handleAddWorkingHours} className='grid grid-cols-4 gap-2 items-end pt-1'>
                    <div className='space-y-1 col-span-1'>
                      <label className='text-[10px] font-medium'>Hafta kuni</label>
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
                    <Button type='submit' size='sm' className='h-8 text-xs col-span-1 font-bold'>
                      <Plus className='h-3.5 w-3.5 me-1' /> Qo'shish
                    </Button>
                  </form>
                </div>
              </div>

              {/* Time Off Section */}
              <div className='space-y-3 border-t pt-4'>
                <h4 className='text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5'>
                  <CalendarX className='h-3.5 w-3.5 text-rose-500' /> Ta'til va Dam Olish Kunlari
                </h4>

                <div className='space-y-2'>
                  {timeOffs.length === 0 ? (
                    <p className='text-xs text-muted-foreground italic'>
                      Hozircha rejalashtirilgan ta'tillar yo'q.
                    </p>
                  ) : (
                    timeOffs.map((to: TimeOff) => (
                      <div
                        key={to.id || crypto.randomUUID()}
                        className='flex items-center justify-between rounded-lg border bg-rose-500/5 border-rose-500/20 px-3 py-2 text-xs font-mono'
                      >
                        <div>
                          <p className='font-semibold text-rose-700 dark:text-rose-400'>
                            {to.dateStart} {to.dateEnd && to.dateEnd !== to.dateStart ? `dan ${to.dateEnd} gacha` : ''}
                          </p>
                          {to.reason && (
                            <p className='text-[10px] text-muted-foreground font-sans mt-0.5'>
                              Sabab: {to.reason}
                            </p>
                          )}
                        </div>
                        {to.id && (
                          <Button
                            type='button'
                            size='icon'
                            variant='ghost'
                            className='h-6 w-6 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10'
                            onClick={() => handleDeleteTimeOff(to.id)}
                          >
                            <Trash2 className='h-3.5 w-3.5' />
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Add Time Off Form */}
                <form onSubmit={handleAddTimeOff} className='grid grid-cols-4 gap-2 pt-2 items-end'>
                  <div className='space-y-1 col-span-1'>
                    <label className='text-[10px] font-medium'>Boshlanish</label>
                    <Input
                      type='date'
                      className='h-8 text-xs font-mono'
                      value={dateStart}
                      onChange={(e) => setDateStart(e.target.value)}
                    />
                  </div>
                  <div className='space-y-1 col-span-1'>
                    <label className='text-[10px] font-medium'>Tugash</label>
                    <Input
                      type='date'
                      className='h-8 text-xs font-mono'
                      value={dateEnd}
                      onChange={(e) => setDateEnd(e.target.value)}
                    />
                  </div>
                  <div className='space-y-1 col-span-1'>
                    <label className='text-[10px] font-medium'>Sababi</label>
                    <Input
                      placeholder='Mehnat ta’tili...'
                      className='h-8 text-xs'
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </div>
                  <Button
                    type='submit'
                    size='sm'
                    variant='outline'
                    className='h-8 text-xs col-span-1 border-rose-500/30 text-rose-600 hover:bg-rose-500/10 font-medium'
                  >
                    <Plus className='h-3.5 w-3.5 me-1' /> Ta'til Kiritish
                  </Button>
                </form>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* 2. Edit Doctor Profile Modal */}
        <Dialog open={editDoctor !== null} onOpenChange={(open) => !open && setEditDoctor(null)}>
          <DialogContent className='sm:max-w-md'>
            <DialogHeader>
              <DialogTitle className='text-base font-bold flex items-center gap-2'>
                <Pencil className='h-4 w-4 text-primary' />
                Dr. {editDoctor?.user?.firstName || ''} {editDoctor?.user?.lastName || ''} — Profilni Tahrirlash
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSaveEditDoctor} className='space-y-3.5 py-2'>
              <div className='space-y-1'>
                <label className='text-xs font-semibold'>Mutaxassislik</label>
                <Input
                  placeholder='Masalan: Stomatolog-Terapevt, Ortodont'
                  value={editSpecialization}
                  onChange={(e) => setEditSpecialization(e.target.value)}
                  className='text-xs'
                />
              </div>

              <div className='grid grid-cols-2 gap-3'>
                <div className='space-y-1'>
                  <label className='text-xs font-semibold'>Komissiya Asosi</label>
                  <Select
                    value={editCommissionBasis}
                    onValueChange={(val: any) => setEditCommissionBasis(val)}
                  >
                    <SelectTrigger className='text-xs'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='from_total'>Umumiy narxdan (Total)</SelectItem>
                      <SelectItem value='from_net'>Sof narxdan (Net)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className='space-y-1'>
                  <label className='text-xs font-semibold'>Standart Foiz %</label>
                  <Input
                    type='number'
                    min='0'
                    max='100'
                    step='0.5'
                    value={editCommissionRate}
                    onChange={(e) => setEditCommissionRate(e.target.value)}
                    className='text-xs font-mono font-bold'
                    required
                  />
                </div>
              </div>

              {/* Departments selection */}
              <div className='space-y-1.5'>
                <label className='text-xs font-semibold'>Biriktirilgan Bo'limlar</label>
                <div className='flex flex-wrap gap-1.5 p-2 rounded-lg border bg-muted/20 min-h-[40px]'>
                  {departmentsList.map((dep: any) => {
                    const isSelected = editDepartmentIds.includes(String(dep.id))
                    return (
                      <button
                        key={dep.id}
                        type='button'
                        onClick={() => {
                          if (isSelected) {
                            setEditDepartmentIds(editDepartmentIds.filter((id) => id !== String(dep.id)))
                          } else {
                            setEditDepartmentIds([...editDepartmentIds, String(dep.id)])
                          }
                        }}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                          isSelected
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-card text-muted-foreground border-border hover:bg-muted'
                        }`}
                      >
                        {dep.name}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Can View Other Doctors */}
              <div className='flex items-center space-x-2 pt-1'>
                <Checkbox
                  id='canViewOthers'
                  checked={editCanViewOthers}
                  onCheckedChange={(checked) => setEditCanViewOthers(Boolean(checked))}
                />
                <label
                  htmlFor='canViewOthers'
                  className='text-xs font-medium leading-none cursor-pointer'
                >
                  Boshqa shifokorlar qabulini ko'ra oladi
                </label>
              </div>

              <div className='space-y-1'>
                <label className='text-xs font-semibold'>Biografiya / Qo'shimcha ma'lumot</label>
                <Textarea
                  placeholder='Ish tajribasi, diplomlar, sertifikatlar...'
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  className='text-xs min-h-[60px]'
                />
              </div>

              <DialogFooter className='pt-3 gap-2'>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => setEditDoctor(null)}
                >
                  Bekor qilish
                </Button>
                <Button
                  type='submit'
                  size='sm'
                  disabled={updateDoctorMutation.isPending}
                  className='font-bold'
                >
                  {updateDoctorMutation.isPending ? 'Saqlanmoqda...' : "O'zgarishlarni Saqlash"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </Main>
    </>
  )
}
