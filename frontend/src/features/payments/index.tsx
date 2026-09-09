import { useState, useRef, useEffect } from 'react'
import {
  Plus,
  Ban,
  CreditCard,
  AlertCircle,
  Printer,
  Search,
  X,
  Download,
  Wallet,
  TrendingUp,
  Users,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { confirmSwal } from '@/lib/sweetalert'
import { format } from 'date-fns'
import { TablePagination } from '@/components/ui/table-pagination'
import {
  usePayments,
  useCreatePayment,
  useVoidPayment,
  useDoctorCommissions,
  useDoctorCommissionSummary,
  useDebtors,
  usePaymentStats,
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

  // Search, Filter & Pagination State
  const [searchTerm, setSearchTerm] = useState('')
  const [methodFilter, setMethodFilter] = useState<string>('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  useEffect(() => {
    setPage(1)
  }, [searchTerm, methodFilter])

  // Form State
  const [treatmentId, setTreatmentId] = useState('')
  const [patientId, setPatientId] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')

  const { data: paymentsData, isLoading } = usePayments({
    search: searchTerm.trim() || undefined,
    method: methodFilter && methodFilter !== 'all' ? methodFilter : undefined,
    page,
    page_size: pageSize,
  })
  const payments = Array.isArray(paymentsData?.results)
    ? paymentsData.results
    : Array.isArray(paymentsData)
    ? paymentsData
    : []
  const totalCount = paymentsData?.count ?? payments.length

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

  // Debtors & Kassa Stats State
  const [debtorSearch, setDebtorSearch] = useState('')
  const [expandedDebtorId, setExpandedDebtorId] = useState<string | null>(null)
  const { data: debtorsData, isLoading: isDebtorsLoading } = useDebtors(debtorSearch)
  const { data: statsData } = usePaymentStats()

  const handleQuickPayDebtor = (debtor: any) => {
    const firstUnpaid = debtor.unpaidTreatments && debtor.unpaidTreatments.length > 0 ? debtor.unpaidTreatments[0] : null
    const tId = firstUnpaid ? firstUnpaid.id : ''
    const amt = firstUnpaid ? String(firstUnpaid.debtAmount || firstUnpaid.price) : String(debtor.debtAmount || '')
    openPaymentModal(tId, debtor.patientId, amt)
  }

  const exportPaymentsToCSV = () => {
    if (payments.length === 0) {
      toast.error("Eksport qilish uchun to'lovlar mavjud emas")
      return
    }

    const headers = ["ID", "Bemor", "Telefon", "Shifokor", "Muolaja", "Summa (so'm)", "To'lov usuli", "Sana"]
    const rows = payments.map((p: any) => {
      const patientName = String(p?.patientName || (p?.patient && typeof p.patient === 'object' ? `${p.patient.firstName || ''} ${p.patient.lastName || ''}`.trim() : '') || 'Bemor')
      const phone = String(p?.patient?.phoneNumber || p?.patientPhone || '-')
      const doctorName = String(p?.doctorName || '-')
      const procName = String(p?.procedureName || '-')
      const amount = String(p?.amount || 0)
      const pMethod = String(p?.method || 'cash')
      const method = (METHOD_LABELS as Record<string, string>)[pMethod] || pMethod
      const date = p?.createdAt ? format(new Date(p.createdAt), 'dd.MM.yyyy HH:mm') : '-'

      return [
        p.id,
        `"${patientName}"`,
        `"${phone}"`,
        `"${doctorName}"`,
        `"${procName}"`,
        amount,
        `"${method}"`,
        `"${date}"`
      ]
    })

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `denta_tolovlar_${format(new Date(), 'yyyy_MM_dd')}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast.success("To'lovlar CSV formatida yuklab olindi")
  }

  const createPaymentMutation = useCreatePayment()
  const printRef = useRef<HTMLDivElement>(null)
  const [paymentToPrint, setPaymentToPrint] = useState<any>(null)
  
  const handlePrintAction = useReactToPrint({
    // @ts-expect-error react-to-print issue with react 18 refs
    content: () => printRef.current,
    onAfterPrint: () => setPaymentToPrint(null),
  })

  const triggerPrint = (payment: any) => {
    setPaymentToPrint(payment)
    setTimeout(() => {
      if (handlePrintAction) handlePrintAction()
    }, 100)
  }

  const voidPaymentMutation = useVoidPayment()
  const isShiftOpen = useShiftStore(state => state.isShiftOpen)

  const isSubmittingRef = useRef(false)

  // Merge pending and all treatments for the dropdown so selected item displays correctly
  const allModalTreatments = [...pendingTreatments, ...treatments].filter(
    (t, index, self) => index === self.findIndex((t2) => t2.id === t.id)
  )

  const filteredTreatments = patientId 
    ? allModalTreatments.filter((t: any) => (t.patient?.id || t.patient) === patientId)
    : allModalTreatments

  const [isSplitMode, setIsSplitMode] = useState(false)
  const [splitCash, setSplitCash] = useState('')
  const [splitCard, setSplitCard] = useState('')
  const [splitClick, setSplitClick] = useState('')
  const [splitPayme, setSplitPayme] = useState('')

  const openPaymentModal = (tId: string, pId: string, amt: string) => {
    setTreatmentId(tId)
    setPatientId(pId)
    setAmount(amt)
    setSplitCash(amt || '')
    setSplitCard('')
    setSplitClick('')
    setSplitPayme('')
    setIsSplitMode(false)
    setIsModalOpen(true)
  }

  const totalSplit = Number(splitCash || 0) + Number(splitCard || 0) + Number(splitClick || 0) + Number(splitPayme || 0)
  const targetAmount = Number(amount || 0)

  const handleCreatePayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!patientId) {
      toast.error('Bemorni tanlang.')
      return
    }

    if (isSubmittingRef.current) return
    isSubmittingRef.current = true

    try {
      if (!isSplitMode) {
        if (!amount || Number(amount) <= 0) {
          toast.error('To\'lov summasini kiriting.')
          isSubmittingRef.current = false
          return
        }

        const idempotencyKey = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
        const res = await createPaymentMutation.mutateAsync({
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
        if (res) triggerPrint(res)
      } else {
        // Split Mode Validation
        if (totalSplit <= 0) {
          toast.error('Aralash to\'lov summasini kiriting.')
          isSubmittingRef.current = false
          return
        }

        const splitItems: { amount: string; method: PaymentMethod }[] = []
        if (Number(splitCash) > 0) splitItems.push({ amount: splitCash, method: 'cash' })
        if (Number(splitCard) > 0) splitItems.push({ amount: splitCard, method: 'card' })
        if (Number(splitClick) > 0) splitItems.push({ amount: splitClick, method: 'click' })
        if (Number(splitPayme) > 0) splitItems.push({ amount: splitPayme, method: 'payme' })

        let lastRes: any = null
        for (const item of splitItems) {
          const idempotencyKey = `pay_split_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
          lastRes = await createPaymentMutation.mutateAsync({
            data: {
              treatment: treatmentId || undefined,
              patientId: patientId,
              amount: item.amount.toString().replace(',', '.'),
              method: item.method,
            },
            idempotencyKey,
          })
        }

        toast.success(`Aralash to'lov muvaffaqiyatli qabul qilindi (${splitItems.length} ta usulda)!`)
        setIsModalOpen(false)
        if (lastRes) triggerPrint(lastRes)
      }

      setAmount('')
      setTreatmentId('')
      setPatientId('')
    } catch (err: any) {
      const errData = err?.response as Record<string, unknown>
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

        {/* Cash Shift Status Banner */}
        {!isShiftOpen ? (
          <div className='mb-4 p-3.5 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs'>
            <div className='flex items-center gap-2.5 text-amber-800 dark:text-amber-300'>
              <AlertCircle className='h-4 w-4 shrink-0 text-amber-600' />
              <span>
                <strong>Diqqat!</strong> Kassa smenasi ochilmagan. Yangi to'lovlarni qabul qilish va kassa hisob-kitobini yuritish uchun avval smenani oching.
              </span>
            </div>
            <Button asChild size='sm' variant='outline' className='h-7 text-xs border-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50 self-start sm:self-auto shrink-0'>
              <Link to='/cash-shifts'>Kassani Ochish &rarr;</Link>
            </Button>
          </div>
        ) : (
          <div className='mb-4 p-2.5 px-4 rounded-xl border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900/40 flex items-center justify-between text-xs'>
            <div className='flex items-center gap-2 text-emerald-700 dark:text-emerald-300'>
              <CheckCircle2 className='h-4 w-4 shrink-0 text-emerald-600' />
              <span>Kassa Smenasi faol holatda. Yangi to'lovlar ushbu smenaga qayd etiladi.</span>
            </div>
            <Link to='/cash-shifts' className='text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline'>
              Smenani boshqarish &rarr;
            </Link>
          </div>
        )}

        {/* Financial KPI Summary Cards */}
        <div className='grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6'>
          {/* Bugungi Jami Tushum */}
          <div className='rounded-xl border bg-card p-4 shadow-xs flex flex-col justify-between'>
            <div className='flex items-center justify-between text-muted-foreground mb-1'>
              <span className='text-xs font-medium'>Bugungi Tushum</span>
              <TrendingUp className='h-4 w-4 text-emerald-500' />
            </div>
            <div>
              <div className='text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400'>
                {Number(statsData?.todayTotal || 0).toLocaleString()} so'm
              </div>
              <p className='text-[10px] text-muted-foreground mt-0.5'>
                Bugungi tranzaksiyalar: {statsData?.todayCount || 0} ta
              </p>
            </div>
          </div>

          {/* Naqd Pul */}
          <div className='rounded-xl border bg-card p-4 shadow-xs flex flex-col justify-between'>
            <div className='flex items-center justify-between text-muted-foreground mb-1'>
              <span className='text-xs font-medium'>Bugun Naqd</span>
              <Wallet className='h-4 w-4 text-blue-500' />
            </div>
            <div>
              <div className='text-xl font-bold font-mono'>
                {Number(statsData?.todayCash || 0).toLocaleString()} so'm
              </div>
              <p className='text-[10px] text-muted-foreground mt-0.5'>
                Kassadagi naqd tushum
              </p>
            </div>
          </div>

          {/* Karta & Onlayn */}
          <div className='rounded-xl border bg-card p-4 shadow-xs flex flex-col justify-between'>
            <div className='flex items-center justify-between text-muted-foreground mb-1'>
              <span className='text-xs font-medium'>Karta & Onlayn</span>
              <CreditCard className='h-4 w-4 text-purple-500' />
            </div>
            <div>
              <div className='text-xl font-bold font-mono'>
                {(Number(statsData?.todayCard || 0) + Number(statsData?.todayClick || 0) + Number(statsData?.todayPayme || 0)).toLocaleString()} so'm
              </div>
              <p className='text-[10px] text-muted-foreground mt-0.5 truncate'>
                Terminal: {Number(statsData?.todayCard || 0).toLocaleString()} | Onlayn: {(Number(statsData?.todayClick || 0) + Number(statsData?.todayPayme || 0)).toLocaleString()}
              </p>
            </div>
          </div>

          {/* Umumiy Qarzdorlik */}
          <div className='rounded-xl border bg-card p-4 shadow-xs flex flex-col justify-between bg-amber-50/30 dark:bg-amber-950/10 border-amber-200/60 dark:border-amber-900/40'>
            <div className='flex items-center justify-between text-amber-700 dark:text-amber-400 mb-1'>
              <span className='text-xs font-medium'>Klinika Qarzdorligi</span>
              <Users className='h-4 w-4 text-amber-600' />
            </div>
            <div>
              <div className='text-xl font-bold font-mono text-amber-600 dark:text-amber-500'>
                {Number(debtorsData?.totalDebtAmount || 0).toLocaleString()} so'm
              </div>
              <p className='text-[10px] text-muted-foreground mt-0.5'>
                Qarzdor bemorlar: {debtorsData?.totalDebtorsCount || 0} nafar
              </p>
            </div>
          </div>
        </div>

        <Tabs defaultValue='payments' className='space-y-4'>
          <TabsList className='flex-wrap'>
            <TabsTrigger value='payments'>Barcha To'lovlar ({totalCount})</TabsTrigger>
            <TabsTrigger value='debtors' className='relative'>
              Qarzdorlar
              {debtorsData?.totalDebtorsCount ? (
                <Badge variant='destructive' className='ml-1.5 px-1.5 py-0 text-[10px] h-4 leading-none'>
                  {debtorsData.totalDebtorsCount}
                </Badge>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value='pending'>
              To'lov Kutilmoqda ({pendingTreatments.length})
            </TabsTrigger>
            <TabsTrigger value='commissions'>Shifokorlar Komissiyasi</TabsTrigger>
          </TabsList>

          {/* Payments Table with Mobile Responsive Horizontal Scroll */}
          <TabsContent value='payments'>
            {/* Search & Method Filter */}
            <div className='mb-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 flex-wrap'>
              <div className='flex items-center gap-2.5 flex-1 min-w-[240px] max-w-md'>
                <div className='relative w-full'>
                  <Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
                  <Input
                    type='text'
                    placeholder='Bemor ismi, telefon yoki chek №...'
                    className='pl-8 h-9 text-xs'
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  {searchTerm && (
                    <button
                      type='button'
                      onClick={() => setSearchTerm('')}
                      className='absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground'
                    >
                      <X className='h-3.5 w-3.5' />
                    </button>
                  )}
                </div>
              </div>

              <div className='flex items-center gap-2 flex-wrap'>
                <Select value={methodFilter} onValueChange={setMethodFilter}>
                  <SelectTrigger className='w-[170px] h-9 text-xs'>
                    <SelectValue placeholder="To'lov usuli" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>Barcha usullar</SelectItem>
                    <SelectItem value='cash'>Naqd Pul</SelectItem>
                    <SelectItem value='card'>Plastik Karta</SelectItem>
                    <SelectItem value='payme'>Payme</SelectItem>
                    <SelectItem value='click'>Click</SelectItem>
                    <SelectItem value='bank_transfer'>Bank O'tkazmasi</SelectItem>
                  </SelectContent>
                </Select>

                {(searchTerm || (methodFilter && methodFilter !== 'all')) && (
                  <Button
                    variant='ghost'
                    size='sm'
                    className='h-9 px-2 text-xs text-muted-foreground hover:text-foreground'
                    onClick={() => {
                      setSearchTerm('')
                      setMethodFilter('')
                    }}
                  >
                    <X className='me-1 h-3.5 w-3.5' /> Tozalash
                  </Button>
                )}

                <Button
                  variant='outline'
                  size='sm'
                  className='h-9 text-xs gap-1.5 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                  onClick={exportPaymentsToCSV}
                >
                  <Download className='h-3.5 w-3.5' /> Eksport (CSV)
                </Button>
              </div>
            </div>

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
                    payments.map((p: any) => {
                      const patientName = String(p?.patientName || (p?.patient && typeof p.patient === 'object' ? `${p.patient.firstName || ''} ${p.patient.lastName || ''}`.trim() : '') || 'Bemor')
                      const patientId = String(p?.patientId || p?.patient?.id || p?.patient || '')
                      const pMethod = String(p?.method || 'cash')
                      const createdAt = String(p?.createdAt || p?.created_at || '')
                      const shortId = String(p?.shortId || String(p?.id || '').replace(/-/g, '').toUpperCase().slice(0, 8))
                      const procedureName = p?.procedureName ? String(p.procedureName) : ''
                      const doctorName = p?.doctorName ? String(p.doctorName) : ''
                      const isVoided = p?.isActive === false

                      return (
                        <TableRow key={String(p?.id)} className={`hover:bg-muted/20 ${isVoided ? 'opacity-50' : ''}`}>
                          {/* Short ID */}
                          <TableCell className='text-[10px] font-mono text-muted-foreground'>
                            <span className='bg-muted px-1.5 py-0.5 rounded font-medium'>{shortId}</span>
                          </TableCell>

                          {/* Patient */}
                          <TableCell className='font-medium text-xs'>
                            <Link
                              to='/patients/$id'
                              params={{ id: patientId }}
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
                              {(METHOD_LABELS as Record<string, string>)[pMethod] || pMethod}
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

            {/* Table Pagination */}
            <TablePagination
              page={page}
              pageSize={pageSize}
              totalCount={totalCount}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              className='mt-2'
            />
          </TabsContent>

          {/* Debtors Tab */}
          <TabsContent value='debtors'>
            <div className='space-y-4'>
              {/* Search & Debtors Header */}
              <div className='flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 flex-wrap'>
                <div className='flex items-center gap-2.5 flex-1 min-w-[240px] max-w-md'>
                  <div className='relative w-full'>
                    <Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
                    <Input
                      type='text'
                      placeholder='Qarzdor bemor ismi yoki telefoni...'
                      className='pl-8 h-9 text-xs'
                      value={debtorSearch}
                      onChange={(e) => setDebtorSearch(e.target.value)}
                    />
                    {debtorSearch && (
                      <button
                        type='button'
                        onClick={() => setDebtorSearch('')}
                        className='absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground'
                      >
                        <X className='h-3.5 w-3.5' />
                      </button>
                    )}
                  </div>
                </div>

                {debtorsData && (
                  <div className='flex items-center gap-3 text-xs'>
                    <span className='text-muted-foreground'>
                      Jami qarzdorlar: <strong>{debtorsData.totalDebtorsCount}</strong> nafar
                    </span>
                    <Badge variant='outline' className='font-mono font-bold text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/20'>
                      Umumiy qarz: {Number(debtorsData.totalDebtAmount || 0).toLocaleString()} so'm
                    </Badge>
                  </div>
                )}
              </div>

              <div className='rounded-xl border bg-card shadow-sm overflow-x-auto w-full'>
                <Table className='min-w-[750px] sm:min-w-full'>
                  <TableHeader>
                    <TableRow className='bg-muted/30'>
                      <TableHead className='text-xs font-semibold'>Bemor</TableHead>
                      <TableHead className='text-xs font-semibold'>Telefon</TableHead>
                      <TableHead className='text-xs font-semibold'>Hisoblangan</TableHead>
                      <TableHead className='text-xs font-semibold'>To'langan</TableHead>
                      <TableHead className='text-xs font-semibold'>Qarzdorlik (Qarz)</TableHead>
                      <TableHead className='text-xs font-semibold'>To'lanmagan Muolajalar</TableHead>
                      <TableHead className='text-xs font-semibold text-end'>Amal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isDebtorsLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className='text-center py-8 text-xs text-muted-foreground animate-pulse'>
                          Qarzdorlar ro'yxati yuklanmoqda...
                        </TableCell>
                      </TableRow>
                    ) : !debtorsData?.debtors || debtorsData.debtors.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className='text-center py-10 text-xs text-muted-foreground'>
                          <div className='flex flex-col items-center justify-center gap-2'>
                            <CheckCircle2 className='h-8 w-8 text-emerald-500/70' />
                            <span className='font-medium text-emerald-700 dark:text-emerald-400'>
                              Ajoyib! Hozirda klinika bo'yicha hech qanday qarzdorlik mavjud emas.
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      debtorsData.debtors.map((d: any) => {
                        const pId = String(d.patientId)
                        const isExpanded = expandedDebtorId === pId

                        return (
                          <div key={pId} style={{ display: 'contents' }}>
                            <TableRow className='hover:bg-muted/20'>
                              <TableCell className='font-medium text-xs'>
                                <Link
                                  to='/patients/$id'
                                  params={{ id: pId }}
                                  className='text-primary hover:underline font-bold'
                                >
                                  {d.fullName || `${d.firstName} ${d.lastName}`}
                                </Link>
                              </TableCell>
                              <TableCell className='text-xs font-mono text-muted-foreground'>
                                {d.phone || '-'}
                              </TableCell>
                              <TableCell className='text-xs font-mono'>
                                {Number(d.totalBilled || 0).toLocaleString()} so'm
                              </TableCell>
                              <TableCell className='text-xs font-mono text-emerald-600 dark:text-emerald-400'>
                                {Number(d.totalPaid || 0).toLocaleString()} so'm
                              </TableCell>
                              <TableCell className='text-xs font-bold font-mono text-rose-600 dark:text-rose-400'>
                                <Badge variant='outline' className='bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-900 font-mono'>
                                  {Number(d.debtAmount || 0).toLocaleString()} so'm
                                </Badge>
                              </TableCell>
                              <TableCell className='text-xs'>
                                {d.unpaidTreatmentsCount > 0 ? (
                                  <button
                                    type='button'
                                    onClick={() => setExpandedDebtorId(isExpanded ? null : pId)}
                                    className='inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium'
                                  >
                                    <span>{d.unpaidTreatmentsCount} ta muolaja</span>
                                    {isExpanded ? <ChevronUp className='h-3.5 w-3.5' /> : <ChevronDown className='h-3.5 w-3.5' />}
                                  </button>
                                ) : (
                                  <span className='text-muted-foreground text-[11px]'>-</span>
                                )}
                              </TableCell>
                              <TableCell className='text-end'>
                                <Button
                                  size='sm'
                                  className='h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs gap-1'
                                  onClick={() => handleQuickPayDebtor(d)}
                                  disabled={!isShiftOpen}
                                >
                                  <CreditCard className='h-3.5 w-3.5' /> Qarzni to'lash
                                </Button>
                              </TableCell>
                            </TableRow>

                            {isExpanded && d.unpaidTreatments && d.unpaidTreatments.length > 0 && (
                              <TableRow className='bg-muted/30 border-y'>
                                <TableCell colSpan={7} className='p-3 ps-8'>
                                  <div className='space-y-2'>
                                    <div className='text-[11px] font-bold text-muted-foreground uppercase tracking-wide'>
                                      To'lanmagan muolajalar ro'yxati:
                                    </div>
                                    <div className='grid gap-2 sm:grid-cols-2 lg:grid-cols-3'>
                                      {d.unpaidTreatments.map((tr: any) => (
                                        <div key={tr.id} className='bg-background border rounded-lg p-2.5 shadow-2xs text-xs space-y-1'>
                                          <div className='flex justify-between items-start font-medium'>
                                            <span>{tr.procedureName || 'Muolaja'}</span>
                                            <Badge variant='outline' className='text-[9px] uppercase'>
                                              {tr.paymentStatus === 'partial' ? 'Qisman' : "To'lanmagan"}
                                            </Badge>
                                          </div>
                                          {tr.diagnosis && (
                                            <p className='text-[10px] text-muted-foreground truncate'>
                                              Tashxis: {tr.diagnosis}
                                            </p>
                                          )}
                                          <div className='flex justify-between items-baseline pt-1 border-t text-[11px] font-mono'>
                                            <span className='text-muted-foreground'>Qarz:</span>
                                            <span className='font-bold text-rose-600'>
                                              {Number(tr.debtAmount || tr.price).toLocaleString()} so'm
                                            </span>
                                          </div>
                                          <Button
                                            size='sm'
                                            variant='secondary'
                                            className='w-full h-6 text-[10px] mt-1'
                                            onClick={() => openPaymentModal(tr.id, pId, String(tr.debtAmount || tr.price))}
                                            disabled={!isShiftOpen}
                                          >
                                            Ushbu muolajani to'lash
                                          </Button>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </div>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>

          {/* Pending Treatments Tab */}
          <TabsContent value='pending'>
            <div className='space-y-4'>
              <div className='flex items-center justify-between'>
                <div>
                  <h3 className='text-sm font-bold'>To'lov Kutilayotgan Muolajalar</h3>
                  <p className='text-xs text-muted-foreground'>
                    Muolajasi yakunlangan, lekin to'lovi qilinmagan davolashlar ro'yxati.
                  </p>
                </div>
                <Badge variant='outline' className='font-mono font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/20'>
                  {pendingTreatments.length} ta muolaja
                </Badge>
              </div>

              {pendingTreatments.length === 0 ? (
                <div className='rounded-xl border border-dashed p-8 text-center text-muted-foreground text-xs'>
                  To'lov kutilayotgan muolajalar mavjud emas. Barcha yakunlangan muolajalar to'langan.
                </div>
              ) : (
                <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
                  {pendingTreatments.map((pt: any) => {
                    const pName = String(pt.patientName || (pt.patient && typeof pt.patient === 'object' ? `${pt.patient.firstName || ''} ${pt.patient.lastName || ''}`.trim() : pt.patient) || 'Bemor')
                    const doctorName = String(pt.doctorName || (pt.doctor && typeof pt.doctor === 'object' ? pt.doctor.user?.firstName : '') || 'Shifokor')
                    const pId = String(pt.patient && typeof pt.patient === 'object' ? pt.patient.id : pt.patient || '')
                    
                    return (
                      <div key={String(pt.id)} className='bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-xl p-4 shadow-xs flex flex-col justify-between'>
                        <div>
                          <div className='flex justify-between items-start mb-2'>
                            <Link
                              to='/patients/$id'
                              params={{ id: pId }}
                              className='font-bold text-sm text-primary hover:underline'
                            >
                              {pName}
                            </Link>
                            <Badge variant='outline' className='text-[10px] bg-white dark:bg-black/20 text-amber-600 border-amber-200'>
                              To'lanmagan
                            </Badge>
                          </div>
                          <div className='text-xs text-muted-foreground space-y-1 mb-3'>
                            <p>Shifokor: Dr. {doctorName}</p>
                            <p>Muolaja: {pt.procedureTypeName || 'Umumiy'}</p>
                            {pt.diagnosis && <p className='italic text-[11px]'>Tashxis: {pt.diagnosis}</p>}
                          </div>
                        </div>
                        <div className='flex items-center justify-between border-t border-amber-200/50 dark:border-amber-900/50 pt-3'>
                          <span className='font-mono font-bold text-emerald-600 dark:text-emerald-400'>
                            {Number(pt.price || 0).toLocaleString()} so'm
                          </span>
                          <Button 
                            size='sm' 
                            className='h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs gap-1'
                            onClick={() => openPaymentModal(String(pt.id), pId, String(pt.price || ''))}
                            disabled={!isShiftOpen}
                          >
                            <CreditCard className='w-3.5 h-3.5' /> To'lash
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
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
                      <SelectItem key={String(d.id)} value={String(d.id)}>
                        Dr. {d.user?.firstName || ''} {d.user?.lastName || ''} ({d.specialization || 'Stomatolog'})
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
                      commissions.map((c: any) => {
                        const doctorName = c?.doctorName || (c?.doctor && typeof c.doctor === 'object' ? `${c.doctor.user?.firstName || ''} ${c.doctor.user?.lastName || ''}`.trim() : c?.doctor) || 'Shifokor'
                        const calcAt = c?.calculatedAt || c?.calculated_at || ''

                        return (
                          <TableRow key={String(c?.id)}>
                            <TableCell className='text-xs font-medium'>{doctorName}</TableCell>
                            <TableCell className='text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400'>
                              +{Number(c?.amount || 0).toLocaleString()} so'm
                            </TableCell>
                            <TableCell className='text-xs'>
                              <Badge variant='outline' className='text-[10px] uppercase'>
                                {String(c?.basis || 'from_total')} ({c?.rate || 0}%)
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
          <DialogContent className='sm:max-w-lg w-full max-w-[95vw] p-5 sm:p-6'>
            <DialogHeader>
              <DialogTitle>Mijozdan To'lov Qabul Qilish</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleCreatePayment} className='space-y-3 py-1'>
              <div className='space-y-1 w-full min-w-0'>
                <label className='text-xs font-medium'>Bemor *</label>
                <Select 
                  value={patientId} 
                  onValueChange={(val) => {
                    setPatientId(val)
                    const patientTreatments = allModalTreatments.filter((t: any) => (t.patient?.id || t.patient) === val)
                    if (patientTreatments.length === 1) {
                      setTreatmentId(patientTreatments[0].id)
                      const cleanPrice = String(Math.round(Number(patientTreatments[0].price || 0)))
                      setAmount(cleanPrice)
                      setSplitCash(cleanPrice)
                    } else {
                      setTreatmentId('')
                      setAmount('')
                      setSplitCash('')
                    }
                  }}
                >
                  <SelectTrigger className='w-full text-xs h-9 truncate'>
                    <SelectValue placeholder='Bemor tanlang' />
                  </SelectTrigger>
                  <SelectContent className='max-h-60 max-w-[90vw] sm:max-w-[440px]'>
                    {patients.map((p: any) => (
                      <SelectItem key={String(p.id)} value={String(p.id)} className='text-xs truncate'>
                        {p.firstName || ''} {p.lastName || ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className='space-y-1 w-full min-w-0'>
                <label className='text-xs font-medium'>Davolash Ishi (Treatment) *</label>
                <Select
                  value={treatmentId}
                  onValueChange={(val) => {
                    setTreatmentId(val)
                    const tr = allModalTreatments.find((t: any) => String(t.id) === val)
                    if (tr) {
                      setPatientId(typeof tr.patient === 'object' ? (tr.patient as any).id : tr.patient)
                      const cleanPrice = String(Math.round(Number(tr.price || 0)))
                      setAmount(cleanPrice)
                      setSplitCash(cleanPrice)
                    }
                  }}
                >
                  <SelectTrigger className='w-full text-xs h-9 truncate'>
                    <SelectValue placeholder='Davolash ishini tanlang' className='truncate' />
                  </SelectTrigger>
                  <SelectContent className='max-h-60 max-w-[90vw] sm:max-w-[460px]'>
                    {filteredTreatments.map((t: any) => {
                      const patientName = t.patient ? `${t.patient.firstName || ''} ${t.patient.lastName || ''}`.trim() : 'Bemor'
                      const procedureName = t.procedureType?.name || t.procedureTypeName || 'Umumiy Muolaja'
                      const dateStr = t.createdAt || t.created_at || ''
                      const dateFormatted = dateStr ? format(new Date(dateStr), 'dd.MM.yy HH:mm') : ''
                      return (
                        <SelectItem key={String(t.id)} value={String(t.id)} className='text-xs truncate py-1.5'>
                          {patientName} - {procedureName} {dateFormatted ? `(${dateFormatted})` : ''} - {Math.round(Number(t.price || 0)).toLocaleString()} so'm
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Payment Mode Selector */}
              <div className='flex items-center justify-between p-1 bg-muted rounded-lg'>
                <Button
                  type='button'
                  size='sm'
                  variant={!isSplitMode ? 'default' : 'ghost'}
                  className='flex-1 h-8 text-xs font-semibold'
                  onClick={() => setIsSplitMode(false)}
                >
                  💵 Yagona To'lov
                </Button>
                <Button
                  type='button'
                  size='sm'
                  variant={isSplitMode ? 'default' : 'ghost'}
                  className='flex-1 h-8 text-xs font-semibold'
                  onClick={() => {
                    setIsSplitMode(true)
                    if (!splitCash && amount) setSplitCash(String(Math.round(Number(amount))))
                  }}
                >
                  🔀 Aralash To'lov (Split)
                </Button>
              </div>

              {!isSplitMode ? (
                /* Single Payment Mode */
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

                  <div className='space-y-1 w-full'>
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
              ) : (
                /* Split Payment Mode */
                <div className='space-y-3 bg-muted/20 p-3 rounded-xl border border-dashed'>
                  <div className='grid grid-cols-2 gap-2.5'>
                    <div className='space-y-1'>
                      <label className='text-xs font-medium flex items-center gap-1'>💵 Naqd pul</label>
                      <Input
                        type='number'
                        placeholder='0'
                        className='h-8 text-xs font-mono'
                        value={splitCash}
                        onChange={(e) => setSplitCash(e.target.value)}
                      />
                    </div>
                    <div className='space-y-1'>
                      <label className='text-xs font-medium flex items-center gap-1'>💳 Plastik karta</label>
                      <Input
                        type='number'
                        placeholder='0'
                        className='h-8 text-xs font-mono'
                        value={splitCard}
                        onChange={(e) => setSplitCard(e.target.value)}
                      />
                    </div>
                    <div className='space-y-1'>
                      <label className='text-xs font-medium flex items-center gap-1'>📱 Click</label>
                      <Input
                        type='number'
                        placeholder='0'
                        className='h-8 text-xs font-mono'
                        value={splitClick}
                        onChange={(e) => setSplitClick(e.target.value)}
                      />
                    </div>
                    <div className='space-y-1'>
                      <label className='text-xs font-medium flex items-center gap-1'>🟣 Payme</label>
                      <Input
                        type='number'
                        placeholder='0'
                        className='h-8 text-xs font-mono'
                        value={splitPayme}
                        onChange={(e) => setSplitPayme(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Split Summary Bar */}
                  <div className='flex items-center justify-between text-xs pt-2 border-t font-mono'>
                    <span className='text-muted-foreground'>Jami kiritildi:</span>
                    <span className='font-bold text-foreground'>{Math.round(totalSplit).toLocaleString()} so'm</span>
                  </div>
                  {targetAmount > 0 && (
                    <div className='flex items-center justify-between text-xs font-mono'>
                      <span className='text-muted-foreground'>Muolaja summasi:</span>
                      <span className='font-semibold'>{Math.round(targetAmount).toLocaleString()} so'm</span>
                    </div>
                  )}
                  {targetAmount > 0 && (
                    <div className='text-center pt-1'>
                      {Math.round(totalSplit) === Math.round(targetAmount) ? (
                        <Badge className='bg-emerald-600 text-[10px]'>✅ To'liq qoplandi</Badge>
                      ) : totalSplit > targetAmount ? (
                        <Badge className='bg-blue-600 text-[10px]'>💵 Qaytim: {Math.round(totalSplit - targetAmount).toLocaleString()} so'm</Badge>
                      ) : (
                        <Badge variant='outline' className='text-amber-600 border-amber-300 text-[10px]'>
                          ⚠️ Qoldiq: {Math.round(targetAmount - totalSplit).toLocaleString()} so'm
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              )}

              <DialogFooter className='pt-3 flex flex-row items-center justify-end gap-2'>
                <Button type='button' variant='outline' onClick={() => setIsModalOpen(false)}>
                  Bekor qilish
                </Button>
                <Button type='submit' disabled={createPaymentMutation.isPending} className='font-semibold'>
                  {createPaymentMutation.isPending ? 'To’lanmoqda...' : isSplitMode ? `To'lovni Qabul Qilish (${Math.round(totalSplit).toLocaleString()} so'm)` : "To'lovni Qabul Qilish"}
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
