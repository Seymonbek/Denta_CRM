import { useState } from 'react'
import { format, addDays } from 'date-fns'
import { Calendar as CalendarIcon, Clock, CheckCircle2 } from 'lucide-react'
import { AvailableSlot } from '@/types/api'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Badge } from '@/components/ui/badge'

interface ScheduleCalendarProps {
  availableSlots: AvailableSlot[]
  selectedDate: Date
  onDateChange: (date: Date) => void
  onSlotSelect: (slot: AvailableSlot) => void
  isLoadingSlots?: boolean
}

export function ScheduleCalendar({
  availableSlots = [],
  selectedDate,
  onDateChange,
  onSlotSelect,
  isLoadingSlots = false,
}: ScheduleCalendarProps) {
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null)

  const handleSlotClick = (slot: AvailableSlot) => {
    setSelectedSlot(slot)
    onSlotSelect(slot)
  }

  return (
    <div className='grid grid-cols-1 md:grid-cols-2 gap-6 rounded-xl border bg-card p-5 shadow-sm'>
      {/* Calendar Date Picker */}
      <div className='flex flex-col items-center space-y-3 border-b md:border-b-0 md:border-r pb-4 md:pb-0 md:pe-6'>
        <div className='flex items-center gap-2 text-sm font-semibold self-start text-foreground'>
          <CalendarIcon className='h-4 w-4 text-primary' />
          <span>Sana tanlang:</span>
        </div>
        <Calendar
          mode='single'
          selected={selectedDate}
          onSelect={(date) => date && onDateChange(date)}
          className='rounded-md border shadow-sm'
        />
      </div>

      {/* Slots List */}
      <div className='flex flex-col gap-3'>
        <div className='flex items-center justify-between border-b pb-3'>
          <div className='flex items-center gap-2 text-sm font-semibold'>
            <Clock className='h-4 w-4 text-primary' />
            <span>Bo'sh Vaqt Oraliqlari (Slots)</span>
          </div>
          <Badge variant='outline' className='text-xs font-mono'>
            {format(selectedDate, 'dd.MM.yyyy')}
          </Badge>
        </div>

        {isLoadingSlots ? (
          <div className='flex items-center justify-center p-8 text-xs text-muted-foreground animate-pulse'>
            Vaqt oraliklari yuklanmoqda...
          </div>
        ) : availableSlots.length === 0 ? (
          <div className='flex flex-col items-center justify-center p-8 text-center border rounded-lg bg-muted/20'>
            <Clock className='h-8 w-8 text-muted-foreground/40 mb-2' />
            <p className='text-xs font-medium text-muted-foreground'>
              Tanlangan kunga bo'sh vaqt oralig'i topilmadi.
            </p>
          </div>
        ) : (
          <div className='grid grid-cols-2 gap-2 max-h-[280px] overflow-y-auto pe-1'>
            {availableSlots.map((slot, idx) => {
              const startStr = formatSlotTime(slot.start)
              const endStr = formatSlotTime(slot.end)
              const isSelected = selectedSlot?.start === slot.start

              return (
                <Button
                  key={idx}
                  type='button'
                  variant={isSelected ? 'default' : 'outline'}
                  size='sm'
                  onClick={() => handleSlotClick(slot)}
                  className='justify-between text-xs font-mono py-2'
                >
                  <span>{startStr} - {endStr}</span>
                  {isSelected && <CheckCircle2 className='h-3.5 w-3.5 ms-1' />}
                </Button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function formatSlotTime(timeStr: string) {
  try {
    const d = new Date(timeStr)
    return format(d, 'HH:mm')
  } catch {
    return timeStr
  }
}
