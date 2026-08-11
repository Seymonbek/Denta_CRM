import { useState } from 'react'
import { Plus, Ban, FileText, Wallet, Search, CreditCard, AlertCircle } from 'lucide-react'
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
import { useTreatments } from '@/api/hooks/use-treatments'
import { usePatients } from '@/api/hooks/use-patients'
import { useDoctors } from '@/api/hooks/use-doctors'
import { PaymentMethod } from '@/types/api'
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
  const voidPaymentMutation = useVoidPayment()

  // Merge pending and all treatments for the dropdown so selected item displays correctly
  const allModalTreatments = [...pendingTreatments, ...treatments].filter(
    (t, index, self) => index === self.findIndex((t2) => t2.id === t.id)
  )

  const openPaymentModal = (tId: string, pId: string, amt: string) => {
    setTreatmentId(tId)
    setPatientId(pId)
    setAmount(amt)
    setIsModalOpen(true)
  }

  const handleCreatePayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!treatmentId || !patientId || !amount) {
      toast.error('Davolash yozuvi, bemor va summani kiriting.')
      return
    }

    const idempotencyKey = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    try {
      await createPaymentMutation.mutateAsync({
        data: {
          treatment: treatmentId,
          patient: patientId,
          amount,
          method,
        },
        idempotencyKey,
      })
      toast.success('To’lov muvaffaqiyatli qabul qilindi!')
      setIsModalOpen(false)
      setAmount('')
      setTreatmentId('')
      setPatientId('')
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'To’lovni amalga oshirishda xatolik.')
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
          <Button onClick={() => openPaymentModal('', '', '')} className='shadow'>
            <Plus className='me-2 h-4 w-4' /> Boshqa To'lov Qabul Qilish
          </Button>
        </div>

        {/* Pending Payments Section */}
        {pendingTreatments.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-bold text-amber-600 dark:text-amber-500 mb-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> To'lov Kutilmoqda ({pendingTreatments.length})
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pendingTreatments.map((pt: any) => {
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
              <Table className='min-w-[600px] sm:min-w-full'>
                <TableHeader>
                  <TableRow className='bg-muted/30'>
                    <TableHead className='text-xs font-semibold'>Bemor</TableHead>
                    <TableHead className='text-xs font-semibold'>To'lov Summasi (so'm)</TableHead>
                    <TableHead className='text-xs font-semibold'>To'lov Usuli</TableHead>
                    <TableHead className='text-xs font-semibold'>Qabul Qilingan Vaqt</TableHead>
                    <TableHead className='text-xs font-semibold text-end'>Bekor qilish</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className='text-center py-8 text-xs text-muted-foreground animate-pulse'>
                        To'lovlar yuklanmoqda...
                      </TableCell>
                    </TableRow>
                  ) : payments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className='text-center py-8 text-xs text-muted-foreground'>
                        To'lovlar topilmadi.
                      </TableCell>
                    </TableRow>
                  ) : (
                    payments.map((p: any) => {
                      const patientName = p?.patientName || p?.patient_name || (p?.patient && p.patient && typeof p.patient === 'object' ? `${p.patient.firstName || p.patient.first_name || ''} ${p.patient.lastName || p.patient.last_name || ''}`.trim() : p?.patient) || 'Bemor'
                      const pMethod = p?.method || 'cash'
                      const createdAt = p?.createdAt || p?.created_at || ''

                      return (
                        <TableRow key={p?.id || Math.random()} className='hover:bg-muted/20'>
                          <TableCell className='font-medium text-xs'>
                            <Link
                                to='/patients/$id'
                                params={{ id: String(p?.patient?.id || p?.patient_id || p?.patient) }}
                                className='text-primary hover:underline font-bold'
                              >
                                {patientName}
                              </Link>
                          </TableCell>
                          <TableCell className='text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400'>
                            +{Number(p?.amount || 0).toLocaleString()} so'm
                          </TableCell>
                          <TableCell className='text-xs'>
                            <Badge variant='outline' className='text-[10px]'>
                              {METHOD_LABELS[pMethod] || pMethod}
                            </Badge>
                          </TableCell>
                          <TableCell className='text-xs font-mono text-muted-foreground'>
                            {formatDateSafely(createdAt)}
                          </TableCell>
                          <TableCell className='text-end flex items-center justify-end gap-1.5'>
                            <Button
                              size='sm'
                              variant='outline'
                              className='h-7 text-xs gap-1 border-emerald-500/30 text-emerald-600 hover:bg-emerald-50'
                              onClick={() => {
                                const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1/'
                                const url = `${baseUrl}payments/${p.id}/receipt/`
                                window.open(url, '_blank')
                              }}
                            >
                              <FileText className='h-3.5 w-3.5' /> Chek (PDF)
                            </Button>

                            <Button
                              size='sm'
                              variant='ghost'
                              className='h-7 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50'
                              onClick={() => handleVoid(p.id)}
                            >
                              <Ban className='h-3.5 w-3.5 me-1' /> Bekor qilish
                            </Button>
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
                    {doctors.map((d: any) => (
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

              <div className='rounded-xl border bg-card shadow-sm overflow-hidden'>
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
                      commissions.map((c: any) => {
                        const doctorName = c?.doctorName || c?.doctor_name || (c?.doctor && typeof c.doctor === 'object' ? `${c.doctor.user?.firstName || c.doctor.user?.first_name || ''} ${c.doctor.user?.lastName || c.doctor.user?.last_name || ''}`.trim() : c?.doctor) || 'Shifokor'
                        const calcAt = c?.calculatedAt || c?.calculated_at || ''

                        return (
                          <TableRow key={c?.id || Math.random()}>
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
              <div className='space-y-1'>
                <label className='text-xs font-medium'>Davolash Ishi (Treatment) *</label>
                <Select
                  value={treatmentId}
                  onValueChange={(val) => {
                    setTreatmentId(val)
                    const tr = allModalTreatments.find((t: any) => t.id === val)
                    if (tr) {
                      setPatientId(typeof tr.patient === 'object' ? tr.patient.id : tr.patient)
                      setAmount(tr.price || '')
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder='Davolash ishini tanlang' />
                  </SelectTrigger>
                  <SelectContent>
                    {allModalTreatments.map((t: any) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.patientName || t.patient_name || 'Bemor'} - {t.procedureTypeName || t.procedure_type_name || 'Muolaja'} ({Number(t.price || 0).toLocaleString()} so'm)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className='space-y-1'>
                <label className='text-xs font-medium'>Bemor *</label>
                <Select value={patientId} onValueChange={setPatientId}>
                  <SelectTrigger>
                    <SelectValue placeholder='Bemor' />
                  </SelectTrigger>
                  <SelectContent>
                    {patients.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.firstName || p.first_name} {p.lastName || p.last_name}
                      </SelectItem>
                    ))}
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

                <div className='space-y-1'>
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
