import { useMemo } from 'react'
import {
  format,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addDays,
  subDays,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  isSameDay,
  isSameMonth,
  isToday,
  setHours,
  setMinutes,
} from 'date-fns'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
} from 'lucide-react'
import { type Appointment } from '@/types/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'

export type CalendarViewMode = 'day' | 'week' | 'month'

interface AppointmentCalendarViewProps {
  appointments: Appointment[]
  currentDate: Date
  onDateChange: (date: Date) => void
  viewMode: CalendarViewMode
  onViewModeChange: (mode: CalendarViewMode) => void
  onSelectAppointment: (appointment: Appointment) => void
  onNewAppointmentAt?: (date: Date) => void
  doctors?: Array<{ id: string; user?: { firstName?: string; lastName?: string } }>
  selectedDoctorId?: string
  onDoctorChange?: (doctorId: string) => void
  isLoading?: boolean
}

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8) // 08:00 to 20:00

const STATUS_COLOR_MAP: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  scheduled: { bg: 'bg-sky-500/10 hover:bg-sky-500/20', border: 'border-sky-500/30', text: 'text-sky-800 dark:text-sky-300', dot: 'bg-sky-500' },
  confirmed: { bg: 'bg-amber-500/15 hover:bg-amber-500/25', border: 'border-amber-500/40', text: 'text-amber-800 dark:text-amber-300', dot: 'bg-amber-500' },
  in_progress: { bg: 'bg-blue-500/15 hover:bg-blue-500/25', border: 'border-blue-500/40', text: 'text-blue-800 dark:text-blue-300', dot: 'bg-blue-500' },
  completed: { bg: 'bg-emerald-500/15 hover:bg-emerald-500/25', border: 'border-emerald-500/40', text: 'text-emerald-800 dark:text-emerald-300', dot: 'bg-emerald-500' },
  cancelled: { bg: 'bg-rose-500/10 hover:bg-rose-500/20 opacity-60', border: 'border-rose-500/30', text: 'text-rose-800 dark:text-rose-300', dot: 'bg-rose-500' },
  no_show: { bg: 'bg-gray-500/10 hover:bg-gray-500/20 opacity-60', border: 'border-gray-500/30', text: 'text-gray-800 dark:text-gray-300', dot: 'bg-gray-500' },
}

function getPatientName(app: Appointment): string {
  if (app.patientName) return app.patientName
  if (typeof app.patient === 'object' && app.patient) {
    return `${app.patient.firstName || ''} ${app.patient.lastName || ''}`.trim() || 'Bemor'
  }
  return 'Bemor'
}

function getDoctorName(app: Appointment): string {
  if (app.doctorName) return app.doctorName
  if (typeof app.doctor === 'object' && app.doctor?.user) {
    return `${app.doctor.user.firstName || ''} ${app.doctor.user.lastName || ''}`.trim() || 'Shifokor'
  }
  return 'Shifokor'
}

function getDoctorId(app: Appointment): string {
  if (typeof app.doctor === 'object' && app.doctor) {
    return app.doctor.id
  }
  return typeof app.doctor === 'string' ? app.doctor : ''
}

function getProcedureName(app: Appointment): string {
  if (app.procedureTypeName) return app.procedureTypeName
  if (typeof app.procedureType === 'object' && app.procedureType) {
    return app.procedureType.name
  }
  return "Ko'rik"
}

