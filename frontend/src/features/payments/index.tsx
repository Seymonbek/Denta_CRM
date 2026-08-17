import { useState, useRef } from 'react'
import { Plus, Ban, _Wallet, _Search, CreditCard, AlertCircle, Printer } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { confirmSwal } from '@/lib/sweetalert'
import { format } from 'date-fns'
import {
  usePayments,
  useCreatePayment,
  useVoidPayment,
  useDoctorCommissions,
  useDoctorCommissionSummary,
} from '@/api/hooks/use-payments'
import { useShiftStore } from '@/stores/shift-store'
import { useTreatments } from '@/api/hooks/use-treatments'
import { usePatients } from '@/api/hooks/use-patients'
import { useDoctors } from '@/api/hooks/use-doctors'
import { type PaymentMethod } from '@/types/api'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { useReactToPrint } from 'react-to-print'
import { ReceiptPrint } from '@/components/print/receipt-print'

const METHOD_LABELS: Record<string, string> = {
  cash: 'Naqd Pul',
  card: 'Plastik Karta',
  payme: 'Payme',
  click: 'Click',
  bank_transfer: 'Bank O’tkazmasi',
}



export function PaymentsList() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('')

  // Form State
  const [treatmentId, setTreatmentId] = useState('')
  const [patientId, setPatientId] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')

  const { data: paymentsData, isLoading } = usePayments()
  const payments = Array.isArray(paymentsData?.results)
    ? paymentsData.results
    : Array.isArray(paymentsData)
    ? paymentsData
    : []

  const { data: treatmentsData } = useTreatments()
  const treatments = Array.isArray(treatmentsData?.results)
    ? treatmentsData.results
    : Array.isArray(treatmentsData)
    ? treatmentsData
    : []

  const { data: pendingTreatmentsData } = useTreatments({ stage: 'completed', payment_status: 'unpaid' })
  const pendingTreatments = Array.isArray(pendingTreatmentsData?.results)
    ? pendingTreatmentsData.results
    : Array.isArray(pendingTreatmentsData)
    ? pendingTreatmentsData
    : []

  const { data: patientsData } = usePatients({ page_size: 100 })
  const patients = Array.isArray(patientsData?.results)
    ? patientsData.results
    : Array.isArray(patientsData)
    ? patientsData
    : []

  const { data: doctorsData = [] } = useDoctors()
  const doctors = Array.isArray(doctorsData) ? doctorsData : []

  const { data: commissionsData = [] } = useDoctorCommissions(selectedDoctorId)
  const commissions = Array.isArray(commissionsData) ? commissionsData : []

  const { data: summary } = useDoctorCommissionSummary(selectedDoctorId)

  const createPaymentMutation = useCreatePayment()
  const printRef = useRef<HTMLDivElement>(null)
  const [paymentToPrint, setPaymentToPrint] = useState<Record<string, unknown> | null>(null)
  
  const handlePrintAction = useReactToPrint({
    // @ts-expect-error react-to-print issue with react 18 refs
    content: () => printRef.current,
    onAfterPrint: () => setPaymentToPrint(null),
  })

  const triggerPrint = (payment: Record<string, unknown>) => {
    setPaymentToPrint(payment)
    setTimeout(() => {
      if (handlePrintAction) handlePrintAction()
    }, 100)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _shiftInfo = useShiftStore((state) => state.shiftInfo)
  const voidPaymentMutation = useVoidPayment()
  const isShiftOpen = useShiftStore(state => state.isShiftOpen)

  const isSubmittingRef = useRef(false)

  // Merge pending and all treatments for the dropdown so selected item displays correctly
  const allModalTreatments = [...pendingTreatments, ...treatments].filter(
    (t, index, self) => index === self.findIndex((t2) => t2.id === t.id)
  )

  const filteredTreatments = patientId 
    ? allModalTreatments.filter((t: Record<string, unknown>) => (t.patient?.id || t.patient) === patientId)
    : allModalTreatments

  const openPaymentModal = (tId: string, pId: string, amt: string) => {
    setTreatmentId(tId)
    setPatientId(pId)
    setAmount(amt)
    setIsModalOpen(true)
  }

  const handleCreatePayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!patientId || !amount) {
      toast.error('Bemor va summani kiriting.')
      return
    }

    if (isSubmittingRef.current) return
    isSubmittingRef.current = true

    const idempotencyKey = `pay_${Date.now()}_${crypto.randomUUID().toString(36).substring(2, 9)}`

    try {
      await createPaymentMutation.mutateAsync({
        data: {
          treatment: treatmentId || undefined,
          patientId: patientId,
          amount: amount.toString().replace(',', '.'),
          method,
        },
        idempotencyKey,
      })
      toast.success('To’lov muvaffaqiyatli qabul qilindi!')
      setIsModalOpen(false)
      setAmount('')
      setTreatmentId('')
      setPatientId('')
    } catch (err: unknown) {
      const errData = (err as Record<string, unknown>)?.response as Record<string, unknown>
      let msg = 'To\'lovni amalga oshirishda xatolik.'
      if (typeof errData?.data === 'string') {
        msg = errData.data
      } else {
        const errObj = (errData?.data || errData || {}) as Record<string, unknown>
        if (errObj?.error) {
          msg = String(errObj.error)
        } else if (errObj?.detail) {
          msg = Array.isArray(errObj.detail) ? String(errObj.detail[0]) : String(errObj.detail)
        } else if (errObj?.amount) {
          msg = Array.isArray(errObj.amount) ? String(errObj.amount[0]) : String(errObj.amount)
        } else if (errObj?.non_field_errors) {
          msg = Array.isArray(errObj.non_field_errors) ? String(errObj.non_field_errors[0]) : String(errObj.non_field_errors)
        } else if (typeof errObj === 'object' && errObj !== null) {
          const firstKey = Object.keys(errObj)[0]
          if (firstKey) {
            const val = errObj[firstKey]
            msg = Array.isArray(val) ? String(val[0]) : String(val)
          }
        }
      }
      toast.error(msg)
    } finally {
      isSubmittingRef.current = false
    }
  }

  const handleVoid = async (id: string) => {
    const isConfirmed = await confirmSwal({
      title: "To'lovni bekor qilmoqchimisiz?",
      text: "Ushbu to'lov bekor qilinadi va kassa balansidan ayiriladi.",
      confirmButtonText: "Ha, bekor qilaman",
    })
    if (!isConfirmed) return

    try {
      await voidPaymentMutation.mutateAsync({ id, reason: 'Xato kiritilgan' })
      toast.success("To'lov bekor qilindi.")
    } catch {
      toast.error("Bekor qilishda xatolik.")
    }
  }

  return (
    <>
      <Header>
        <div className='flex items-center gap-2 me-auto font-bold text-lg tracking-tight'>
          <span>💰 To'lovlar va Komissiyalar</span>
        </div>
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main>
        <div className='mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>Kassa va Komissiya Hisob-kitobi</h1>
            <p className='text-xs text-muted-foreground'>
              Mijozlardan to'lov qabul qilish (Idempotent), to'lovlar tarixi va shifokorlar komissiyasi.
            </p>
          </div>
          <Button onClick={() => openPaymentModal('', '', '')} className='shadow' disabled={!isShiftOpen}>
            <Plus className='me-2 h-4 w-4' /> {isShiftOpen ? "Boshqa To'lov Qabul Qilish" : "Avval smenani oching"}
          </Button>
        </div>

        {/* Pending Payments Section */}
        {pendingTreatments.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-bold text-amber-600 dark:text-amber-500 mb-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> To'lov Kutilmoqda ({pendingTreatments.length})
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pendingTreatments.map((pt: Record<string, unknown>) => {
                const pName = pt.patientName || pt.patient_name || (pt.patient && typeof pt.patient === 'object' ? `${pt.patient.firstName || pt.patient.first_name || ''} ${pt.patient.lastName || pt.patient.last_name || ''}`.trim() : pt.patient) || 'Bemor'
                const doctorName = pt.doctorName || pt.doctor_name || (pt.doctor && typeof pt.doctor === 'object' ? pt.doctor.user?.first_name : '') || 'Shifokor'
                const pId = pt.patient && typeof pt.patient === 'object' ? pt.patient.id : pt.patient
                
                return (
                  <div key={pt.id} className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <Link
                            to='/patients/$id'
                            params={{ id: String(pId) }}
                            className="font-bold text-sm text-primary hover:underline"
                          >
                            {pName}
                        </Link>
                        <Badge variant="outline" className="text-[10px] bg-white dark:bg-black/20 text-amber-600 border-amber-200">
                          To'lanmagan
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1 mb-3">
                        <p>Shifokor: Dr. {doctorName}</p>
                        <p>Muolaja: {pt.procedureTypeName || pt.procedure_type_name || 'Umumiy'}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-amber-200/50 dark:border-amber-900/50 pt-3">
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {Number(pt.price || 0).toLocaleString()} so'm
                      </span>
                      <Button 
                        size="sm" 
                        className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                        onClick={() => openPaymentModal(pt.id, pId, pt.price || '')}
                        disabled={!isShiftOpen}
                      >
                        <CreditCard className="w-3.5 h-3.5 mr-1" /> To'lash
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <Tabs defaultValue='payments' className='space-y-4'>
          <TabsList>
            <TabsTrigger value='payments'>Barcha To'lovlar</TabsTrigger>
            <TabsTrigger value='commissions'>Shifokorlar Komissiyasi</TabsTrigger>
          </TabsList>

          {/* Payments Table with Mobile Responsive Horizontal Scroll */}
          <TabsContent value='payments'>
            <div className='rounded-xl border bg-card shadow-sm overflow-x-auto w-full'>
              <Table className='min-w-[750px] sm:min-w-full'>
                <TableHeader>
                  <TableRow className='bg-muted/30'>
                    <TableHead className='text-xs font-semibold w-20'>#</TableHead>
                    <TableHead className='text-xs font-semibold'>Bemor</TableHead>
                    <TableHead className='text-xs font-semibold'>Muolaja / Shifokor</TableHead>
                    <TableHead className='text-xs font-semibold'>Summa (so'm)</TableHead>
                    <TableHead className='text-xs font-semibold'>Usul</TableHead>
                    <TableHead className='text-xs font-semibold'>Sana</TableHead>
                    <TableHead className='text-xs font-semibold text-end'>Amallar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className='text-center py-8 text-xs text-muted-foreground animate-pulse'>
                        To'lovlar yuklanmoqda...
                      </TableCell>
                    </TableRow>
                  ) : payments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className='text-center py-8 text-xs text-muted-foreground'>
                        To'lovlar topilmadi.
                      </TableCell>
                    </TableRow>
                  ) : (
                    payments.map((p: Record<string, unknown>) => {
                      const patientName = p?.patientName || (p?.patient && typeof p.patient === 'object' ? `${p.patient.firstName || p.patient.first_name || ''} ${p.patient.lastName || p.patient.last_name || ''}`.trim() : '') || 'Bemor'
                      const patientId = p?.patientId || p?.patient?.id || p?.patient || ''
                      const pMethod = p?.method || 'cash'
                      const createdAt = p?.createdAt || p?.created_at || ''
                      const shortId = p?.shortId || String(p?.id || '').replace(/-/g, '').toUpperCase().slice(0, 8)
                      const procedureName = p?.procedureName || ''
                      const doctorName = p?.doctorName || ''
                      const isVoided = p?.isActive === false

                      return (
                        <TableRow key={p?.id} className={`hover:bg-muted/20 ${isVoided ? 'opacity-50' : ''}`}>
                          {/* Short ID */}
                          <TableCell className='text-[10px] font-mono text-muted-foreground'>
                            <span className='bg-muted px-1.5 py-0.5 rounded font-medium'>{shortId}</span>
                          </TableCell>

                          {/* Patient */}
                          <TableCell className='font-medium text-xs'>
                            <Link
                              to='/patients/$id'
                              params={{ id: String(patientId) }}
                              className='text-primary hover:underline font-bold'
                            >
                              {patientName}
                            </Link>
                          </TableCell>

                          {/* Procedure + Doctor */}
                          <TableCell className='text-xs'>
                            {procedureName ? (
                              <div>
                                <p className='font-medium text-foreground'>{procedureName}</p>
                                {doctorName && <p className='text-muted-foreground text-[10px]'>Dr. {doctorName}</p>}
                              </div>
                            ) : doctorName ? (
                              <span className='text-muted-foreground'>Dr. {doctorName}</span>
                            ) : (
                              <span className='text-muted-foreground italic text-[10px]'>Muolajasiz to'lov</span>
                            )}
                          </TableCell>

                          {/* Amount */}
                          <TableCell className='text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400'>
                            +{Number(p?.amount || 0).toLocaleString()} so'm
                          </TableCell>

                          {/* Method */}
                          <TableCell className='text-xs'>
                            <Badge variant='outline' className='text-[10px]'>
                              {METHOD_LABELS[pMethod] || pMethod}
                            </Badge>
                          </TableCell>

                          {/* Date */}
                          <TableCell className='text-xs font-mono text-muted-foreground'>
                            {formatDateSafely(createdAt)}
                          </TableCell>

                          {/* Actions */}
                          <TableCell className='text-end'>
                            <div className='flex items-center justify-end gap-1'>
                              <Button
                                size='sm'
                                variant='outline'
                                className='h-7 text-xs gap-1 border-emerald-500/30 text-emerald-600 hover:bg-emerald-50'
                                onClick={() => triggerPrint(p)}
                              >
                                <Printer className='h-3.5 w-3.5' /> Chek
                              </Button>
                              {!isVoided && (
                                <Button
                                  size='sm'
                                  variant='ghost'
                                  className='h-7 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50'
                                  onClick={() => handleVoid(p.id)}
                                  disabled={!isShiftOpen}
                                >
                                  <Ban className='h-3.5 w-3.5 me-1' /> Bekor
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
          </TabsContent>

          {/* Commissions Tab */}
          <TabsContent value='commissions'>
            <div className='space-y-4'>
              <div className='flex items-center gap-3 bg-card border p-4 rounded-xl shadow-sm'>
                <span className='text-xs font-semibold'>Shifokorni tanlang:</span>
                <Select value={selectedDoctorId} onValueChange={setSelectedDoctorId}>
                  <SelectTrigger className='w-64 text-xs'>
                    <SelectValue placeholder='Shifokor' />
                  </SelectTrigger>
                  <SelectContent>
                    {doctors.map((d: Record<string, unknown>) => (
                      <SelectItem key={d.id} value={d.id}>
                        Dr. {d.user?.firstName || d.user?.first_name || ''} {d.user?.lastName || d.user?.last_name || ''} ({d.specialization})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {summary && (
                  <div className='ms-auto flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-lg'>
                    <span className='text-xs font-medium text-muted-foreground'>Jami Komissiya:</span>
                    <span className='text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400'>
                      {Number(summary.totalCommission ?? summary.total_commission ?? 0).toLocaleString()} so'm
                    </span>
                  </div>
                )}
              </div>

              <div className='rounded-xl border bg-card shadow-sm overflow-x-auto w-full'>
                <Table>
                  <TableHeader>
                    <TableRow className='bg-muted/30'>
                      <TableHead className='text-xs font-semibold'>Shifokor</TableHead>
                      <TableHead className='text-xs font-semibold'>Komissiya Summasi (so'm)</TableHead>
                      <TableHead className='text-xs font-semibold'>Hisoblash Asosi</TableHead>
                      <TableHead className='text-xs font-semibold'>Hisoblangan Vaqt</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!selectedDoctorId ? (
                      <TableRow>
                        <TableCell colSpan={4} className='text-center py-8 text-xs text-muted-foreground'>
                          Komissiyalarni ko'rish uchun yuqorida shifokorni tanlang.
                        </TableCell>
                      </TableRow>
                    ) : commissions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className='text-center py-8 text-xs text-muted-foreground'>
                          Ushbu shifokor uchun komissiyalar mavjud emas.
                        </TableCell>
                      </TableRow>
                    ) : (
                      commissions.map((c: Record<string, unknown>) => {
                        const doctorName = c?.doctorName || c?.doctor_name || (c?.doctor && typeof c.doctor === 'object' ? `${c.doctor.user?.firstName || c.doctor.user?.first_name || ''} ${c.doctor.user?.lastName || c.doctor.user?.last_name || ''}`.trim() : c?.doctor) || 'Shifokor'
                        const calcAt = c?.calculatedAt || c?.calculated_at || ''

                        return (
                          <TableRow key={c?.id}>
                            <TableCell className='text-xs font-medium'>{doctorName}</TableCell>
                            <TableCell className='text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400'>
                              +{Number(c?.amount || 0).toLocaleString()} so'm
                            </TableCell>
                            <TableCell className='text-xs'>
                              <Badge variant='secondary' className='text-[10px]'>
                                {c?.basis === 'from_total' ? 'Umumiy summadan' : 'Sofi foydadan'}
                              </Badge>
                            </TableCell>
                            <TableCell className='text-xs font-mono text-muted-foreground'>
                              {formatDateSafely(calcAt)}
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Create Payment Modal */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className='sm:max-w-md'>
            <DialogHeader>
              <DialogTitle>Mijozdan To'lov Qabul Qilish</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleCreatePayment} className='space-y-3 py-2'>
              <div className='space-y-1 overflow-x-auto w-full'>
                <label className='text-xs font-medium'>Bemor *</label>
                <Select 
                  value={patientId} 
                  onValueChange={(val) => {
                    setPatientId(val)
                    const patientTreatments = allModalTreatments.filter((t: Record<string, unknown>) => (t.patient?.id || t.patient) === val)
                    if (patientTreatments.length === 1) {
                      setTreatmentId(patientTreatments[0].id)
                      setAmount(patientTreatments[0].price || '')
                    } else {
                      setTreatmentId('')
                      setAmount('')
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder='Bemor' />
                  </SelectTrigger>
                  <SelectContent>
                    {patients.map((p: Record<string, unknown>) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.firstName || p.first_name} {p.lastName || p.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className='space-y-1 overflow-x-auto w-full'>
                <label className='text-xs font-medium'>Davolash Ishi (Treatment) *</label>
                <Select
                  value={treatmentId}
                  onValueChange={(val) => {
                    setTreatmentId(val)
                    const tr = allModalTreatments.find((t: Record<string, unknown>) => t.id === val)
                    if (tr) {
                      setPatientId(tr.patient?.id || tr.patient)
                      setAmount(tr.price || '')
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder='Davolash ishini tanlang' />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredTreatments.map((t: Record<string, unknown>) => {
                      const patientName = t.patient ? `${t.patient.firstName || t.patient.first_name || ''} ${t.patient.lastName || t.patient.last_name || ''}`.trim() : 'Bemor'
                      const procedureName = t.procedureType?.name || t.procedure_type?.name || 'Umumiy Muolaja'
                      const dateStr = t.createdAt || t.created_at || ''
                      const dateFormatted = dateStr ? format(new Date(dateStr), 'dd.MM.yy HH:mm') : ''
                      return (
                        <SelectItem key={t.id} value={t.id}>
                          {patientName} - {procedureName} {dateFormatted ? `(${dateFormatted})` : ''} - {Number(t.price || 0).toLocaleString()} so'm
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className='grid grid-cols-2 gap-3'>
                <div className='space-y-1'>
                  <label className='text-xs font-medium'>To'lov Summasi (so'm) *</label>
                  <Input
                    type='number'
                    placeholder='200000'
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </div>

                <div className='space-y-1 overflow-x-auto w-full'>
                  <label className='text-xs font-medium'>To'lov Usuli *</label>
                  <Select value={method} onValueChange={(val) => setMethod(val as PaymentMethod)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='cash'>Naqd Pul</SelectItem>
                      <SelectItem value='card'>Plastik Karta</SelectItem>
                      <SelectItem value='payme'>Payme</SelectItem>
                      <SelectItem value='click'>Click</SelectItem>
                      <SelectItem value='bank_transfer'>Bank O’tkazmasi</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter className='pt-2'>
                <Button type='button' variant='outline' onClick={() => setIsModalOpen(false)}>
                  Bekor qilish
                </Button>
                <Button type='submit' disabled={createPaymentMutation.isPending}>
                  {createPaymentMutation.isPending ? 'To’lanmoqda...' : 'To’lovni Qabul Qilish'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Hidden Print Container */}
        <div style={{ display: 'none' }}>
          {paymentToPrint && <ReceiptPrint ref={printRef} payment={paymentToPrint} />}
        </div>
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
