import { format } from 'date-fns'
import { Calendar, Activity, CreditCard, FileText, Camera } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface TimelineItem {
  id: string
  type: 'appointment' | 'treatment' | 'payment' | 'prescription' | 'photo'
  title: string
  description?: string
  date: string
  meta?: Record<string, any>
}

interface PatientTimelineProps {
  history: any[]
}

export function PatientTimeline({ history = [] }: PatientTimelineProps) {
  if (!history || history.length === 0) {
    return (
      <div className='flex flex-col items-center justify-center p-8 text-center border rounded-xl bg-card/50'>
        <Calendar className='h-10 w-10 text-muted-foreground/50 mb-2' />
        <p className='text-sm font-medium text-muted-foreground'>Hozircha hech qanday tarix mavjud emas</p>
      </div>
    )
  }

  return (
    <div className='relative ps-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border'>
      {history.map((item: any, idx: number) => {
        const itemType = item.type || 'appointment'
        const icon = getTimelineIcon(itemType)
        const dateStr = item.date || item.createdAt || item.scheduledStart || ''

        return (
          <div key={item.id || idx} className='relative group'>
            {/* Timeline node icon */}
            <div className='absolute -left-[31px] top-0 flex h-7 w-7 items-center justify-center rounded-full border bg-background text-primary shadow-sm group-hover:scale-110 transition-transform'>
              {icon}
            </div>

            <div className='flex flex-col gap-1 rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow'>
              <div className='flex items-center justify-between gap-2'>
                <h4 className='font-semibold text-sm tracking-tight'>
                  {item.title || item.diagnosis || item.description || 'Tarix yozuvi'}
                </h4>
                {dateStr && (
                  <time className='text-[11px] text-muted-foreground font-mono'>
                    {formatDate(dateStr)}
                  </time>
                )}
              </div>

              {item.doctorName && (
                <p className='text-xs text-muted-foreground font-medium'>
                  Shifokor: <span className='text-foreground'>{item.doctorName}</span>
                </p>
              )}

              {item.description && (
                <p className='text-xs text-muted-foreground line-clamp-2 mt-1'>
                  {item.description}
                </p>
              )}

              {item.amount && (
                <div className='mt-2 flex items-center justify-between border-t pt-2 text-xs'>
                  <span className='text-muted-foreground'>To'lov summasi:</span>
                  <Badge variant='outline' className='font-bold text-emerald-600 dark:text-emerald-400'>
                    {Number(item.amount).toLocaleString()} so'm
                  </Badge>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function getTimelineIcon(type: string) {
  switch (type) {
    case 'treatment':
      return <Activity className='h-3.5 w-3.5' />
    case 'payment':
      return <CreditCard className='h-3.5 w-3.5 text-emerald-500' />
    case 'prescription':
      return <FileText className='h-3.5 w-3.5 text-purple-500' />
    case 'photo':
      return <Camera className='h-3.5 w-3.5 text-blue-500' />
    default:
      return <Calendar className='h-3.5 w-3.5 text-amber-500' />
  }
}

function formatDate(dateStr: string) {
  try {
    return format(new Date(dateStr), 'dd.MM.yyyy HH:mm')
  } catch {
    return dateStr
  }
}
