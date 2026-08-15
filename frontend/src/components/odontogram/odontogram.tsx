import { useState } from 'react'
import { type ToothRecord, type ToothProcedure, type ToothStatus } from '@/types/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  _DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePatientOdontogramHistory } from '@/api/hooks/use-patients'
import { format } from 'date-fns'

const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11]
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28]
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41]
const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38]

const STATUS_CONFIG: Record<
  ToothStatus,
  { label: string; bg: string; border: string; text: string }
> = {
  healthy: {
    label: "Sog'lom",
    bg: 'bg-emerald-500/10 dark:bg-emerald-500/20',
    border: 'border-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-400',
  },
  treated: {
    label: 'Davolangan',
    bg: 'bg-blue-500/10 dark:bg-blue-500/20',
    border: 'border-blue-500',
    text: 'text-blue-700 dark:text-blue-400',
  },
  planned: {
    label: 'Rejalashtirilgan',
    bg: 'bg-amber-500/10 dark:bg-amber-500/20',
    border: 'border-amber-500',
    text: 'text-amber-700 dark:text-amber-400',
  },
  missing: {
    label: "Yo'q (O'chirilgan)",
    bg: 'bg-rose-500/10 dark:bg-rose-500/20',
    border: 'border-rose-500 opacity-60',
    text: 'text-rose-700 dark:text-rose-400 line-through',
  },
}

const PROCEDURE_LABELS: Record<ToothProcedure, string> = {
  filling: 'Plomba (Filling)',
  root_canal: 'Kanal davolash (Root Canal)',
  extraction: "Tishni olib tashlash (Extraction)",
  crown: 'Koronka (Crown)',
  implant: 'Implant',
  cleaning: 'Tozalash (Cleaning)',
  other: 'Boshqa (Other)',
}

interface OdontogramProps {
  patientId?: string
  toothRecords: ToothRecord[]
  onSaveRecord?: (record: {
    toothNumber: number
    procedure: ToothProcedure
    status: ToothStatus
    notes: string
  }) => Promise<void>
  readOnly?: boolean
}

