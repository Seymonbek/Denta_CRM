import { useState } from 'react'
import { CreditCard, Plus, DollarSign, Calculator, ShieldCheck, Ban } from 'lucide-react'
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
import { Payment, PaymentMethod } from '@/types/api'
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

const METHOD_LABELS: Record<PaymentMethod, string> = {
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
  const payments = paymentsData?.results || []

  const { data: treatmentsData } = useTreatments()
  const treatments = treatmentsData?.results || []

  const { data: patientsData } = usePatients()
  const patients = patientsData?.results || []

  const { data: doctors = [] } = useDoctors()

  const { data: commissions = [] } = useDoctorCommissions(selectedDoctorId)
  const { data: summary } = useDoctorCommissionSummary(selectedDoctorId)

  const createPaymentMutation = useCreatePayment()
  const voidPaymentMutation = useVoidPayment()

  const handleCreatePayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!treatmentId || !patientId || !amount) {
      toast.error('Davolash yozuvi, bemor va summani kiriting.')
      return
    }

    // Generate unique Idempotency-Key for safe payment execution
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
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'To’lovni amalga oshirishda xatolik.')
    }
  }

  const handleVoid = async (id: string) => {
    if (!confirm("Ushbu to'lovni bekor qilmoqchimisiz?")) return
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
          <Button onClick={() => setIsModalOpen(true)} className='shadow'>
            <Plus className='me-2 h-4 w-4' /> To'lov Qabul Qilish
          </Button>
        </div>

        <Tabs defaultValue='payments' className='space-y-4'>
          <TabsList>
            <TabsTrigger value='payments'>Barcha To'lovlar</TabsTrigger>
            <TabsTrigger value='commissions'>Shifokorlar Komissiyasi</TabsTrigger>
          </TabsList>

          {/* Payments Table */}
          <TabsContent value='payments'>
            <div className='rounded-xl border bg-card shadow-sm overflow-hidden'>
              <Table>
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
                    payments.map((p: Payment) => (
                      <TableRow key={p.id} className='hover:bg-muted/20'>
                        <TableCell className='font-medium text-xs'>
                          {p.patientName || p.patient}
                        </TableCell>
                        <TableCell className='text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400'>
                          +{Number(p.amount).toLocaleString()} so'm
                        </TableCell>
                        <TableCell className='text-xs'>
                          <Badge variant='outline' className='text-[10px]'>
                            {METHOD_LABELS[p.method] || p.method}
                          </Badge>
                        </TableCell>
                        <TableCell className='text-xs font-mono text-muted-foreground'>
                          {format(new Date(p.createdAt), 'dd.MM.yyyy HH:mm')}
                        </TableCell>
                        <TableCell className='text-end'>
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
                    ))
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
                    {doctors.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        Dr. {d.user?.firstName} {d.user?.lastName} ({d.specialization})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {summary && (
                  <div className='ms-auto flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-lg'>
                    <span className='text-xs font-medium text-muted-foreground'>Jami Komissiya:</span>
                    <span className='text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400'>
                      {Number(summary.totalCommission || 0).toLocaleString()} so'm
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
                      commissions.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className='text-xs font-medium'>{c.doctorName || c.doctor}</TableCell>
                          <TableCell className='text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400'>
                            +{Number(c.amount).toLocaleString()} so'm
                          </TableCell>
                          <TableCell className='text-xs'>
                            <Badge variant='secondary' className='text-[10px]'>
                              {c.basis === 'from_total' ? 'Umumiy summadan' : 'Sofi foydadan'}
                            </Badge>
                          </TableCell>
                          <TableCell className='text-xs font-mono text-muted-foreground'>
                            {format(new Date(c.calculatedAt), 'dd.MM.yyyy HH:mm')}
                          </TableCell>
                        </TableRow>
                      ))
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
                    const tr = treatments.find((t) => t.id === val)
                    if (tr) {
                      setPatientId(tr.patient)
                      setAmount(tr.price)
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder='Davolash ishini tanlang' />
                  </SelectTrigger>
                  <SelectContent>
                    {treatments.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.patientName || 'Bemor'} - {t.procedureTypeName || 'Muolaja'} ({Number(t.price).toLocaleString()} so'm)
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
                    {patients.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.firstName} {p.lastName}
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
