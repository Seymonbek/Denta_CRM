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

const PRIMARY_UPPER_RIGHT = [55, 54, 53, 52, 51]
const PRIMARY_UPPER_LEFT = [61, 62, 63, 64, 65]
const PRIMARY_LOWER_RIGHT = [85, 84, 83, 82, 81]
const PRIMARY_LOWER_LEFT = [71, 72, 73, 74, 75]

export const TOOTH_SURFACES = [
  { code: 'O', label: 'Oklyuzal / Kesuvchi (O)' },
  { code: 'M', label: 'Medial / Old (M)' },
  { code: 'D', label: 'Distal / Orqa (D)' },
  { code: 'V', label: 'Vestibulyar / Lab (V)' },
  { code: 'L', label: 'Lingval / Tanglay (L)' },
]

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
    surfaces?: string[]
    notes: string
  }) => Promise<void>
  readOnly?: boolean
}

export function Odontogram({ patientId, toothRecords = [], onSaveRecord, readOnly = false }: OdontogramProps) {
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null)
  const [procedure, setProcedure] = useState<ToothProcedure>('filling')
  const [status, setStatus] = useState<ToothStatus>('treated')
  const [surfaces, setSurfaces] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [dentition, setDentition] = useState<'adult' | 'primary' | 'all'>('adult')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showFullHistory, setShowFullHistory] = useState(false)

  // Map of toothNumber -> latest ToothRecord
  const recordMap = new Map<number, ToothRecord>()
  toothRecords.forEach((rec: ToothRecord) => {
    const num = Number(rec.toothNumber)
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
      setSurfaces(existing.surfaces || [])
      setNotes(existing.notes || '')
    } else {
      setProcedure('filling')
      setStatus('treated')
      setSurfaces([])
      setNotes('')
    }
  }

  const toggleSurface = (code: string) => {
    setSurfaces(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    )
  }

  const handleSave = async () => {
    if (!selectedTooth || !onSaveRecord) return
    setIsSubmitting(true)
    try {
      await onSaveRecord({
        toothNumber: selectedTooth,
        procedure,
        status,
        surfaces,
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
        <div className='space-y-1'>
          <div className='flex items-center gap-3'>
            <h3 className='text-lg font-bold tracking-tight'>Odontogram (Tish Xaritasi)</h3>
            {/* Dentition selector */}
            <div className='inline-flex rounded-lg border bg-muted p-0.5 text-xs'>
              <button
                type='button'
                onClick={() => setDentition('adult')}
                className={`rounded-md px-2 py-1 font-medium transition-all ${
                  dentition === 'adult'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Doimiy (32)
              </button>
              <button
                type='button'
                onClick={() => setDentition('primary')}
                className={`rounded-md px-2 py-1 font-medium transition-all ${
                  dentition === 'primary'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Sut tishlari (20)
              </button>
              <button
                type='button'
                onClick={() => setDentition('all')}
                className={`rounded-md px-2 py-1 font-medium transition-all ${
                  dentition === 'all'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Aralash (Barchasi)
              </button>
            </div>
          </div>
          <p className='text-xs text-muted-foreground'>
            FDI xalqaro raqamlash tizimi. Tish ustiga bosib holat, sirtlar va muolajani belgilang.
          </p>
        </div>
        <div className='flex flex-wrap gap-2 text-xs'>
          {patientId && (
            <Button variant="outline" size="sm" onClick={() => setShowFullHistory(true)} className="mr-2 h-7 px-3 text-xs">
              Barcha tishlar tarixi
            </Button>
          )}
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
      <div className='flex flex-col gap-6 py-2 w-full max-w-full overflow-hidden'>
        {/* Upper Adult Jaw */}
        {(dentition === 'adult' || dentition === 'all') && (
          <div className='flex flex-col gap-2 w-full'>
            <div className='text-center text-xs font-semibold text-muted-foreground uppercase tracking-widest'>
              Yuqori Doimiy Jag' (Upper Adult Jaw)
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
        )}

        {/* Upper Primary Jaw */}
        {(dentition === 'primary' || dentition === 'all') && (
          <div className='flex flex-col gap-2 w-full'>
            <div className='text-center text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-widest'>
              Yuqori Sut Tishlari (Upper Primary Teeth)
            </div>
            <div className='flex justify-start sm:justify-center gap-1.5 sm:gap-2.5 overflow-x-auto pb-2 px-1 w-full snap-x'>
              {PRIMARY_UPPER_RIGHT.map((num) => (
                <ToothButton
                  key={num}
                  toothNumber={num}
                  record={recordMap.get(num)}
                  onClick={() => handleToothClick(num)}
                  readOnly={readOnly}
                />
              ))}
              <div className='w-px bg-border my-1' />
              {PRIMARY_UPPER_LEFT.map((num) => (
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
        )}

        <div className='border-t border-dashed my-1' />

        {/* Lower Primary Jaw */}
        {(dentition === 'primary' || dentition === 'all') && (
          <div className='flex flex-col gap-2 w-full'>
            <div className='flex justify-start sm:justify-center gap-1.5 sm:gap-2.5 overflow-x-auto pb-2 px-1 w-full snap-x'>
              {PRIMARY_LOWER_RIGHT.map((num) => (
                <ToothButton
                  key={num}
                  toothNumber={num}
                  record={recordMap.get(num)}
                  onClick={() => handleToothClick(num)}
                  readOnly={readOnly}
                />
              ))}
              <div className='w-px bg-border my-1' />
              {PRIMARY_LOWER_LEFT.map((num) => (
                <ToothButton
                  key={num}
                  toothNumber={num}
                  record={recordMap.get(num)}
                  onClick={() => handleToothClick(num)}
                  readOnly={readOnly}
                />
              ))}
            </div>
            <div className='text-center text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-widest'>
              Pastki Sut Tishlari (Lower Primary Teeth)
            </div>
          </div>
        )}

        {/* Lower Adult Jaw */}
        {(dentition === 'adult' || dentition === 'all') && (
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
              Pastki Doimiy Jag' (Lower Adult Jaw)
            </div>
          </div>
        )}
      </div>

      {/* Tooth Detail / Edit Modal */}
      <Dialog open={selectedTooth !== null} onOpenChange={(open) => !open && setSelectedTooth(null)}>
        <DialogContent className='sm:max-w-md max-w-[95vw] max-h-[85vh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>
              Tish #{selectedTooth} {selectedTooth && selectedTooth >= 51 && selectedTooth <= 85 ? "(Sut tishi)" : "(Doimiy tish)"} - Holati va Tarixi
            </DialogTitle>
            <DialogDescription>
              FDI #{selectedTooth} tishining klinik muolaja holati va sirtlari.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue={!onSaveRecord ? "history" : "edit"} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="edit">Joriy Holat</TabsTrigger>
              <TabsTrigger value="history">Tarix</TabsTrigger>
            </TabsList>
            
            <TabsContent value="edit" className="space-y-4 py-2 mt-2">
              {onSaveRecord && !readOnly ? (
                <div className='grid gap-3'>
                  <div className='space-y-1.5'>
                    <label className='text-xs font-medium'>Holat (Status)</label>
                    <Select value={status} onValueChange={(val) => setStatus(val as ToothStatus)}>
                      <SelectTrigger className='text-xs h-9'>
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
                      <SelectTrigger className='text-xs h-9'>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(PROCEDURE_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k} className='text-xs'>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className='space-y-1.5'>
                    <label className='text-xs font-medium'>Zararlangan / Muolaja sirtlari (Surfaces)</label>
                    <div className='flex flex-wrap gap-1.5'>
                      {TOOTH_SURFACES.map((s) => {
                        const isSelected = surfaces.includes(s.code)
                        return (
                          <button
                            key={s.code}
                            type='button'
                            onClick={() => toggleSurface(s.code)}
                            className={`px-2 py-1 text-xs rounded-md border font-medium transition-all ${
                              isSelected
                                ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                                : 'bg-muted/40 hover:bg-muted text-muted-foreground border-border'
                            }`}
                          >
                            {s.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className='space-y-1.5'>
                    <label className='text-xs font-medium'>Izoh (Notes)</label>
                    <Textarea
                      placeholder='Tish bo’yicha qo’shimcha izohlar...'
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      className='text-xs'
                    />
                  </div>

                  <div className="flex justify-end space-x-2 pt-2">
                    <Button variant='outline' size='sm' onClick={() => setSelectedTooth(null)}>
                      Bekor qilish
                    </Button>
                    <Button size='sm' onClick={handleSave} disabled={isSubmitting}>
                      {isSubmitting ? 'Saqlanmoqda...' : 'Saqlash'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className='space-y-3 py-1'>
                  <div className='rounded-xl border bg-muted/20 p-4 space-y-2.5'>
                    <div className='flex justify-between items-center'>
                      <span className='text-xs text-muted-foreground'>Joriy Holati:</span>
                      <Badge className={STATUS_CONFIG[status]?.bg + ' ' + STATUS_CONFIG[status]?.text + ' border'}>
                        {STATUS_CONFIG[status]?.label || status}
                      </Badge>
                    </div>
                    <div className='flex justify-between items-center'>
                      <span className='text-xs text-muted-foreground'>Muolaja Turi:</span>
                      <span className='text-xs font-medium'>{PROCEDURE_LABELS[procedure] || procedure}</span>
                    </div>
                    {surfaces && surfaces.length > 0 && (
                      <div className='flex justify-between items-center'>
                        <span className='text-xs text-muted-foreground'>Muolaja sirtlari:</span>
                        <span className='text-xs font-semibold text-primary font-mono'>{surfaces.join(', ')}</span>
                      </div>
                    )}
                    {notes && (
                      <div className='pt-2 border-t text-xs text-muted-foreground'>
                        <span className='font-medium text-foreground block mb-0.5'>Izoh:</span>
                        {notes}
                      </div>
                    )}
                  </div>
                  <div className='flex justify-end pt-1'>
                    <Button variant='outline' size='sm' onClick={() => setSelectedTooth(null)}>
                      Yopish
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="history" className="mt-2 max-h-[300px] overflow-y-auto pr-1">
              {patientId && selectedTooth ? (
                <ToothHistoryList patientId={patientId} toothNumber={selectedTooth} />
              ) : (
                <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">
                  Tarix mavjud emas.
                </div>
              )}
            </TabsContent>
          </Tabs>

        </DialogContent>
      </Dialog>
      {/* Full History Modal */}
      <Dialog open={showFullHistory} onOpenChange={setShowFullHistory}>
        <DialogContent className='sm:max-w-2xl max-h-[80vh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>Barcha Tishlar Tarixi</DialogTitle>
            <DialogDescription>
              Bemorning barcha tishlari bo'yicha oldingi qilingan muolajalar va o'zgarishlar tarixi.
            </DialogDescription>
          </DialogHeader>
          {patientId ? (
            <FullToothHistoryList patientId={patientId} />
          ) : (
            <div className="text-center text-sm text-muted-foreground p-4">Bemor tanlanmagan</div>
          )}
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
  const isPrimary = toothNumber >= 51 && toothNumber <= 85

  return (
    <button
      type='button'
      onClick={onClick}
      disabled={readOnly}
      className={`group relative flex flex-col items-center justify-between h-20 w-11 sm:w-12 shrink-0 snap-center rounded-lg border-2 p-1.5 transition-all duration-200 hover:scale-105 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 ${config.bg} ${config.border} ${isPrimary ? 'border-dashed border-amber-500/80' : ''}`}
    >
      <div className='flex items-center justify-between w-full px-0.5'>
        <span className='text-[10px] font-bold text-muted-foreground'>{toothNumber}</span>
        {isPrimary && <span className='text-[7px] font-bold text-amber-600 dark:text-amber-400'>SUT</span>}
      </div>
      <ToothSvg status={currentStatus} />
      <div className='flex flex-col items-center w-full'>
        {record?.surfaces && record.surfaces.length > 0 && (
          <span className='text-[8px] font-mono font-bold text-primary leading-none mb-0.5 tracking-tighter'>
            {record.surfaces.join('')}
          </span>
        )}
        <span className={`text-[9px] font-medium leading-none truncate w-full text-center ${config.text}`}>
          {record ? PROCEDURE_LABELS[record.procedure]?.split(' ')[0] || record.procedure : "Sog'lom"}
        </span>
      </div>
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

  if (isLoading) return <div className="p-3 text-center text-xs text-muted-foreground">Yuklanmoqda...</div>
  if (error) return <div className="p-3 text-center text-xs text-destructive">Xatolik yuz berdi.</div>
  if (!history || history.length === 0) {
    return <div className="p-3 text-center text-xs text-muted-foreground">Ushbu tish uchun tarix topilmadi.</div>
  }

  return (
    <div className="space-y-2">
      {history.map((record) => (
        <div key={record.id} className="rounded-lg border bg-card p-2.5 text-xs shadow-2xs">
          <div className="flex justify-between items-center mb-1">
            <div className="font-semibold text-foreground flex items-center gap-1.5 flex-wrap">
              <span>{record.procedure ? PROCEDURE_LABELS[record.procedure] || record.procedure : 'Sog\'lom'}</span>
              <Badge variant="outline" className="text-[10px] py-0 px-1 font-normal">
                {record.status}
              </Badge>
              {record.surfaces && record.surfaces.length > 0 && (
                <Badge variant="secondary" className="text-[10px] py-0 px-1 font-mono text-primary font-bold">
                  {record.surfaces.join(', ')}
                </Badge>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground font-mono">
              {record.createdAt ? format(new Date(record.createdAt), 'dd.MM.yyyy HH:mm') : ''}
            </div>
          </div>
          {record.doctorName && (
            <div className="text-[11px] text-muted-foreground">
              Shifokor: {record.doctorName}
            </div>
          )}
          {record.notes && (
            <div className="text-[11px] bg-muted/40 p-1.5 rounded mt-1.5 text-foreground/80">
              {record.notes}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function FullToothHistoryList({ patientId }: { patientId: string }) {
  const { data: history, isLoading, error } = usePatientOdontogramHistory(patientId)

  if (isLoading) return <div className="p-4 text-center text-xs text-muted-foreground">Yuklanmoqda...</div>
  if (error) return <div className="p-4 text-center text-xs text-destructive">Xatolik yuz berdi.</div>
  if (!history || history.length === 0) {
    return <div className="p-4 text-center text-xs text-muted-foreground">Bemorda tish xaritasi tarixi mavjud emas.</div>
  }

  return (
    <div className="space-y-2.5">
      {history.map((record) => (
        <div key={record.id} className="rounded-lg border bg-card p-3 text-xs shadow-2xs">
          <div className="flex justify-between items-center mb-1.5 pb-1.5 border-b border-dashed">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10 text-primary font-bold text-xs">
                #{record.toothNumber}
              </div>
              <span className="font-semibold text-xs">
                {record.procedure ? PROCEDURE_LABELS[record.procedure] || record.procedure : 'Sog\'lom'}
              </span>
              <Badge variant="outline" className="text-[10px] py-0 px-1">{record.status}</Badge>
              {record.surfaces && record.surfaces.length > 0 && (
                <Badge variant="secondary" className="text-[10px] py-0 px-1 font-mono text-primary font-bold">
                  {record.surfaces.join(', ')}
                </Badge>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground font-mono">
              {record.createdAt ? format(new Date(record.createdAt), 'dd.MM.yyyy HH:mm') : ''}
            </div>
          </div>
          
          <div className="space-y-1">
            {record.doctorName && (
              <div className="text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">Shifokor:</span> {record.doctorName}
              </div>
            )}
            {record.notes && (
              <div className="text-[11px] bg-muted/40 p-1.5 rounded text-foreground/80">
                {record.notes}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
