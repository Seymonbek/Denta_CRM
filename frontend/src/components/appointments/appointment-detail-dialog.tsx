import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns'
import {
  Calendar,
  Clock,
  User,
  Stethoscope,
  Building2,
  FileText,
  Phone,
  CheckCircle2,
  PlayCircle,
  XCircle,
  AlertCircle,
  CalendarClock,
  ArrowRight,
} from 'lucide-react'
import { type Appointment } from '@/types/api'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { useUpdateAppointment, useCancelAppointment } from '@/api/hooks/use-appointments'
import { confirmSwal } from '@/lib/sweetalert'
import { getErrorMessage } from '@/lib/get-error-message'

interface AppointmentDetailDialogProps {
  appointment: Appointment | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onReschedule?: (appointment: Appointment) => void
}

const STATUS_CONFIG: Record<string, { label: string; color: string; badgeVariant: 'default' | 'outline' | 'destructive' | 'secondary' }> = {
  scheduled: { label: 'Rejalashtirilgan', color: 'text-sky-600 bg-sky-500/10 border-sky-500/30', badgeVariant: 'outline' },
  confirmed: { label: 'Keldi (Tasdiqlangan)', color: 'text-amber-600 bg-amber-500/10 border-amber-500/30', badgeVariant: 'secondary' },
  in_progress: { label: 'Qabulda (Jarayonda)', color: 'text-blue-600 bg-blue-500/10 border-blue-500/30', badgeVariant: 'default' },
  completed: { label: 'Yakunlangan', color: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/30', badgeVariant: 'default' },
  cancelled: { label: 'Bekor qilingan', color: 'text-rose-600 bg-rose-500/10 border-rose-500/30', badgeVariant: 'destructive' },
  no_show: { label: 'Kelmadi (No-show)', color: 'text-gray-600 bg-gray-500/10 border-gray-500/30', badgeVariant: 'destructive' },
}

export function AppointmentDetailDialog({
  appointment,
  open,
  onOpenChange,
  onReschedule,
}: AppointmentDetailDialogProps) {
  const navigate = useNavigate()
  const updateMutation = useUpdateAppointment()
  const cancelMutation = useCancelAppointment()
  const [isActionLoading, setIsActionLoading] = useState(false)

  if (!appointment) return null

  const patient = typeof appointment.patient === 'object' && appointment.patient ? appointment.patient : null
  const patientName = appointment.patientName || (patient ? `${patient.firstName || ''} ${patient.lastName || ''}`.trim() : 'Bemor')
  const patientPhone = patient?.phoneNumber || ''
  const patientId = patient?.id || (typeof appointment.patient === 'string' ? appointment.patient : '')

  const doctor = typeof appointment.doctor === 'object' && appointment.doctor ? appointment.doctor : null
  const doctorName = appointment.doctorName || (doctor?.user ? `${doctor.user.firstName || ''} ${doctor.user.lastName || ''}`.trim() : 'Shifokor')
  const doctorId = doctor?.id || (typeof appointment.doctor === 'string' ? appointment.doctor : '')
  const departmentName = appointment.departmentName || (typeof appointment.department === 'object' && appointment.department ? appointment.department.name : 'Klinika')
  const procedureName = appointment.procedureTypeName || (typeof appointment.procedureType === 'object' && appointment.procedureType ? appointment.procedureType.name : "Umumiy ko'rik")

  const start = appointment.scheduledStart
  const end = appointment.scheduledEnd

  const startDate = start ? new Date(start) : null
  const endDate = end ? new Date(end) : null

  const dateFormatted = startDate && !isNaN(startDate.getTime())
    ? format(startDate, 'dd.MM.yyyy')
    : ''
  const timeFormatted = startDate && endDate && !isNaN(startDate.getTime()) && !isNaN(endDate.getTime())
    ? `${format(startDate, 'HH:mm')} — ${format(endDate, 'HH:mm')}`
    : ''

  const durationMin = startDate && endDate
    ? Math.round((endDate.getTime() - startDate.getTime()) / 60000)
    : 30

  const status = appointment.status || 'scheduled'
  const statusInfo = STATUS_CONFIG[status] || STATUS_CONFIG.scheduled

  const handleStatusChange = async (newStatus: string, label: string) => {
    setIsActionLoading(true)
    try {
      await updateMutation.mutateAsync({
        id: appointment.id,
        data: { status: newStatus },
      })
      toast.success(`Navbat holati: ${label}`)
      onOpenChange(false)
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Holatni o\'zgartirishda xatolik yuz berdi.'))
    } finally {
      setIsActionLoading(false)
    }
  }

  const handleCancel = async () => {
    const isConfirmed = await confirmSwal({
      title: "Navbatni bekor qilasizmi?",
      text: `${patientName}ning ushbu navbati bekor qilinadi.`,
      icon: "warning",
      confirmButtonText: "Ha, bekor qilish",
      cancelButtonText: "Yo'q",
    })
    if (!isConfirmed) return

    setIsActionLoading(true)
    try {
      await cancelMutation.mutateAsync({ id: appointment.id, reason: 'Bemor/Resepshn talabi bilan' })
      toast.success('Navbat bekor qilindi.')
      onOpenChange(false)
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Bekor qilishda xatolik yuz berdi.'))
    } finally {
      setIsActionLoading(false)
    }
  }

  const handleStartTreatment = () => {
    onOpenChange(false)
    navigate({
      to: '/treatments',
      search: {
        newPatientId: patientId,
        newDoctorId: doctorId,
        newAppointmentId: appointment.id,
      } as any,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-md p-6'>
        <DialogHeader className='border-b pb-4'>
          <div className='flex items-center justify-between'>
            <DialogTitle className='text-lg font-bold flex items-center gap-2'>
              <CalendarClock className='h-5 w-5 text-primary' />
              Navbat Tafsilotlari
            </DialogTitle>
            <Badge variant='outline' className={`text-xs font-semibold px-2.5 py-1 ${statusInfo.color}`}>
              {statusInfo.label}
            </Badge>
          </div>
        </DialogHeader>

        <div className='space-y-4 py-2 text-xs'>
          {/* Bemor haqida */}
          <div className='rounded-lg border bg-muted/30 p-3 space-y-2'>
            <div className='flex items-center justify-between'>
              <div className='flex items-center gap-2 font-semibold text-sm text-foreground'>
                <User className='h-4 w-4 text-primary' />
                <span>{patientName}</span>
              </div>
              {patientId && (
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={() => {
                    onOpenChange(false)
                    navigate({ to: `/patients/${patientId}` as any })
                  }}
                  className='h-6 text-[11px] text-primary p-1 hover:underline'
                >
                  Profilga o'tish <ArrowRight className='h-3 w-3 ml-1' />
                </Button>
              )}
            </div>
            {patientPhone && (
              <div className='flex items-center gap-2 text-muted-foreground font-mono'>
                <Phone className='h-3.5 w-3.5' />
                <a href={`tel:${patientPhone}`} className='hover:underline'>{patientPhone}</a>
              </div>
            )}
          </div>

          {/* Shifokor va Muolaja */}
          <div className='grid grid-cols-2 gap-2'>
            <div className='rounded-lg border p-2.5 bg-card'>
              <div className='flex items-center gap-1.5 text-muted-foreground mb-1'>
                <Stethoscope className='h-3.5 w-3.5 text-emerald-500' />
                <span className='font-medium'>Shifokor</span>
              </div>
              <div className='font-bold text-foreground truncate'>
                Dr. {doctorName}
              </div>
            </div>

            <div className='rounded-lg border p-2.5 bg-card'>
              <div className='flex items-center gap-1.5 text-muted-foreground mb-1'>
                <Building2 className='h-3.5 w-3.5 text-blue-500' />
                <span className='font-medium'>Bo'lim</span>
              </div>
              <div className='font-bold text-foreground truncate'>
                {departmentName}
              </div>
            </div>
          </div>

          {/* Sana va Vaqt */}
          <div className='rounded-lg border p-3 bg-card space-y-1.5'>
            <div className='flex items-center justify-between text-muted-foreground'>
              <span className='flex items-center gap-1.5 font-medium'>
                <Calendar className='h-3.5 w-3.5 text-primary' /> Sana & Vaqt
              </span>
              <span className='text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded'>
                {durationMin} daqiqa
              </span>
            </div>
            <div className='flex items-center justify-between font-mono font-bold text-sm text-foreground pt-1'>
              <span>{dateFormatted}</span>
              <span className='text-primary flex items-center gap-1'>
                <Clock className='h-3.5 w-3.5' /> {timeFormatted}
              </span>
            </div>
          </div>

          {/* Muolaja turi & Izohlar */}
          <div className='space-y-1.5'>
            <div className='flex items-center gap-1.5 font-semibold text-muted-foreground'>
              <FileText className='h-3.5 w-3.5 text-primary' />
              <span>Muolaja turi va Izohlar:</span>
            </div>
            <div className='rounded-md border p-2 bg-muted/20 font-medium text-foreground'>
              {procedureName}
            </div>
            {appointment.notes && (
              <p className='text-muted-foreground italic px-1 text-[11px]'>
                "{appointment.notes}"
              </p>
            )}
          </div>

          {/* Tezkor status o'zgartirish tugmalari */}
          <div className='border-t pt-3 space-y-2'>
            <span className='text-[11px] font-semibold text-muted-foreground block'>
              Tezkor Harakatlar:
            </span>
            <div className='grid grid-cols-2 gap-2'>
              {status === 'scheduled' && (
                <Button
                  size='sm'
                  variant='outline'
                  disabled={isActionLoading}
                  onClick={() => handleStatusChange('confirmed', 'Keldi (Tasdiqlangan)')}
                  className='h-8 text-xs border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10'
                >
                  <CheckCircle2 className='h-3.5 w-3.5 mr-1 text-amber-600' /> Bemor Keldi
                </Button>
              )}

              {(status === 'scheduled' || status === 'confirmed') && (
                <Button
                  size='sm'
                  disabled={isActionLoading}
                  onClick={() => handleStatusChange('in_progress', 'Qabulda (Jarayonda)')}
                  className='h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white'
                >
                  <PlayCircle className='h-3.5 w-3.5 mr-1' /> Qabulni Boshlash
                </Button>
              )}

              {status === 'in_progress' && (
                <Button
                  size='sm'
                  disabled={isActionLoading}
                  onClick={() => handleStatusChange('completed', 'Yakunlangan')}
                  className='h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white'
                >
                  <CheckCircle2 className='h-3.5 w-3.5 mr-1' /> Qabulni Yakunlash
                </Button>
              )}

              {(status === 'in_progress' || status === 'completed') && (
                <Button
                  size='sm'
                  variant='default'
                  onClick={handleStartTreatment}
                  className='h-8 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold'
                >
                  Muolajaga o'tish <ArrowRight className='h-3.5 w-3.5 ml-1' />
                </Button>
              )}

              {(status === 'scheduled' || status === 'confirmed') && (
                <Button
                  size='sm'
                  variant='outline'
                  disabled={isActionLoading}
                  onClick={() => handleStatusChange('no_show', 'Kelmadi')}
                  className='h-8 text-xs border-rose-500/30 text-rose-600 hover:bg-rose-500/10'
                >
                  <AlertCircle className='h-3.5 w-3.5 mr-1' /> Kelmadi
                </Button>
              )}

              {onReschedule && status !== 'cancelled' && status !== 'completed' && (
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => {
                    onOpenChange(false)
                    onReschedule(appointment)
                  }}
                  className='h-8 text-xs border-primary/30 text-primary hover:bg-primary/5'
                >
                  <CalendarClock className='h-3.5 w-3.5 mr-1' /> Vaqtni Ko'chirish
                </Button>
              )}

              {status !== 'cancelled' && status !== 'completed' && (
                <Button
                  size='sm'
                  variant='ghost'
                  disabled={isActionLoading}
                  onClick={handleCancel}
                  className='h-8 text-xs text-destructive hover:bg-destructive/10'
                >
                  <XCircle className='h-3.5 w-3.5 mr-1' /> Bekor Qilish
                </Button>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className='border-t pt-3'>
          <Button variant='outline' size='sm' onClick={() => onOpenChange(false)}>
            Yopish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
