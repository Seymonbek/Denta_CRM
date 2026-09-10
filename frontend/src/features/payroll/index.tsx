import { useState, useMemo, useRef } from 'react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { TablePagination } from '@/components/ui/table-pagination'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Banknote,
  TrendingUp,
  DollarSign,
  Wallet,
  User,
  Eye,
  Search,
  Download,
  Printer,
  FileSpreadsheet,
} from 'lucide-react'
import { useDoctorBalances, type DoctorBalance } from '@/api/hooks/use-payroll'
import { useDoctorCommissions, useDoctorCommissionSummary } from '@/api/hooks/use-payments'
import { useDoctors } from '@/api/hooks/use-doctors'
import { PayrollFormModal } from './payroll-form-modal'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { formatMoney } from '@/utils/format'
import { useAuthStore } from '@/stores/auth-store'
import { format, isToday, isThisWeek, isThisMonth } from 'date-fns'
import { useReactToPrint } from 'react-to-print'
import { SalarySlipPrint } from '@/components/print/salary-slip-print'
import { toast } from 'sonner'

export function PayrollFeature() {
  const authUser = useAuthStore((state) => state.user)
  const isDoctor = authUser?.role === 'doctor'
  const isHeadDoctor = authUser?.role === 'bosh_shifokor'
  const isAdministrator = authUser?.role === 'administrator'

  const { data: balances = [], isLoading } = useDoctorBalances()
  const { data: doctorsData = [] } = useDoctors()
  const doctors = Array.isArray(doctorsData) ? doctorsData : []

  // Resolve matching doctor profile for logged in doctor
  const myDoctorProfile = useMemo(() => {
    if (!isDoctor) return null
    return (
      doctors.find(
        (d: any) =>
          (d.user && d.user.id === authUser?.id) ||
          (d.user &&
            (d.user.phone_number === (authUser as any)?.phone_number ||
              d.user.phone_number === authUser?.phoneNumber)) ||
          d.id === (authUser as any)?.doctorId
      ) || null
    )
  }, [doctors, authUser, isDoctor])

  const myDoctorBalance = useMemo(() => {
    if (!myDoctorProfile) return null
    return balances.find((b: DoctorBalance) => b.id === myDoctorProfile.id) || null
  }, [balances, myDoctorProfile])

  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(
    isDoctor && myDoctorProfile ? myDoctorProfile.id : ''
  )
  const [selectedDoctorForPayout, setSelectedDoctorForPayout] = useState<DoctorBalance | null>(null)
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all')

  const [docCommSearch, setDocCommSearch] = useState('')
  const [docCommPage, setDocCommPage] = useState(1)
  const [docCommPageSize, setDocCommPageSize] = useState(10)

  const [balancesSearch, setBalancesSearch] = useState('')
  const [balancesPage, setBalancesPage] = useState(1)
  const [balancesPageSize, setBalancesPageSize] = useState(10)

  const [statementSearch, setStatementSearch] = useState('')
  const [statementPage, setStatementPage] = useState(1)
  const [statementPageSize, setStatementPageSize] = useState(10)

  const effectiveDoctorId = isDoctor ? myDoctorProfile?.id || selectedDoctorId : selectedDoctorId
  const { data: commissionsData = [] } = useDoctorCommissions(effectiveDoctorId)
  const commissions: any[] = Array.isArray(commissionsData) ? commissionsData : []
  const { data: summary } = useDoctorCommissionSummary(effectiveDoctorId)

  // Find active selected doctor object for statements/printing
  const currentSelectedDoc = useMemo(() => {
    if (isDoctor) return myDoctorProfile
    return doctors.find((d: any) => d.id === selectedDoctorId) || null
  }, [isDoctor, myDoctorProfile, doctors, selectedDoctorId])

  const currentSelectedDocBalance = useMemo(() => {
    if (isDoctor) return myDoctorBalance
    return balances.find((b: DoctorBalance) => b.id === selectedDoctorId) || null
  }, [isDoctor, myDoctorBalance, balances, selectedDoctorId])

  // Filtered commissions based on period
  const filteredCommissions = useMemo(() => {
    return commissions.filter((c: any) => {
      const dateStr = c?.calculatedAt || c?.calculated_at || c?.createdAt || c?.created_at
      if (!dateStr) return true
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return true

      if (dateFilter === 'today') return isToday(date)
      if (dateFilter === 'week') return isThisWeek(date, { weekStartsOn: 1 })
      if (dateFilter === 'month') return isThisMonth(date)
      return true
    })
  }, [commissions, dateFilter])

  // Doctor Personal Statement: Search + Pagination
  const searchedDocCommissions = useMemo(() => {
    if (!docCommSearch) return filteredCommissions
    const q = docCommSearch.toLowerCase()
    return filteredCommissions.filter((c: any) => {
      const pName = (
        c?.patientName ||
        (c?.patient ? `${c.patient.firstName || ''} ${c.patient.lastName || ''}` : '')
      ).toLowerCase()
      const proc = (c?.procedureName || c?.procedureTypeName || '').toLowerCase()
      return pName.includes(q) || proc.includes(q)
    })
  }, [filteredCommissions, docCommSearch])

  const paginatedDocCommissions = useMemo(() => {
    const start = (docCommPage - 1) * docCommPageSize
    return searchedDocCommissions.slice(start, start + docCommPageSize)
  }, [searchedDocCommissions, docCommPage, docCommPageSize])

  // All Doctors Balances: Search + Pagination
  const searchedBalances = useMemo(() => {
    if (!balancesSearch) return balances
    const q = balancesSearch.toLowerCase()
    return balances.filter((b: DoctorBalance) => {
      const name = `${b.firstName || ''} ${b.lastName || ''}`.toLowerCase()
      const phone = (b.phone || '').toLowerCase()
      return name.includes(q) || phone.includes(q)
    })
  }, [balances, balancesSearch])

  const paginatedBalances = useMemo(() => {
    const start = (balancesPage - 1) * balancesPageSize
    return searchedBalances.slice(start, start + balancesPageSize)
  }, [searchedBalances, balancesPage, balancesPageSize])

  // Selected Doctor Statement: Search + Pagination
  const searchedStatement = useMemo(() => {
    if (!statementSearch) return commissions
    const q = statementSearch.toLowerCase()
    return commissions.filter((c: any) => {
      const pName = (
        c?.patientName ||
        (c?.patient ? `${c.patient.firstName || ''} ${c.patient.lastName || ''}` : '')
      ).toLowerCase()
      const proc = (c?.procedureName || '').toLowerCase()
      return pName.includes(q) || proc.includes(q)
    })
  }, [commissions, statementSearch])

  const paginatedStatement = useMemo(() => {
    const start = (statementPage - 1) * statementPageSize
    return searchedStatement.slice(start, start + statementPageSize)
  }, [searchedStatement, statementPage, statementPageSize])

  // Total summary calculations
  const totalClinicEarned = balances.reduce((acc, b) => acc + (b.totalEarned || 0), 0)
  const totalClinicPaid = balances.reduce((acc, b) => acc + (b.totalPaid || 0), 0)
  const totalClinicBalance = balances.reduce((acc, b) => acc + (b.balance || 0), 0)

  // Print slip reference
  const printRef = useRef<HTMLDivElement>(null)
  const handlePrintSlip = useReactToPrint({
    // @ts-expect-error react-to-print issue with react 18 refs
    content: () => printRef.current,
  })

  // Format data for printing
  const slipDoctorInfo = useMemo(() => {
    if (isDoctor && myDoctorProfile) {
      return {
        name: `Dr. ${myDoctorProfile.user?.firstName || ''} ${myDoctorProfile.user?.lastName || ''}`.trim(),
        specialization: myDoctorProfile.specialization || 'Stomatolog',
        phone: myDoctorProfile.user?.phoneNumber || '',
        rate: Number(myDoctorProfile.defaultCommissionRate || 30),
        basis: myDoctorProfile.commissionBasis,
      }
    }
    if (currentSelectedDoc) {
      return {
        name: `Dr. ${currentSelectedDoc.user?.firstName || ''} ${currentSelectedDoc.user?.lastName || ''}`.trim(),
        specialization: currentSelectedDoc.specialization || 'Stomatolog',
        phone: currentSelectedDoc.user?.phoneNumber || '',
        rate: Number(currentSelectedDoc.defaultCommissionRate || 30),
        basis: currentSelectedDoc.commissionBasis,
      }
    }
    return {
      name: 'Shifokor',
    }
  }, [isDoctor, myDoctorProfile, currentSelectedDoc])

  const slipSummaryInfo = useMemo(() => {
    if (isDoctor) {
      return {
        totalEarned: myDoctorBalance?.totalEarned || Number((summary as any)?.totalEarned || 0),
        totalPaid: myDoctorBalance?.totalPaid || 0,
        balance: myDoctorBalance?.balance || 0,
      }
    }
    return {
      totalEarned: currentSelectedDocBalance?.totalEarned || Number((summary as any)?.totalEarned || 0),
      totalPaid: currentSelectedDocBalance?.totalPaid || 0,
      balance: currentSelectedDocBalance?.balance || 0,
    }
  }, [isDoctor, myDoctorBalance, currentSelectedDocBalance, summary])

  const slipItems = useMemo(() => {
    const list = isDoctor ? searchedDocCommissions : searchedStatement
    return list.map((c: any) => {
      const dateStr = c?.calculatedAt || c?.calculated_at || c?.createdAt || ''
      const formattedDate = dateStr ? format(new Date(dateStr), 'dd.MM.yyyy') : '—'
      const pName =
        c?.patientName ||
        (c?.patient ? `${c.patient.firstName || ''} ${c.patient.lastName || ''}`.trim() : '') ||
        'Bemor'
      const proc = c?.procedureName || c?.procedureTypeName || 'Muolaja'
      const price = Number(c?.treatmentPrice || c?.treatment_price || c?.amount || 0)
      const rate = Number(c?.rate || 30)
      const amt = Number(c?.amount || 0)
      return {
        date: formattedDate,
        patientName: pName,
        procedureName: proc,
        price,
        rate,
        amount: amt,
      }
    })
  }, [isDoctor, searchedDocCommissions, searchedStatement])

  const triggerPrint = () => {
    if (!effectiveDoctorId) {
      toast.error('Iltimos, avval shifokorni tanlang.')
      return
    }
    setTimeout(() => {
      if (handlePrintSlip) handlePrintSlip()
    }, 100)
  }

  // Export CSV for Balances
  const handleExportBalancesCSV = () => {
    if (balances.length === 0) {
      toast.error('Eksport uchun ma’lumotlar yo‘q.')
      return
    }

    const headers = [
      'Shifokor F.I.Sh',
      'Telefon Raqami',
      'Standart Foiz %',
      'Jami Ishlangan Komissiya (so\'m)',
      'To\'langan Maosh (so\'m)',
      'Olinmagan Qoldiq (so\'m)',
    ]

    const rows = searchedBalances.map((b) => [
      `"${b.firstName || ''} ${b.lastName || ''}"`,
      `"${b.phone || ''}"`,
      `${b.defaultRate || 30}%`,
      b.totalEarned || 0,
      b.totalPaid || 0,
      b.balance || 0,
    ])

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `Shifokorlar_Oylik_Balansi_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast.success('Shifokorlar oylik balansi CSV formatda yuklab olindi!')
  }

  // Export CSV for Commissions Breakdown
  const handleExportCommissionsCSV = () => {
    const list = isDoctor ? searchedDocCommissions : searchedStatement
    if (list.length === 0) {
      toast.error('Eksport uchun komissiya yozuvlari topilmadi.')
      return
    }

    const headers = [
      'Sana & Vaqt',
      'Bemor F.I.Sh',
      'Muolaja Turi',
      'Muolaja Narxi (so\'m)',
      'Komissiya %',
      'Hisoblangan Komissiya (so\'m)',
    ]

    const rows = list.map((c: any) => {
      const dateStr = c?.calculatedAt || c?.calculated_at || c?.createdAt || ''
      const formattedDate = dateStr ? format(new Date(dateStr), 'dd.MM.yyyy HH:mm') : '—'
      const pName =
        c?.patientName ||
        (c?.patient ? `${c.patient.firstName || ''} ${c.patient.lastName || ''}`.trim() : '') ||
        'Bemor'
      const proc = c?.procedureName || c?.procedureTypeName || 'Muolaja'
      const price = Number(c?.treatmentPrice || c?.treatment_price || c?.amount || 0)
      const rate = Number(c?.rate || 30)
      const amt = Number(c?.amount || 0)

      return [`"${formattedDate}"`, `"${pName}"`, `"${proc}"`, price, `${rate}%`, amt]
    })

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `Shifokor_Komissiyalari_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast.success('Komissiyalar ro‘yxati CSV formatda yuklab olindi!')
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header>
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2 font-bold text-lg tracking-tight">
            <span>💼 {isDoctor ? 'Mening Daromadim va Ish Haqim' : 'Shifokorlar Ish Haqi va Komissiyalari'}</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeSwitch />
            <ProfileDropdown />
          </div>
        </div>
      </Header>

      <Main className="space-y-6">
        {/* KPI Metric Cards */}
        {isDoctor ? (
          /* Doctor's Personal Metric Cards */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">
                  Jami Hisoblangan Komissiya
                </CardTitle>
                <TrendingUp className="w-4 h-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono text-primary">
                  {formatMoney(
                    myDoctorBalance?.totalEarned ||
                      Number((summary as any)?.totalCommission || (summary as any)?.totalEarned || 0)
                  )}{' '}
                  so'm
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Barcha muolajalardan hisoblangan</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">
                  Olingan Maosh (To'langan)
                </CardTitle>
                <DollarSign className="w-4 h-4 text-emerald-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  {formatMoney(myDoctorBalance?.totalPaid || 0)} so'm
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Kassadan qabul qilingan summa</p>
              </CardContent>
            </Card>

            <Card className="border-amber-500/20 bg-amber-500/5">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">
                  Joriy Olinmagan Qoldiq
                </CardTitle>
                <Wallet className="w-4 h-4 text-amber-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
                  {formatMoney(myDoctorBalance?.balance || 0)} so'm
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Klinikadan olinishi kerak bo'lgan summa</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">
                  Mening Foiz Stavkasi
                </CardTitle>
                <User className="w-4 h-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400">
                  {myDoctorBalance?.defaultRate || 30}%
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Standart xizmat komissiyasi</p>
              </CardContent>
            </Card>
          </div>
        ) : (
          /* Clinic Admin / Head Doctor Metric Cards */
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">
                  Jami Shifokorlar Ishlagan
                </CardTitle>
                <TrendingUp className="w-4 h-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono text-primary">
                  {formatMoney(totalClinicEarned)} so'm
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Shifokorlar hisoblangan umumiy komissiyasi
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">
                  Jami To'langan Maosh
                </CardTitle>
                <DollarSign className="w-4 h-4 text-emerald-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  {formatMoney(totalClinicPaid)} so'm
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Kassadan chiqim qilingan ish haqi</p>
              </CardContent>
            </Card>

            <Card className="border-amber-500/20 bg-amber-500/5">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">
                  Klinika Qarzdorligi (Qoldiq)
                </CardTitle>
                <Wallet className="w-4 h-4 text-amber-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
                  {formatMoney(totalClinicBalance)} so'm
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Shifokorlarga to'lanishi kutilayotgan summa
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Content Section */}
        {isDoctor ? (
          /* Doctor Personal Detailed Statement */
          <Card className="shadow-sm">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3">
              <div>
                <CardTitle className="text-base font-bold">Bajarilgan Muolajalar va Komissiyalarim</CardTitle>
                <CardDescription className="text-xs">
                  Har bir bemordan sizga hisoblangan komissiya foizlari va summalari yoyilmasi (
                  {searchedDocCommissions.length} ta yozuv).
                </CardDescription>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-2">
                <div className="relative w-full sm:w-56">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Bemor yoki muolaja..."
                    value={docCommSearch}
                    onChange={(e) => {
                      setDocCommSearch(e.target.value)
                      setDocCommPage(1)
                    }}
                    className="ps-8 text-xs h-8"
                  />
                </div>

                {/* Date Filter Buttons */}
                <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
                  {[
                    { label: 'Barchasi', value: 'all' },
                    { label: 'Bugun', value: 'today' },
                    { label: 'Shu Hafta', value: 'week' },
                    { label: 'Shu Oy', value: 'month' },
                  ].map((item) => (
                    <Button
                      key={item.value}
                      size="sm"
                      variant={dateFilter === item.value ? 'default' : 'ghost'}
                      className="h-7 text-xs px-2.5"
                      onClick={() => {
                        setDateFilter(item.value as any)
                        setDocCommPage(1)
                      }}
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportCommissionsCSV}
                  className="h-8 text-xs gap-1"
                >
                  <Download className="w-3.5 h-3.5" /> CSV
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={triggerPrint}
                  className="h-8 text-xs gap-1 bg-primary/10 text-primary border-primary/20 hover:bg-primary/20"
                >
                  <Printer className="w-3.5 h-3.5" /> Chop Etish
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              <div className="overflow-x-auto w-full rounded-lg border">
                <Table className="min-w-[650px]">
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="text-xs">Sana va Vaqt</TableHead>
                      <TableHead className="text-xs">Bemor</TableHead>
                      <TableHead className="text-xs">Muolaja Turi</TableHead>
                      <TableHead className="text-xs text-right">Muolaja Narxi</TableHead>
                      <TableHead className="text-xs text-center">Komissiya %</TableHead>
                      <TableHead className="text-xs text-right">Menga Hisoblandi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {searchedDocCommissions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-xs text-muted-foreground">
                          Tanlangan davr yoki qidiruv bo'yicha hisoblangan komissiyalar topilmadi.
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedDocCommissions.map((c: any) => {
                        const dateStr = c?.calculatedAt || c?.calculated_at || c?.createdAt || c?.created_at || ''
                        const patientName =
                          c?.patientName ||
                          (c?.patient ? `${c.patient.firstName || ''} ${c.patient.lastName || ''}`.trim() : '') ||
                          'Bemor'
                        const procName = c?.procedureName || c?.procedureTypeName || 'Muolaja'
                        const treatmentPrice = Number(c?.treatmentPrice || c?.treatment_price || c?.amount || 0)
                        const commissionAmt = Number(c?.amount || 0)
                        const rate = c?.rate || 30

                        return (
                          <TableRow key={String(c?.id)}>
                            <TableCell className="text-xs font-mono text-muted-foreground">
                              {dateStr ? format(new Date(dateStr), 'dd.MM.yyyy HH:mm') : '-'}
                            </TableCell>
                            <TableCell className="text-xs font-medium">{patientName}</TableCell>
                            <TableCell className="text-xs">{procName}</TableCell>
                            <TableCell className="text-xs text-right font-mono font-medium">
                              {formatMoney(treatmentPrice)} so'm
                            </TableCell>
                            <TableCell className="text-xs text-center">
                              <Badge variant="outline" className="text-[10px] font-mono">
                                {rate}%
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-right font-bold font-mono text-emerald-600 dark:text-emerald-400">
                              +{formatMoney(commissionAmt)} so'm
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              <TablePagination
                totalCount={searchedDocCommissions.length}
                page={docCommPage}
                pageSize={docCommPageSize}
                onPageChange={setDocCommPage}
                onPageSizeChange={(newSize) => {
                  setDocCommPageSize(newSize)
                  setDocCommPage(1)
                }}
              />
            </CardContent>
          </Card>
        ) : (
          /* Head Doctor & Admin View: All Doctors Table + Statement Viewer */
          <Tabs defaultValue="doctors" className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <TabsList>
                <TabsTrigger value="doctors">Shifokorlar Balansi</TabsTrigger>
                {selectedDoctorId && <TabsTrigger value="statement">Shifokor Tafsiloti (Tarix)</TabsTrigger>}
              </TabsList>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportBalancesCSV}
                  className="h-8 text-xs gap-1.5 shadow-sm"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" /> Barcha Balans (CSV)
                </Button>
              </div>
            </div>

            <TabsContent value="doctors">
              <Card className="shadow-sm">
                <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3">
                  <div>
                    <CardTitle className="text-base font-bold">Shifokorlar Ish Haqi Balansi</CardTitle>
                    <CardDescription className="text-xs">
                      Har bir shifokorning jami ishlagan summasi, to'langan oyligi va joriy qarzdorlik qoldig'i (
                      {searchedBalances.length} ta shifokor).
                    </CardDescription>
                  </div>

                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Shifokor ismi yoki telefon..."
                      value={balancesSearch}
                      onChange={(e) => {
                        setBalancesSearch(e.target.value)
                        setBalancesPage(1)
                      }}
                      className="ps-8 text-xs h-8"
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {isLoading ? (
                    <div className="text-center p-8 text-xs text-muted-foreground">
                      Ma'lumotlar yuklanmoqda...
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto w-full rounded-lg border">
                        <Table className="min-w-[700px]">
                          <TableHeader>
                            <TableRow className="bg-muted/40">
                              <TableHead className="text-xs font-semibold">Shifokor</TableHead>
                              <TableHead className="text-xs font-semibold">Telefon</TableHead>
                              <TableHead className="text-xs font-semibold text-center">Foiz Stavkasi</TableHead>
                              <TableHead className="text-xs font-semibold text-right">Jami Ishlagan</TableHead>
                              <TableHead className="text-xs font-semibold text-right">To'langan</TableHead>
                              <TableHead className="text-xs font-semibold text-right">Olinmagan Qoldiq</TableHead>
                              <TableHead className="text-xs font-semibold text-right">Amallar</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {paginatedBalances.map((doc: DoctorBalance) => (
                              <TableRow key={doc.id} className="hover:bg-muted/20">
                                <TableCell className="font-semibold text-xs">
                                  {doc.firstName} {doc.lastName}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground font-mono">
                                  {doc.phone}
                                </TableCell>
                                <TableCell className="text-xs text-center font-mono">
                                  <Badge variant="outline" className="text-[10px]">
                                    {doc.defaultRate || '30'}%
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right text-xs font-mono">
                                  {formatMoney(doc.totalEarned)}
                                </TableCell>
                                <TableCell className="text-right text-xs font-mono text-muted-foreground">
                                  {formatMoney(doc.totalPaid)}
                                </TableCell>
                                <TableCell className="text-right text-xs font-bold font-mono text-primary">
                                  {formatMoney(doc.balance)} so'm
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-8 text-xs"
                                      onClick={() => setSelectedDoctorId(doc.id)}
                                    >
                                      <Eye className="w-3.5 h-3.5 mr-1" /> Ko'rish
                                    </Button>
                                    {(isHeadDoctor || isAdministrator) && (
                                      <Button
                                        variant="default"
                                        size="sm"
                                        className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 font-bold"
                                        onClick={() => setSelectedDoctorForPayout(doc)}
                                      >
                                        <Banknote className="w-3.5 h-3.5 mr-1" /> To'lash
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                            {searchedBalances.length === 0 && (
                              <TableRow>
                                <TableCell colSpan={7} className="text-center py-8 text-xs text-muted-foreground">
                                  Shifokorlar ma'lumotlari topilmadi.
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>

                      <TablePagination
                        totalCount={searchedBalances.length}
                        page={balancesPage}
                        pageSize={balancesPageSize}
                        onPageChange={setBalancesPage}
                        onPageSizeChange={(newSize) => {
                          setBalancesPageSize(newSize)
                          setBalancesPage(1)
                        }}
                      />
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {selectedDoctorId && (
              <TabsContent value="statement">
                <Card className="shadow-sm">
                  <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3">
                    <div>
                      <CardTitle className="text-base font-bold flex items-center gap-2">
                        <span>
                          Dr. {currentSelectedDoc?.user?.firstName || ''}{' '}
                          {currentSelectedDoc?.user?.lastName || ''} — Komissiyalari
                        </span>
                        <Badge variant="outline" className="text-xs font-mono">
                          Qoldiq: {formatMoney(currentSelectedDocBalance?.balance || 0)} so'm
                        </Badge>
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Tanlangan shifokorning barcha muolajalari bo'yicha hisoblangan komissiyalar (
                        {searchedStatement.length} ta yozuv).
                      </CardDescription>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="relative w-full sm:w-56">
                        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          placeholder="Bemor yoki muolaja..."
                          value={statementSearch}
                          onChange={(e) => {
                            setStatementSearch(e.target.value)
                            setStatementPage(1)
                          }}
                          className="ps-8 text-xs h-8"
                        />
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportCommissionsCSV}
                        className="h-8 text-xs gap-1"
                      >
                        <Download className="w-3.5 h-3.5" /> CSV
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={triggerPrint}
                        className="h-8 text-xs gap-1 bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 font-medium"
                      >
                        <Printer className="w-3.5 h-3.5" /> Vedomost
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => setSelectedDoctorId('')}
                      >
                        Orqaga
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="overflow-x-auto w-full rounded-lg border">
                      <Table className="min-w-[650px]">
                        <TableHeader>
                          <TableRow className="bg-muted/40">
                            <TableHead className="text-xs">Sana</TableHead>
                            <TableHead className="text-xs">Bemor</TableHead>
                            <TableHead className="text-xs">Muolaja</TableHead>
                            <TableHead className="text-xs text-right">Summa</TableHead>
                            <TableHead className="text-xs text-center">Foiz</TableHead>
                            <TableHead className="text-xs text-right">Komissiya</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {searchedStatement.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center py-8 text-xs text-muted-foreground">
                                Komissiyalar topilmadi.
                              </TableCell>
                            </TableRow>
                          ) : (
                            paginatedStatement.map((c: any) => {
                              const dateStr = c?.calculatedAt || c?.calculated_at || c?.createdAt || ''
                              const patientName =
                                c?.patientName ||
                                (c?.patient ? `${c.patient.firstName || ''} ${c.patient.lastName || ''}`.trim() : '') ||
                                'Bemor'
                              const procName = c?.procedureName || 'Muolaja'
                              const amt = Number(c?.amount || 0)

                              return (
                                <TableRow key={String(c?.id)}>
                                  <TableCell className="text-xs font-mono text-muted-foreground">
                                    {dateStr ? format(new Date(dateStr), 'dd.MM.yy HH:mm') : '-'}
                                  </TableCell>
                                  <TableCell className="text-xs font-medium">{patientName}</TableCell>
                                  <TableCell className="text-xs">{procName}</TableCell>
                                  <TableCell className="text-xs text-right font-mono">
                                    {formatMoney(Number(c?.treatmentPrice || c?.amount || 0))} so'm
                                  </TableCell>
                                  <TableCell className="text-xs text-center font-mono">
                                    <Badge variant="outline" className="text-[10px]">
                                      {c?.rate || 30}%
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-xs text-right font-bold font-mono text-emerald-600">
                                    +{formatMoney(amt)} so'm
                                  </TableCell>
                                </TableRow>
                              )
                            })
                          )}
                        </TableBody>
                      </Table>
                    </div>

                    <TablePagination
                      totalCount={searchedStatement.length}
                      page={statementPage}
                      pageSize={statementPageSize}
                      onPageChange={setStatementPage}
                      onPageSizeChange={(newSize) => {
                        setStatementPageSize(newSize)
                        setStatementPage(1)
                      }}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        )}
      </Main>

      <PayrollFormModal
        isOpen={!!selectedDoctorForPayout}
        onClose={() => setSelectedDoctorForPayout(null)}
        doctor={selectedDoctorForPayout}
      />

      {/* Hidden Salary Slip Print component */}
      <div style={{ display: 'none' }}>
        <SalarySlipPrint
          ref={printRef}
          doctor={slipDoctorInfo}
          summary={slipSummaryInfo}
          items={slipItems}
        />
      </div>
    </div>
  )
}