export function Odontogram({ patientId, toothRecords = [], onSaveRecord, readOnly = false }: OdontogramProps) {
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null)
  const [procedure, setProcedure] = useState<ToothProcedure>('filling')
  const [status, setStatus] = useState<ToothStatus>('treated')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Map of toothNumber -> latest ToothRecord
  const recordMap = new Map<number, ToothRecord>()
  toothRecords.forEach((rec: Record<string, unknown>) => {
    const num = Number(rec.toothNumber ?? rec.tooth_number)
    if (num) {
      recordMap.set(num, rec)
    }
  })

  const handleToothClick = (toothNum: number) => {
    setSelectedTooth(toothNum)
    const existing = recordMap.get(toothNum)
    if (existing) {
      setProcedure(existing.procedure)
      setStatus(existing.status)
      setNotes(existing.notes || '')
    } else {
      setProcedure('filling')
      setStatus('treated')
      setNotes('')
    }
  }

  const handleSave = async () => {
    if (!selectedTooth || !onSaveRecord) return
    setIsSubmitting(true)
    try {
      await onSaveRecord({
        toothNumber: selectedTooth,
        procedure,
        status,
        notes,
      })
      setSelectedTooth(null)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className='flex flex-col gap-6 rounded-xl border bg-card p-6 shadow-sm'>
      {/* Header & Legend */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b pb-4'>
        <div>
          <h3 className='text-lg font-bold tracking-tight'>Odontogram (32 ta Tish Xaritasi)</h3>
          <p className='text-xs text-muted-foreground'>
            FDI raqamlash tizimi. Tish ustiga bosib muolaja va holatni yangilang.
          </p>
        </div>
        <div className='flex flex-wrap gap-2 text-xs'>
          {(Object.keys(STATUS_CONFIG) as ToothStatus[]).map((st) => (
            <Badge
              key={st}
              variant='outline'
              className={`${STATUS_CONFIG[st].bg} ${STATUS_CONFIG[st].border} ${STATUS_CONFIG[st].text} font-medium px-2 py-0.5`}
            >
              {STATUS_CONFIG[st].label}
            </Badge>
          ))}
        </div>
      </div>

      {/* SVG / Teeth Grid Layout */}
      <div className='flex flex-col gap-8 py-2 w-full max-w-full overflow-hidden'>
        {/* Upper Jaw */}
        <div className='flex flex-col gap-2 w-full'>
          <div className='text-center text-xs font-semibold text-muted-foreground uppercase tracking-widest'>
            Yuqori Jag' (Upper Jaw)
          </div>
          <div className='flex justify-start sm:justify-center gap-1.5 sm:gap-2.5 overflow-x-auto pb-2 px-1 w-full snap-x'>
            {UPPER_RIGHT.map((num) => (
              <ToothButton
                key={num}
                toothNumber={num}
                record={recordMap.get(num)}
                onClick={() => handleToothClick(num)}
                readOnly={readOnly}
              />
            ))}
            <div className='w-px bg-border my-1' />
            {UPPER_LEFT.map((num) => (
              <ToothButton
                key={num}
                toothNumber={num}
                record={recordMap.get(num)}
                onClick={() => handleToothClick(num)}
                readOnly={readOnly}
              />
            ))}
          </div>
        </div>

        <div className='border-t border-dashed my-1' />

        {/* Lower Jaw */}
        <div className='flex flex-col gap-2 w-full'>
          <div className='flex justify-start sm:justify-center gap-1.5 sm:gap-2.5 overflow-x-auto pb-2 px-1 w-full snap-x'>
            {LOWER_RIGHT.map((num) => (
              <ToothButton
                key={num}
                toothNumber={num}
                record={recordMap.get(num)}
                onClick={() => handleToothClick(num)}
                readOnly={readOnly}
              />
            ))}
            <div className='w-px bg-border my-1' />
            {LOWER_LEFT.map((num) => (
              <ToothButton
                key={num}
                toothNumber={num}
                record={recordMap.get(num)}
                onClick={() => handleToothClick(num)}
                readOnly={readOnly}
              />
            ))}
          </div>
          <div className='text-center text-xs font-semibold text-muted-foreground uppercase tracking-widest'>
            Pastki Jag' (Lower Jaw)
          </div>
        </div>
      </div>

      {/* Tooth Detail / Edit Modal */}
      <Dialog open={selectedTooth !== null} onOpenChange={(open) => !open && setSelectedTooth(null)}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>Tish #{selectedTooth} - Ma'lumotlar</DialogTitle>
            <DialogDescription>
              Tishning muolaja holati va tarixi.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="edit" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="edit">Joriy Holat</TabsTrigger>
              <TabsTrigger value="history">Tarix</TabsTrigger>
            </TabsList>
            
            <TabsContent value="edit" className="space-y-4 py-2 mt-2">
              <div className='grid gap-4'>
                <div className='space-y-1.5'>
                  <label className='text-xs font-medium'>Holat (Status)</label>
                  <Select value={status} onValueChange={(val) => setStatus(val as ToothStatus)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='healthy'>Sog'lom (Healthy)</SelectItem>
                      <SelectItem value='treated'>Davolangan (Treated)</SelectItem>
                      <SelectItem value='planned'>Rejalashtirilgan (Planned)</SelectItem>
                      <SelectItem value='missing'>Yo'q / O'chirilgan (Missing)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className='space-y-1.5'>
                  <label className='text-xs font-medium'>Muolaja (Procedure)</label>
                  <Select value={procedure} onValueChange={(val) => setProcedure(val as ToothProcedure)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PROCEDURE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className='space-y-1.5'>
                  <label className='text-xs font-medium'>Izoh (Notes)</label>
                  <Textarea
                    placeholder='Tish bo’yicha qo’shimcha izohlar...'
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <Button variant='outline' onClick={() => setSelectedTooth(null)}>
                  Bekor qilish
                </Button>
                {!readOnly && onSaveRecord && (
                  <Button onClick={handleSave} disabled={isSubmitting}>
                    {isSubmitting ? 'Saqlanmoqda...' : 'Saqlash'}
                  </Button>
                )}
              </div>
            </TabsContent>

            <TabsContent value="history" className="mt-2 h-[300px] overflow-y-auto pr-2">
              {patientId && selectedTooth ? (
                <ToothHistoryList patientId={patientId} toothNumber={selectedTooth} />
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  Tarix mavjud emas.
                </div>
              )}
            </TabsContent>
          </Tabs>

        </DialogContent>
      </Dialog>
    </div>
  )
}

function ToothButton({
  toothNumber,
  record,
  onClick,
  readOnly,
}: {
  toothNumber: number
  record?: ToothRecord
  onClick: () => void
  readOnly: boolean
}) {
  const currentStatus: ToothStatus = record?.status || 'healthy'
  const config = STATUS_CONFIG[currentStatus]

  return (
    <button
      type='button'
      onClick={onClick}
      disabled={readOnly}
      className={`group relative flex flex-col items-center justify-between h-20 w-11 sm:w-12 shrink-0 snap-center rounded-lg border-2 p-1.5 transition-all duration-200 hover:scale-105 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 ${config.bg} ${config.border}`}
    >
      <span className='text-[10px] font-bold text-muted-foreground'>{toothNumber}</span>
      <ToothSvg status={currentStatus} />
      <span className={`text-[9px] font-medium leading-none truncate w-full text-center ${config.text}`}>
        {record ? PROCEDURE_LABELS[record.procedure]?.split(' ')[0] || record.procedure : "Sog'lom"}
      </span>
    </button>
  )
}

function ToothSvg({ status }: { status: ToothStatus }) {
  const colorMap: Record<ToothStatus, string> = {
    healthy: '#10b981',
    treated: '#3b82f6',
    planned: '#f59e0b',
    missing: '#f43f5e',
  }

  return (
    <svg viewBox='0 0 24 32' className='h-8 w-6 fill-none stroke-current' strokeWidth='1.5'>
      <path
        d='M6 6C6 3.79086 7.79086 2 10 2H14C16.2091 2 18 3.79086 18 6V14C18 19 16 28 14.5 30C13.5 31.3333 10.5 31.3333 9.5 30C8 28 6 19 6 14V6Z'
        fill={colorMap[status]}
        fillOpacity='0.25'
        stroke={colorMap[status]}
      />
      {status === 'missing' && (
        <path d='M4 4L20 28M20 4L4 28' stroke='#f43f5e' strokeWidth='2' />
      )}
    </svg>
  )
}

function ToothHistoryList({ patientId, toothNumber }: { patientId: string; toothNumber: number }) {
  const { data: history, isLoading, error } = usePatientOdontogramHistory(patientId, toothNumber)

  if (isLoading) return <div className="p-4 text-center text-sm text-muted-foreground">Yuklanmoqda...</div>
  if (error) return <div className="p-4 text-center text-sm text-destructive">Xatolik yuz berdi.</div>
  if (!history || history.length === 0) {
    return <div className="p-4 text-center text-sm text-muted-foreground">Ushbu tish uchun tarix topilmadi.</div>
  }

  return (
    <div className="space-y-4">
      {history.map((record) => (
        <div key={record.id} className="rounded-lg border p-3 text-sm">
          <div className="flex justify-between items-start mb-2">
            <div className="font-medium">
              {record.procedure ? PROCEDURE_LABELS[record.procedure] || record.procedure : 'Sog\'lom'}
              <span className="text-xs text-muted-foreground ml-2">({record.status})</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {format(new Date(record.createdAt), 'dd.MM.yyyy HH:mm')}
            </div>
          </div>
          {record.doctorName && (
            <div className="text-xs text-muted-foreground mb-1">
              Shifokor: {record.doctorName}
            </div>
          )}
          {record.notes && (
            <div className="text-xs bg-muted/50 p-2 rounded-md mt-2">
              {record.notes}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
