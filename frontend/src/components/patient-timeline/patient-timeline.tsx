import { format } from 'date-fns'
import { Calendar, Activity, CreditCard, FileText, Camera } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export function PatientTimeline({ history = [] }: { history: Record<string, unknown>[] }) {
  const items = Array.isArray(history) ? history : []

  if (!items || items.length === 0) {
    return (
      <div className='flex flex-col items-center justify-center p-8 text-center border rounded-xl bg-card/50'>
        <Calendar className='h-10 w-10 text-muted-foreground/50 mb-2' />
        <p className='text-sm font-medium text-muted-foreground'>Hozircha hech qanday tarix mavjud emas</p>
      </div>
    )
  }

  return (
    <div className='relative ps-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border'>
      {items.map((item: Record<string, unknown>, idx: number) => {
        const itemType = item?.type || 'appointment'
        const icon = getTimelineIcon(itemType)
        const dateStr = item?.date || item?.createdAt || item?.created_at || item?.scheduledStart || item?.scheduled_start || ''
        const title = item?.title || item?.diagnosis || item?.procedureName || item?.description || 'Tarix yozuvi'
        const doctorName = item?.doctorName || item?.doctor_name || (item?.doctor ? `Dr. ${item.doctor.firstName || ''} ${item.doctor.lastName || ''}`.trim() : '')
        const description = item?.description || item?.notes || ''
        const amount = item?.amount || item?.totalPrice || item?.total_price

        return (
          <div key={item?.id || idx} className='relative group'>
            {/* Timeline node icon */}
            <div className='absolute -left-[31px] top-0 flex h-7 w-7 items-center justify-center rounded-full border bg-background text-primary shadow-sm group-hover:scale-110 transition-transform'>
              {icon}
            </div>

            <div className='flex flex-col gap-1 rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow'>
              <div className='flex items-center justify-between gap-2'>
                <h4 className='font-semibold text-sm tracking-tight'>
                  {title}
                </h4>
                {dateStr && (
                  <time className='text-[11px] text-muted-foreground font-mono'>
                    {formatDateSafely(dateStr)}
                  </time>
                )}
              </div>

              {doctorName && (
                <p className='text-xs text-muted-foreground font-medium'>
                  Shifokor: <span className='text-foreground'>{doctorName}</span>
                </p>
              )}

              {description && (
                <p className='text-xs text-muted-foreground line-clamp-2 mt-1'>
                  {description}
                </p>
              )}

              {amount != null && (
                <div className='mt-2 flex items-center justify-between border-t pt-2 text-xs'>
                  <span className='text-muted-foreground'>To'lov summasi:</span>
                  <Badge variant='outline' className='font-bold text-emerald-600 dark:text-emerald-400'>
                    {Number(amount).toLocaleString()} so'm
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

function formatDateSafely(dateStr: string) {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return String(dateStr)
    return format(d, 'dd.MM.yyyy HH:mm')
  } catch {
    return String(dateStr)
  }
}
