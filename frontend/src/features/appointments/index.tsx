import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Plus, User, FileText } from 'lucide-react'
import { confirmSwal } from '@/lib/sweetalert'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { format } from 'date-fns'
import {
  useAppointments,
  useCreateAppointment,
  useUpdateAppointment,
  useCancelAppointment,
} from '@/api/hooks/use-appointments'
import { useDoctors, useAvailableSlots } from '@/api/hooks/use-doctors'
import { usePatients } from '@/api/hooks/use-patients'
import { useDepartments } from '@/api/hooks/use-departments'
import { useProcedureTypes } from '@/api/hooks/use-procedure-types'
import { type AvailableSlot } from '@/types/api'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { ScheduleCalendar } from '@/components/schedule-calendar/schedule-calendar'
import { toast } from 'sonner'
import { getErrorMessage } from '@/lib/get-error-message'
import { useAuthStore } from '@/stores/auth-store'

const STATUS_BADGES: Record<string, { label: string; variant: 'default' | 'outline' | 'destructive' | 'secondary' }> = {
  scheduled: { label: 'Rejalashtirilgan', variant: 'outline' },
  confirmed: { label: 'Tasdiqlangan', variant: 'secondary' },
  in_progress: { label: 'Jarayonda', variant: 'default' },
  completed: { label: 'Yakunlangan', variant: 'default' },
  cancelled: { label: 'Bekor qilingan', variant: 'destructive' },
  no_show: { label: "Kelmagan (No show)", variant: 'destructive' },
}