export function AppointmentCalendarView({
  appointments = [],
  currentDate,
  onDateChange,
  viewMode,
  onViewModeChange,
  onSelectAppointment,
  onNewAppointmentAt,
  doctors = [],
  selectedDoctorId = '',
  onDoctorChange,
  isLoading = false,
}: AppointmentCalendarViewProps) {
  // Navigation
  const handlePrev = () => {
    if (viewMode === 'day') onDateChange(subDays(currentDate, 1))
    else if (viewMode === 'week') onDateChange(subWeeks(currentDate, 1))
    else onDateChange(subMonths(currentDate, 1))
  }

  const handleNext = () => {
    if (viewMode === 'day') onDateChange(addDays(currentDate, 1))
    else if (viewMode === 'week') onDateChange(addWeeks(currentDate, 1))
    else onDateChange(addMonths(currentDate, 1))
  }

  const handleToday = () => {
    onDateChange(new Date())
  }

  // Header Title
  const headerTitle = useMemo(() => {
    if (viewMode === 'day') {
      return format(currentDate, 'd-MMMM, yyyy')
    }
    if (viewMode === 'week') {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 })
      const end = endOfWeek(currentDate, { weekStartsOn: 1 })
      return `${format(start, 'd-MMM')} — ${format(end, 'd-MMM, yyyy')}`
    }
    return format(currentDate, 'MMMM yyyy')
  }, [currentDate, viewMode])

  // Week days
  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 })
    const end = endOfWeek(currentDate, { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [currentDate])

  // Month days
  const monthDays = useMemo(() => {
    const startMonth = startOfMonth(currentDate)
    const endMonth = endOfMonth(currentDate)
    const startGrid = startOfWeek(startMonth, { weekStartsOn: 1 })
    const endGrid = endOfWeek(endMonth, { weekStartsOn: 1 })
    return eachDayOfInterval({ start: startGrid, end: endGrid })
  }, [currentDate])

  // Doctor Filtered Appointments
  const filteredAppointments = useMemo(() => {
    if (!selectedDoctorId || selectedDoctorId === 'all') return appointments
    return appointments.filter((app) => {
      const docId = getDoctorId(app)
      return docId === selectedDoctorId
    })
  }, [appointments, selectedDoctorId])

  return (
    <div className='flex flex-col space-y-4'>
      {/* Calendar Control Header */}
      <div className='flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card border p-3 rounded-xl shadow-xs'>
        <div className='flex items-center gap-2'>
          <Button variant='outline' size='sm' onClick={handleToday} className='h-8 text-xs font-semibold'>
            Bugun
          </Button>
          <div className='flex items-center'>
            <Button variant='ghost' size='icon' onClick={handlePrev} className='h-8 w-8'>
              <ChevronLeft className='h-4 w-4' />
            </Button>
            <Button variant='ghost' size='icon' onClick={handleNext} className='h-8 w-8'>
              <ChevronRight className='h-4 w-4' />
            </Button>
          </div>
          <span className='font-bold text-sm sm:text-base text-foreground capitalize ms-1'>
            {headerTitle}
          </span>
          {isLoading && (
            <Badge variant='outline' className='text-[10px] animate-pulse border-primary/30 text-primary ms-2'>
              Yuklanmoqda...
            </Badge>
          )}
        </div>

        <div className='flex items-center gap-2 flex-wrap'>
          {/* Doctor Filter (if available) */}
          {doctors.length > 0 && onDoctorChange && (
            <Select value={selectedDoctorId || 'all'} onValueChange={onDoctorChange}>
              <SelectTrigger className='w-[160px] h-8 text-xs bg-background'>
                <SelectValue placeholder='Barcha shifokorlar' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>Barcha shifokorlar</SelectItem>
                {doctors.map((doc) => (
                  <SelectItem key={doc.id} value={doc.id}>
                    Dr. {doc.user?.firstName || ''} {doc.user?.lastName || ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* View Mode Buttons */}
          <div className='flex items-center bg-muted/60 p-0.5 rounded-lg border'>
            <Button
              variant={viewMode === 'day' ? 'default' : 'ghost'}
              size='sm'
              onClick={() => onViewModeChange('day')}
              className='h-7 text-xs px-2.5 rounded-md'
            >
              Kunlik
            </Button>
            <Button
              variant={viewMode === 'week' ? 'default' : 'ghost'}
              size='sm'
              onClick={() => onViewModeChange('week')}
              className='h-7 text-xs px-2.5 rounded-md'
            >
              Haftalik
            </Button>
            <Button
              variant={viewMode === 'month' ? 'default' : 'ghost'}
              size='sm'
              onClick={() => onViewModeChange('month')}
              className='h-7 text-xs px-2.5 rounded-md'
            >
              Oylik
            </Button>
          </div>
        </div>
      </div>

      {/* VIEW: DAY VIEW */}
      {viewMode === 'day' && (
        <DayView
          currentDate={currentDate}
          appointments={filteredAppointments}
          onSelectAppointment={onSelectAppointment}
          onNewAppointmentAt={onNewAppointmentAt}
        />
      )}

      {/* VIEW: WEEK VIEW */}
      {viewMode === 'week' && (
        <WeekView
          weekDays={weekDays}
          appointments={filteredAppointments}
          onSelectAppointment={onSelectAppointment}
          onNewAppointmentAt={onNewAppointmentAt}
          onDayClick={(day) => {
            onDateChange(day)
            onViewModeChange('day')
          }}
        />
      )}

      {/* VIEW: MONTH VIEW */}
      {viewMode === 'month' && (
        <MonthView
          currentDate={currentDate}
          monthDays={monthDays}
          appointments={filteredAppointments}
          onSelectAppointment={onSelectAppointment}
          onDayClick={(day) => {
            onDateChange(day)
            onViewModeChange('day')
          }}
        />
      )}

      {/* Status Legend */}
      <div className='flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground pt-1 px-1'>
        <span className='font-semibold text-foreground'>Holatlar:</span>
        <div className='flex items-center gap-1.5'>
          <span className='w-2 h-2 rounded-full bg-sky-500' />
          <span>Rejalashtirilgan</span>
        </div>
        <div className='flex items-center gap-1.5'>
          <span className='w-2 h-2 rounded-full bg-amber-500' />
          <span>Keldi (Tasdiqlangan)</span>
        </div>
        <div className='flex items-center gap-1.5'>
          <span className='w-2 h-2 rounded-full bg-blue-500' />
          <span>Qabulda (Jarayonda)</span>
        </div>
        <div className='flex items-center gap-1.5'>
          <span className='w-2 h-2 rounded-full bg-emerald-500' />
          <span>Yakunlangan</span>
        </div>
        <div className='flex items-center gap-1.5'>
          <span className='w-2 h-2 rounded-full bg-rose-500' />
          <span>Bekor qilingan / Kelmadi</span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SUBCOMPONENT: DAY VIEW
// ---------------------------------------------------------------------------
function DayView({
  currentDate,
  appointments,
  onSelectAppointment,
  onNewAppointmentAt,
}: {
  currentDate: Date
  appointments: Appointment[]
  onSelectAppointment: (a: Appointment) => void
  onNewAppointmentAt?: (date: Date) => void
}) {
  const dayAppointments = useMemo(() => {
    return appointments.filter((app) => {
      const start = app.scheduledStart
      return start && isSameDay(new Date(start), currentDate)
    })
  }, [appointments, currentDate])

  return (
    <Card className='border shadow-xs overflow-hidden'>
      <CardContent className='p-0'>
        <div className='divide-y'>
          {HOURS.map((hour) => {
            const hourSlotDate = setMinutes(setHours(currentDate, hour), 0)
            const hourApps = dayAppointments.filter((app) => {
              const start = app.scheduledStart
              if (!start) return false
              const appDt = new Date(start)
              return appDt.getHours() === hour
            })

            return (
              <div key={hour} className='flex min-h-[64px] group hover:bg-muted/15 transition-colors'>
                {/* Time Label */}
                <div className='w-20 sm:w-24 p-2.5 text-xs font-mono font-semibold text-muted-foreground border-r flex items-start justify-end pe-3 bg-muted/5'>
                  {String(hour).padStart(2, '0')}:00
                </div>

                {/* Slot Content */}
                <div className='flex-1 p-1.5 flex flex-wrap gap-2 items-start relative'>
                  {hourApps.map((app) => {
                    const status = app.status || 'scheduled'
                    const style = STATUS_COLOR_MAP[status] || STATUS_COLOR_MAP.scheduled
                    const patientName = getPatientName(app)
                    const doctorName = getDoctorName(app)
                    const procedure = getProcedureName(app)

                    const start = app.scheduledStart
                    const end = app.scheduledEnd
                    const timeStr = start && end
                      ? `${format(new Date(start), 'HH:mm')} - ${format(new Date(end), 'HH:mm')}`
                      : ''

                    return (
                      <div
                        key={app.id}
                        onClick={() => onSelectAppointment(app)}
                        className={`cursor-pointer rounded-lg border p-2 text-xs transition-all shadow-xs hover:shadow-md flex-1 min-w-[200px] max-w-sm ${style.bg} ${style.border}`}
                      >
                        <div className='flex items-center justify-between mb-1'>
                          <div className='flex items-center gap-1.5 font-bold text-foreground'>
                            <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                            <span className='truncate'>{patientName}</span>
                          </div>
                          <span className='font-mono text-[10px] text-muted-foreground'>{timeStr}</span>
                        </div>
                        <div className='flex items-center justify-between text-[11px] text-muted-foreground'>
                          <span className='truncate text-foreground/80 font-medium'>{procedure}</span>
                          <span className='truncate ms-2'>Dr. {doctorName}</span>
                        </div>
                      </div>
                    )
                  })}

                  {hourApps.length === 0 && onNewAppointmentAt && (
                    <button
                      type='button'
                      onClick={() => onNewAppointmentAt(hourSlotDate)}
                      className='opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-opacity py-1 px-2 rounded-md hover:bg-muted/40'
                    >
                      <Plus className='h-3.5 w-3.5' /> Navbat qo'shish
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// SUBCOMPONENT: WEEK VIEW
// ---------------------------------------------------------------------------
function WeekView({
  weekDays,
  appointments,
  onSelectAppointment,
  onNewAppointmentAt,
  onDayClick,
}: {
  weekDays: Date[]
  appointments: Appointment[]
  onSelectAppointment: (a: Appointment) => void
  onNewAppointmentAt?: (date: Date) => void
  onDayClick: (date: Date) => void
}) {
  return (
    <Card className='border shadow-xs overflow-x-auto'>
      <div className='min-w-[800px]'>
        {/* Days Header */}
        <div className='grid grid-cols-7 border-b bg-muted/20'>
          {weekDays.map((day) => {
            const today = isToday(day)
            return (
              <div
                key={day.toISOString()}
                onClick={() => onDayClick(day)}
                className={`p-2.5 text-center cursor-pointer hover:bg-muted/40 transition-colors border-r last:border-r-0 ${
                  today ? 'bg-primary/5' : ''
                }`}
              >
                <div className='text-[11px] uppercase font-semibold text-muted-foreground'>
                  {format(day, 'EEE')}
                </div>
                <div
                  className={`text-sm font-bold mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded-full ${
                    today ? 'bg-primary text-primary-foreground' : 'text-foreground'
                  }`}
                >
                  {format(day, 'd')}
                </div>
              </div>
            )
          })}
        </div>

        {/* Days Columns Body */}
        <div className='grid grid-cols-7 min-h-[480px] divide-x'>
          {weekDays.map((day) => {
            const dayApps = appointments.filter((app) => {
              const start = app.scheduledStart
              return start && isSameDay(new Date(start), day)
            })

            return (
              <div key={day.toISOString()} className='p-1.5 space-y-1.5 bg-background flex flex-col group'>
                {dayApps.map((app) => {
                  const status = app.status || 'scheduled'
                  const style = STATUS_COLOR_MAP[status] || STATUS_COLOR_MAP.scheduled
                  const patientName = getPatientName(app)
                  const start = app.scheduledStart
                  const timeStr = start ? format(new Date(start), 'HH:mm') : ''

                  return (
                    <div
                      key={app.id}
                      onClick={() => onSelectAppointment(app)}
                      className={`cursor-pointer rounded-md border p-1.5 text-[11px] transition-all hover:scale-[1.02] shadow-xs ${style.bg} ${style.border}`}
                    >
                      <div className='flex items-center justify-between mb-0.5'>
                        <span className='font-mono font-bold text-foreground'>{timeStr}</span>
                        <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                      </div>
                      <div className='font-semibold text-foreground truncate'>{patientName}</div>
                      <div className='text-[10px] text-muted-foreground truncate'>
                        {getProcedureName(app)}
                      </div>
                    </div>
                  )
                })}

                {dayApps.length === 0 && (
                  <div className='flex-1 flex flex-col items-center justify-center p-4 text-center opacity-40 group-hover:opacity-100 transition-opacity'>
                    {onNewAppointmentAt && (
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={() => onNewAppointmentAt(day)}
                        className='h-7 text-[10px] text-muted-foreground hover:text-primary'
                      >
                        <Plus className='h-3 w-3 mr-1' /> Qo'shish
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// SUBCOMPONENT: MONTH VIEW
// ---------------------------------------------------------------------------
function MonthView({
  currentDate,
  monthDays,
  appointments,
  onSelectAppointment,
  onDayClick,
}: {
  currentDate: Date
  monthDays: Date[]
  appointments: Appointment[]
  onSelectAppointment: (a: Appointment) => void
  onDayClick: (date: Date) => void
}) {
  const weekDayLabels = ['Du', 'Se', 'Chor', 'Pay', 'Ju', 'Sha', 'Yak']

  return (
    <Card className='border shadow-xs overflow-hidden'>
      {/* Weekdays Bar */}
      <div className='grid grid-cols-7 border-b bg-muted/20 text-center text-xs font-semibold py-2 text-muted-foreground'>
        {weekDayLabels.map((lbl) => (
          <div key={lbl}>{lbl}</div>
        ))}
      </div>

      {/* Month Days Grid */}
      <div className='grid grid-cols-7 divide-x divide-y border-b'>
        {monthDays.map((day) => {
          const inCurrentMonth = isSameMonth(day, currentDate)
          const today = isToday(day)

          const dayApps = appointments.filter((app) => {
            const start = app.scheduledStart
            return start && isSameDay(new Date(start), day)
          })

          return (
            <div
              key={day.toISOString()}
              onClick={() => onDayClick(day)}
              className={`min-h-[100px] p-1.5 flex flex-col cursor-pointer transition-colors hover:bg-muted/30 ${
                !inCurrentMonth ? 'bg-muted/10 opacity-40' : 'bg-background'
              } ${today ? 'bg-primary/5' : ''}`}
            >
              <div className='flex items-center justify-between mb-1'>
                <span
                  className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                    today ? 'bg-primary text-primary-foreground' : 'text-foreground'
                  }`}
                >
                  {format(day, 'd')}
                </span>
                {dayApps.length > 0 && (
                  <Badge variant='outline' className='text-[10px] h-4 px-1 font-mono'>
                    {dayApps.length} ta
                  </Badge>
                )}
              </div>

              {/* Day Appointments Previews */}
              <div className='flex-1 space-y-1 overflow-hidden'>
                {dayApps.slice(0, 3).map((app) => {
                  const status = app.status || 'scheduled'
                  const style = STATUS_COLOR_MAP[status] || STATUS_COLOR_MAP.scheduled
                  const patientName = getPatientName(app)
                  const start = app.scheduledStart
                  const timeStr = start ? format(new Date(start), 'HH:mm') : ''

                  return (
                    <div
                      key={app.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectAppointment(app)
                      }}
                      className={`text-[10px] p-1 rounded border truncate flex items-center gap-1 ${style.bg} ${style.border}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                      <span className='font-mono font-semibold'>{timeStr}</span>
                      <span className='truncate'>{patientName}</span>
                    </div>
                  )
                })}

                {dayApps.length > 3 && (
                  <div className='text-[10px] text-muted-foreground text-center font-medium'>
                    +{dayApps.length - 3} ta yana...
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
