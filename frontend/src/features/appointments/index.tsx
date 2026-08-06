import { useState } from 'react'
import { Plus } from 'lucide-react'
import { format } from 'date-fns'
import {
  useAppointments,
  useCreateAppointment,
  useCancelAppointment,
} from '@/api/hooks/use-appointments'
import { useDoctors, useAvailableSlots } from '@/api/hooks/use-doctors'
import { usePatients } from '@/api/hooks/use-patients'
import { useDepartments } from '@/api/hooks/use-departments'
import { useProcedureTypes } from '@/api/hooks/use-procedure-types'
import { AvailableSlot } from '@/types/api'
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

const STATUS_BADGES: Record<string, { label: string; variant: 'default' | 'outline' | 'destructive' | 'secondary' }> = {
  scheduled: { label: 'Rejalashtirilgan', variant: 'outline' },
  confirmed: { label: 'Tasdiqlangan', variant: 'secondary' },
  in_progress: { label: 'Jarayonda', variant: 'default' },
  completed: { label: 'Yakunlangan', variant: 'default' },
  cancelled: { label: 'Bekor qilingan', variant: 'destructive' },
  no_show: { label: "Kelmagan (No show)", variant: 'destructive' },
}

export function AppointmentsList() {
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Booking Form State
  const [selectedPatientId, setSelectedPatientId] = useState('')
  const [selectedDoctorId, setSelectedDoctorId] = useState('')
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('')
  const [selectedProcedureTypeId, setSelectedProcedureTypeId] = useState('')
  const [bookingDate, setBookingDate] = useState<Date>(new Date())
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null)

  const { data: appointmentsData, isLoading } = useAppointments({
    status: statusFilter && statusFilter !== 'all' ? statusFilter : undefined,
  })
  const appointments = Array.isArray(appointmentsData?.results)
    ? appointmentsData.results
    : Array.isArray(appointmentsData)
    ? appointmentsData
    : []

  const { data: patientsData } = usePatients({ page: 1 })
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

  const { data: availableSlotsData = [], isLoading: isLoadingSlots } = useAvailableSlots(
    selectedDoctorId,
    formattedDateStr
  )
  const availableSlots = Array.isArray(availableSlotsData) ? availableSlotsData : []

  const createAppointmentMutation = useCreateAppointment()
  const cancelAppointmentMutation = useCancelAppointment()

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
      })
      toast.success('Navbat muvaffaqiyatli band qilindi!')
      setIsModalOpen(false)
      setSelectedSlot(null)
    } catch (err: any) {
      const errorDetail =
        err?.response?.data?.detail ||
        err?.response?.data?.scheduledStart?.[0] ||
        err?.response?.data?.nonFieldErrors?.[0] ||
        'Ushbu vaqt oralig’i allaqachon band qilingan yoki xatolik yuz berdi.'
      toast.error(`Navbat band etilmadi: ${errorDetail}`)
    }
  }

  const handleCancel = async (id: string) => {
    try {
      await cancelAppointmentMutation.mutateAsync({ id, reason: 'Mijoz so’rovi bo’yicha' })
      toast.success('Navbat bekor qilindi.')
    } catch {
      toast.error('Bekor qilishda xatolik.')
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
          <Button onClick={() => setIsModalOpen(true)} className='shadow'>
            <Plus className='me-2 h-4 w-4' /> Yangi Navbatga Yozish
          </Button>
        </div>

        {/* Filters */}
        <div className='mb-4 flex items-center gap-3'>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className='w-48 text-xs'>
              <SelectValue placeholder='Holat bo’yicha (Hamma)' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>Barcha holatlar</SelectItem>
              <SelectItem value='scheduled'>Rejalashtirilgan</SelectItem>
              <SelectItem value='confirmed'>Tasdiqlangan</SelectItem>
              <SelectItem value='in_progress'>Jarayonda</SelectItem>
              <SelectItem value='completed'>Yakunlangan</SelectItem>
              <SelectItem value='cancelled'>Bekor qilingan</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Appointments Table */}
        <div className='rounded-xl border bg-card shadow-sm overflow-hidden'>
          <Table>
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
                  const badge = STATUS_BADGES[statusKey] || { label: statusKey, variant: 'outline' }

                  const patientName = app?.patientName || app?.patient_name || (typeof app?.patient === 'object' ? `${app.patient.firstName || app.patient.first_name || ''} ${app.patient.lastName || app.patient.last_name || ''}`.trim() : app?.patient) || 'Bemor'
                  const doctorName = app?.doctorName || app?.doctor_name || (typeof app?.doctor === 'object' ? `${app.doctor.user?.firstName || app.doctor.user?.first_name || ''} ${app.doctor.user?.lastName || app.doctor.user?.last_name || ''}`.trim() : app?.doctor) || 'Shifokor'
                  const departmentName = app?.departmentName || app?.department_name || (typeof app?.department === 'object' ? app.department.name : app?.department) || 'Bo’lim'
                  const startDateStr = app?.scheduledStart || app?.scheduled_start || app?.start

                  return (
                    <TableRow key={app?.id || Math.random()} className='hover:bg-muted/20'>
                      <TableCell className='font-medium text-xs'>
                        {patientName}
                      </TableCell>
                      <TableCell className='text-xs'>
                        {doctorName}
                      </TableCell>
                      <TableCell className='text-xs text-muted-foreground'>
                        {departmentName}
                      </TableCell>
                      <TableCell className='text-xs font-mono'>
                        {formatDateSafely(startDateStr)}
                      </TableCell>
                      <TableCell className='text-xs'>
                        <Badge variant={badge.variant as any} className='text-[10px]'>
                          {badge.label}
                        </Badge>
                      </TableCell>
                      <TableCell className='text-end'>
                        {statusKey !== 'cancelled' && statusKey !== 'completed' && (
                          <Button
                            size='sm'
                            variant='ghost'
                            className='h-7 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50'
                            onClick={() => handleCancel(app.id)}
                          >
                            Bekor qilish
                          </Button>
                        )}
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
                  <Select value={selectedPatientId} onValueChange={setSelectedPatientId}>
                    <SelectTrigger>
                      <SelectValue placeholder='Bemor tanlang' />
                    </SelectTrigger>
                    <SelectContent>
                      {patients.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.firstName || p.first_name} {p.lastName || p.last_name} ({p.phoneNumber || p.phone_number})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className='space-y-1'>
                  <label className='text-xs font-medium'>Bo'lim *</label>
                  <Select value={selectedDepartmentId} onValueChange={setSelectedDepartmentId}>
                    <SelectTrigger>
                      <SelectValue placeholder='Bo’lim tanlang' />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((d: any) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                <div className='space-y-1'>
                  <label className='text-xs font-medium'>Shifokor *</label>
                  <Select value={selectedDoctorId} onValueChange={setSelectedDoctorId}>
                    <SelectTrigger>
                      <SelectValue placeholder='Shifokor tanlang' />
                    </SelectTrigger>
                    <SelectContent>
                      {doctors.map((doc: any) => (
                        <SelectItem key={doc.id} value={doc.id}>
                          Dr. {doc.user?.firstName || doc.user?.first_name || ''} {doc.user?.lastName || doc.user?.last_name || ''} ({doc.specialization})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className='space-y-1'>
                  <label className='text-xs font-medium'>Muolaja Turi (Ixtiyoriy)</label>
                  <Select value={selectedProcedureTypeId} onValueChange={setSelectedProcedureTypeId}>
                    <SelectTrigger>
                      <SelectValue placeholder='Muolaja turi' />
                    </SelectTrigger>
                    <SelectContent>
                      {procedureTypes.map((proc: any) => (
                        <SelectItem key={proc.id} value={proc.id}>
                          {proc.name} ({proc.defaultDurationMinutes || proc.default_duration_minutes || 30} daq, {Number(proc.defaultPrice || proc.default_price || 0).toLocaleString()} so'm)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Interactive Calendar & Slots picker */}
              {selectedDoctorId ? (
                <ScheduleCalendar
                  availableSlots={availableSlots}
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