export function AppointmentsList() {
  const authUser = useAuthStore((state) => state.user)
  const isDoctor = authUser?.role === 'doctor'
  const canCreateAppointment = authUser?.role === 'administrator' || authUser?.role === 'bosh_shifokor'

  const [statusFilter, setStatusFilter] = useState<string>('')
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Booking Form State
  const [selectedPatientId, setSelectedPatientId] = useState('')
  const [selectedDoctorId, setSelectedDoctorId] = useState('')
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('')
  const [selectedProcedureTypeId, setSelectedProcedureTypeId] = useState('')
  const [bookingDate, setBookingDate] = useState<Date>(new Date())
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null)

  const isFilteringOverdue = statusFilter === 'overdue'
  const { data: appointmentsData, isLoading } = useAppointments({
    status: statusFilter && statusFilter !== 'all' && !isFilteringOverdue ? statusFilter : undefined,
  })
  const rawAppointments = Array.isArray(appointmentsData?.results)
    ? appointmentsData.results
    : Array.isArray(appointmentsData)
    ? appointmentsData
    : []

  const appointments = isFilteringOverdue
    ? rawAppointments.filter((app: any) => {
        const start = app?.scheduledStart || app?.scheduled_start
        return (
          start &&
          new Date(start).getTime() < Date.now() &&
          (app?.status === 'scheduled' || app?.status === 'confirmed')
        )
      })
    : rawAppointments

  const { data: patientsData } = usePatients({ page_size: 100 })
  const patients = Array.isArray(patientsData?.results)
    ? patientsData.results
    : Array.isArray(patientsData)
    ? patientsData
    : []

  const { data: doctorsData = [] } = useDoctors()
  const doctors = Array.isArray(doctorsData) ? doctorsData : []

  const { data: departmentsData = [] } = useDepartments()
  const departments = Array.isArray(departmentsData) ? departmentsData : []

  const { data: procedureTypesData = [] } = useProcedureTypes()
  const procedureTypes = Array.isArray(procedureTypesData) ? procedureTypesData : []

  const formattedDateStr = bookingDate && !isNaN(new Date(bookingDate).getTime())
    ? format(bookingDate, 'yyyy-MM-dd')
    : format(new Date(), 'yyyy-MM-dd')

  const selectedProcedure = procedureTypes.find((p: any) => p.id === selectedProcedureTypeId)
  const procedureDuration = selectedProcedure?.defaultDurationMinutes || undefined

  const { data: availableSlotsData = [], isLoading: isLoadingSlots } = useAvailableSlots(
    selectedDoctorId,
    formattedDateStr,
    procedureDuration,
    selectedProcedureTypeId
  )
  const availableSlots = Array.isArray(availableSlotsData)
    ? availableSlotsData
    : Array.isArray((availableSlotsData as any)?.slots)
    ? (availableSlotsData as any).slots
    : []

  // Cascading logic
  const availableDepartments = departments.filter((d: any) => {
    if (selectedDoctorId) {
      const doc = doctors.find((doc: any) => doc.id === selectedDoctorId)
      if (doc?.departments?.length) {
        return doc.departments.some((dep: any) => dep.id === d.id)
      }
    }
    return true
  })

  const availableDoctors = doctors.filter((doc: any) => {
    if (selectedDepartmentId) {
      if (doc.departments?.length) {
        return doc.departments.some((dep: any) => dep.id === selectedDepartmentId)
      }
      return false
    }
    return true
  })

  const availableProcedures = procedureTypes.filter((proc: any) => {
    const procDepId = proc?.department && typeof proc.department === 'object' ? proc.department.id : proc?.department
    if (selectedDepartmentId) {
      return procDepId === selectedDepartmentId
    }
    if (selectedDoctorId) {
      const doc = doctors.find((d: any) => d.id === selectedDoctorId)
      if (doc?.departments?.length) {
        return doc.departments.some((dep: any) => dep.id === procDepId)
      }
    }
    return true
  })

  // Auto-select department if doctor is selected and belongs to only 1 department
  const handleDoctorChange = (docId: string) => {
    setSelectedDoctorId(docId)
    const doc = doctors.find((d: any) => d.id === docId)
    if (doc?.departments?.length === 1) {
       setSelectedDepartmentId(doc.departments[0].id)
    }
  }

  const createAppointmentMutation = useCreateAppointment()
  const updateAppointmentMutation = useUpdateAppointment()
  const cancelAppointmentMutation = useCancelAppointment()

  const handleStatusChange = async (id: string, newStatus: string, label: string) => {
    try {
      await updateAppointmentMutation.mutateAsync({ id, data: { status: newStatus } })
      toast.success(`Navbat holati: ${label}`)
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Holatni o\'zgartirishda xatolik.'))
    }
  }

  const handleCreateAppointment = async () => {
    if (!selectedPatientId || !selectedDoctorId || !selectedDepartmentId || !selectedSlot) {
      toast.error('Bemor, shifokor, bo’lim va vaqt oralig’ini tanlang.')
      return
    }

    try {
      await createAppointmentMutation.mutateAsync({
        patient: selectedPatientId,
        doctor: selectedDoctorId,
        department: selectedDepartmentId,
        procedureType: selectedProcedureTypeId || undefined,
        scheduledStart: selectedSlot.start,
        scheduledEnd: selectedSlot.end,
      } as any)
      toast.success('Navbat muvaffaqiyatli band qilindi!')
      setIsModalOpen(false)
      setSelectedSlot(null)
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Ushbu vaqt oralig’i allaqachon band qilingan yoki xatolik yuz berdi.'))
    }
  }

  const handleCancel = async (id: string) => {
    const isConfirmed = await confirmSwal({
      title: "Navbatni bekor qilmoqchimisiz?",
      text: "Ushbu navbat bekor qilinadi va bemorga SMS/Telegram habar yuboriladi.",
      confirmButtonText: "Ha, bekor qilaman",
    })
    if (!isConfirmed) return

    try {
      await cancelAppointmentMutation.mutateAsync({ id, reason: 'Mijoz so’rovi bo’yicha' })
      toast.success('Navbat bekor qilindi.')
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Bekor qilishda xatolik.'))
    }
  }

  return (
    <>
      <Header>
        <div className='flex items-center gap-2 me-auto font-bold text-lg tracking-tight'>
          <span>📅 Navbatlar Jadvali</span>
        </div>
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main>
        <div className='mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>Klinika Navbatlari</h1>
            <p className='text-xs text-muted-foreground'>
              Bemorlarning qabul vaqtlari va shifokorlar bandligi.
            </p>
          </div>
          {canCreateAppointment && (
            <Button onClick={() => setIsModalOpen(true)} className='shadow'>
              <Plus className='me-2 h-4 w-4' /> Yangi Navbatga Yozish
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className='mb-4 flex items-center gap-3'>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className='w-48 text-xs'>
              <SelectValue placeholder='Holat bo’yicha (Hamma)' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>Barcha holatlar</SelectItem>
              <SelectItem value='overdue'>⚠️ Muddati o'tganlar (Kechikkan)</SelectItem>
              <SelectItem value='scheduled'>Rejalashtirilgan</SelectItem>
              <SelectItem value='confirmed'>Tasdiqlangan</SelectItem>
              <SelectItem value='in_progress'>Jarayonda</SelectItem>
              <SelectItem value='completed'>Yakunlangan</SelectItem>
              <SelectItem value='no_show'>Kelmagan (No-show)</SelectItem>
              <SelectItem value='cancelled'>Bekor qilingan</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Data Table with Mobile Horizontal Scroll */}
        <div className='rounded-xl border bg-card shadow-sm overflow-x-auto w-full'>
          <Table className='min-w-[650px] sm:min-w-full'>
            <TableHeader>
              <TableRow className='bg-muted/30'>
                <TableHead className='text-xs font-semibold'>Bemor</TableHead>
                <TableHead className='text-xs font-semibold'>Shifokor</TableHead>
                <TableHead className='text-xs font-semibold'>Bo'lim</TableHead>
                <TableHead className='text-xs font-semibold'>Boshlanish Vaqti</TableHead>
                <TableHead className='text-xs font-semibold'>Holat</TableHead>
                <TableHead className='text-xs font-semibold text-end'>Amallar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className='text-center py-8 text-xs text-muted-foreground animate-pulse'>
                    Navbatlar yuklanmoqda...
                  </TableCell>
                </TableRow>
              ) : appointments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className='text-center py-8 text-xs text-muted-foreground'>
                    Navbatlar topilmadi.
                  </TableCell>
                </TableRow>
              ) : (
                appointments.map((app: any) => {
                  const statusKey = app?.status || 'scheduled'
                  const badge = (STATUS_BADGES as any)[statusKey] || { label: statusKey, variant: 'outline' }

                  const patientId = app?.patientId || app?.patient_id || (app?.patient && typeof app.patient === 'object' ? app.patient.id : app?.patient)
                  const patientName = app?.patientName || app?.patient_name || (app?.patient && typeof app.patient === 'object' ? `${app.patient.firstName || app.patient.first_name || ''} ${app.patient.lastName || app.patient.last_name || ''}`.trim() : app?.patient) || 'Bemor'
                  const doctorName = app?.doctorName || app?.doctor_name || (app?.doctor && typeof app.doctor === 'object' ? `${app.doctor.user?.firstName || app.doctor.user?.first_name || ''} ${app.doctor.user?.lastName || app.doctor.user?.last_name || ''}`.trim() : app?.doctor) || 'Shifokor'
                  const departmentName = app?.departmentName || app?.department_name || (app?.department && typeof app.department === 'object' ? app.department.name : app?.department) || 'Bo\'lim'
                  const startDateStr = app?.scheduledStart || app?.scheduled_start || app?.start

                  const isOverdue = Boolean(
                    app?.isOverdue ||
                    (startDateStr &&
                      new Date(startDateStr).getTime() < Date.now() &&
                      (statusKey === 'scheduled' || statusKey === 'confirmed'))
                  )

                  return (
                    <TableRow key={String(app?.id)} className={`hover:bg-muted/20 ${isOverdue ? 'bg-amber-500/5' : ''}`}>
                      <TableCell className='font-medium text-xs'>
                        {patientId ? (
                          <Link
                            to='/patients/$id'
                            params={{ id: String(patientId) }}
                            className='hover:underline text-primary font-semibold flex items-center gap-1'
                          >
                            <User className='h-3.5 w-3.5 text-primary/70' />
                            {patientName}
                          </Link>
                        ) : (
                          patientName
                        )}
                      </TableCell>
                      <TableCell className='text-xs font-medium'>
                        {doctorName}
                      </TableCell>
                      <TableCell className='text-xs text-muted-foreground'>
                        {departmentName}
                      </TableCell>
                      <TableCell className='text-xs font-mono'>
                        {formatDateSafely(startDateStr)}
                      </TableCell>
                      <TableCell className='text-xs'>
                        <div className="flex flex-col gap-1 items-start">
                          <Badge variant={badge.variant as any} className='text-[10px]'>
                            {badge.label}
                          </Badge>
                          {isOverdue && (
                            <Badge variant='destructive' className='text-[9px] px-1.5 py-0 bg-amber-600 text-white border-none'>
                              ⚠️ Vaqti o'tgan
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className='text-end'>
                        <div className='flex items-center justify-end gap-1 flex-wrap'>
                          {patientId && (statusKey === 'in_progress' || statusKey === 'confirmed' || statusKey === 'scheduled') && (
                            <Button
                              asChild
                              size='sm'
                              variant='secondary'
                              className='h-7 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800'
                            >
                              <Link to='/patients/$id' params={{ id: String(patientId) }}>
                                <FileText className='me-1 h-3.5 w-3.5' /> 🦷 Qabulni Olib Borish
                              </Link>
                            </Button>
                          )}
                          {!isDoctor && statusKey === 'scheduled' && (
                            <Button
                              size='sm'
                              variant='outline'
                              className='h-7 text-xs text-emerald-600 border-emerald-300 hover:bg-emerald-50'
                              onClick={() => handleStatusChange(String(app.id), 'confirmed', 'Tasdiqlandi ✅')}
                            >
                              ✅ Tasdiqlash
                            </Button>
                          )}
                          {statusKey === 'confirmed' && (
                            <Button
                              size='sm'
                              variant='outline'
                              className='h-7 text-xs text-blue-600 border-blue-300 hover:bg-blue-50'
                              onClick={() => handleStatusChange(String(app.id), 'in_progress', 'Boshlandi 🔄')}
                            >
                              🔄 Boshlash
                            </Button>
                          )}
                          {statusKey === 'in_progress' && (
                            <Button
                              size='sm'
                              variant='outline'
                              className='h-7 text-xs text-green-600 border-green-300 hover:bg-green-50'
                              onClick={() => handleStatusChange(String(app.id), 'completed', 'Yakunlandi 🎉')}
                            >
                              🎉 Yakunlash
                            </Button>
                          )}
                          {isOverdue && statusKey !== 'no_show' && statusKey !== 'completed' && statusKey !== 'cancelled' && (
                            <Button
                              size='sm'
                              variant='outline'
                              className='h-7 text-xs text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300'
                              onClick={() => handleStatusChange(String(app.id), 'no_show', 'Kelmagan (No-show) deb belgilandi')}
                            >
                              Kelmagan
                            </Button>
                          )}
                          {statusKey !== 'cancelled' && statusKey !== 'completed' && (
                            <Button
                              size='sm'
                              variant='ghost'
                              className='h-7 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50'
                              onClick={() => handleCancel(String(app.id))}
                            >
                              Bekor qilish
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Booking Modal with ScheduleCalendar */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className='sm:max-w-2xl max-h-[90vh] overflow-y-auto'>
            <DialogHeader>
              <DialogTitle>Yangi Navbatga Yozish (Appointment Booking)</DialogTitle>
            </DialogHeader>

            <div className='space-y-4 py-2'>
              <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                <div className='space-y-1'>
                  <label className='text-xs font-medium'>Bemor *</label>
                  <SearchableSelect
                    options={patients.map((p: any) => ({
                      value: String(p.id),
                      label: `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Bemor',
                      sublabel: String(p.phoneNumber || ''),
                    }))}
                    value={selectedPatientId}
                    onValueChange={setSelectedPatientId}
                    placeholder='Bemor tanlang...'
                    searchPlaceholder='Bemor ism yoki tel...'
                  />
                </div>

                <div className='space-y-1'>
                  <label className='text-xs font-medium'>Bo'lim *</label>
                  <Select value={selectedDepartmentId} onValueChange={setSelectedDepartmentId}>
                    <SelectTrigger className='text-xs h-9'>
                      <SelectValue placeholder='Bo’lim tanlang' />
                    </SelectTrigger>
                    <SelectContent>
                      {availableDepartments.map((d: any) => (
                        <SelectItem key={String(d.id)} value={String(d.id)}>
                          {String(d.name)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                <div className='space-y-1'>
                  <label className='text-xs font-medium'>Shifokor *</label>
                  <SearchableSelect
                    options={availableDoctors.map((doc: any) => ({
                      value: String(doc.id),
                      label: `Dr. ${doc.user?.firstName || ''} ${doc.user?.lastName || ''}`.trim(),
                      sublabel: String(doc.specialization || 'Stomatolog'),
                    }))}
                    value={selectedDoctorId}
                    onValueChange={handleDoctorChange}
                    placeholder='Shifokor tanlang...'
                    searchPlaceholder='Shifokor ismini yozing...'
                  />
                </div>

                <div className='space-y-1'>
                  <label className='text-xs font-medium'>Muolaja Turi (Ixtiyoriy)</label>
                  <Select value={selectedProcedureTypeId} onValueChange={setSelectedProcedureTypeId}>
                    <SelectTrigger>
                      <SelectValue placeholder='Muolaja turi' />
                    </SelectTrigger>
                    <SelectContent>
                      {availableProcedures.map((proc: any) => (
                        <SelectItem key={String(proc.id)} value={String(proc.id)}>
                          {String(proc.name)} ({proc.defaultDurationMinutes || 30} daq, {Number(proc.defaultPrice || 0).toLocaleString()} so'm)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Interactive Calendar & Slots picker */}
              {selectedDoctorId ? (
                <ScheduleCalendar
                  availableSlots={(availableSlots as AvailableSlot[]) || []}
                  selectedDate={bookingDate}
                  onDateChange={setBookingDate}
                  onSlotSelect={setSelectedSlot}
                  isLoadingSlots={isLoadingSlots}
                />
              ) : (
                <div className='flex items-center justify-center p-6 border rounded-xl bg-muted/20 text-xs text-muted-foreground'>
                  Bo'sh vaqt oraliklarini ko'rish uchun avval shifokorni tanlang.
                </div>
              )}
            </div>

            <DialogFooter className='pt-2'>
              <Button variant='outline' onClick={() => setIsModalOpen(false)}>
                Bekor qilish
              </Button>
              <Button
                onClick={handleCreateAppointment}
                disabled={createAppointmentMutation.isPending || !selectedSlot}
              >
                {createAppointmentMutation.isPending ? 'Band qilinmoqda...' : 'Navbatni Band Qilish'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Main>
    </>
  )
}

function formatDateSafely(dateStr: string) {
  if (!dateStr) return '-'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return String(dateStr)
    return format(d, 'dd.MM.yyyy HH:mm')
  } catch {
    return String(dateStr)
  }
}
