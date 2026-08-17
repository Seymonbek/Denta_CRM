import { useState } from 'react'
import {
  useRevenueReport,
  useProceduresReport,
  useDepartmentsReport,
  useDoctorMyAnalytics,
  useReceptionAnalytics,
} from '@/api/hooks/use-reports'
import { useDoctors } from '@/api/hooks/use-doctors'
import { useMe } from '@/api/hooks/use-auth'
import { type DoctorProfile } from '@/types/api'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { StatsCharts } from '@/components/stats-charts/stats-charts'
import { exportToExcel, exportToPDF } from '@/utils/export'
import {
  DollarSign,
  Users,
  Activity,
  Package,
  Clock,
  CheckCircle2,
  CreditCard,
  TrendingUp,
  Award,
  AlertCircle,
  UserCheck,
  BarChart3,
  Download,
  FileText,
  FileSpreadsheet,
} from 'lucide-react'

export function ReportsList() {
  const [period, setPeriod] = useState<string>('month')
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('')
  const { data: user } = useMe()

  const role = user?.role || 'bosh_shifokor'
  const isBoshShifokor = role === 'bosh_shifokor'
  const isDoctor = role === 'doctor'
  const isReception = role === 'administrator'

  // Queries
  const { data: revenueData, isLoading: isRevLoading } = useRevenueReport(period)
  const { data: proceduresData } = useProceduresReport(period)
  const { data: departmentsData } = useDepartmentsReport(period)

  const { data: doctorsData } = useDoctors()
  const doctorsList = Array.isArray(doctorsData) ? doctorsData : []

  const { data: doctorAnalytics, isLoading: isDocAnalyticsLoading } = useDoctorMyAnalytics(
    period,
    isBoshShifokor && selectedDoctorId ? selectedDoctorId : undefined
  )

  const { data: receptionAnalytics, isLoading: isReceptionLoading } = useReceptionAnalytics(period)

  const totalRevenue = revenueData?.total ?? revenueData?.totalRevenue ?? revenueData?.total_revenue ?? 0
  const topProcedures = Array.isArray(proceduresData?.results)
    ? proceduresData.results
    : Array.isArray(proceduresData)
    ? proceduresData
    : []
  const departmentBreakdown = Array.isArray(departmentsData?.results)
    ? departmentsData.results
    : Array.isArray(departmentsData)
    ? departmentsData
    : []

  // Eksport funksiyalari
  const handleExportDoctorAnalytics = (format: 'pdf' | 'excel') => {
    if (!doctorAnalytics) return
    const columns = [
      { header: 'Muolaja Nomi', key: 'name', width: 30 },
      { header: 'Soni', key: 'count', width: 10 },
      { header: 'Jami Tushum', key: 'totalAmount', width: 20 },
    ]
    const data = doctorAnalytics.procedureBreakdown || []
    const filename = `Shifokor_Analitikasi_${period}`

    if (format === 'pdf') {
      exportToPDF(data, columns, "Shifokor Bo'yicha Bajarilgan Muolajalar", filename)
    } else {
      exportToExcel(data, columns, filename)
    }
  }

  const handleExportReception = (format: 'pdf' | 'excel') => {
    if (!receptionAnalytics) return
    const columns = [
      { header: "To'lov Usuli", key: 'methodLabel', width: 20 },
      { header: "To'lovlar Soni", key: 'count', width: 15 },
      { header: 'Jami Tushgan Summa', key: 'total', width: 20 },
    ]
    const data = (receptionAnalytics.byMethod || []).map((item: Record<string, unknown>) => {
      const methodLabel =
        item.method === 'cash'
          ? 'Naqd Pul'
          : item.method === 'card'
          ? 'Terminal (Karta)'
          : item.method === 'payme'
          ? 'Payme'
          : item.method === 'click'
          ? 'Click'
          : item.method === 'bank_transfer'
          ? "Bank O'tkazmasi"
          : String(item.method || '')
      return { ...item, methodLabel }
    })
    const filename = `Kassa_Tushumi_${period}`

    if (format === 'pdf') {
      exportToPDF(data, columns, "Kassa Tushumi va To'lov Usullari", filename)
    } else {
      exportToExcel(data, columns, filename)
    }
  }

  const handleExportProcedures = (format: 'pdf' | 'excel') => {
    if (!topProcedures) return
    const columns = [
      { header: 'Muolaja Nomi', key: 'name', width: 30 },
      { header: 'Soni', key: 'count', width: 10 },
      { header: 'Tushum', key: 'revenue', width: 20 },
    ]
    const filename = `Klinika_Muolajalari_${period}`

    if (format === 'pdf') {
      exportToPDF(topProcedures, columns, "Klinika Bo'yicha Top Muolajalar", filename)
    } else {
      exportToExcel(topProcedures, columns, filename)
    }
  }

  return (
    <>
      <Header>
        <div className='flex items-center gap-2 me-auto font-bold text-lg tracking-tight'>
          <BarChart3 className='h-5 w-5 text-primary' />
          <span>Hisobotlar va Analitika</span>
        </div>
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main>
        {/* Header Controls */}
        <div className='mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight flex items-center gap-2'>
              <BarChart3 className='h-6 w-6 text-primary' />
              {isDoctor
                ? 'Shifokor Shaxsiy Analitika va Daromad Paneli'
                : isReception
                ? 'Kassa va Qabullar Analitikasi'
                : 'Klinika Umumiy Analitika va Boshqaruv Paneli'}
            </h1>
            <p className='text-xs text-muted-foreground'>
              Sana oralig’i va davrlar bo’yicha real-vaqt rejimida hisobotlar va tahlillar.
            </p>
          </div>

          <div className='flex items-center gap-3'>
            {isBoshShifokor && doctorsList.length > 0 && (
              <div className='flex items-center gap-1.5'>
                <span className='text-xs font-medium text-muted-foreground'>Shifokor:</span>
                <Select value={selectedDoctorId} onValueChange={setSelectedDoctorId}>
                  <SelectTrigger className='w-48 text-xs h-9'>
                    <SelectValue placeholder="Barcha / O'zim" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value=''>Barchasini ko'rish</SelectItem>
                    {doctorsList.map((d: DoctorProfile) => {
                      const firstName = d.user?.firstName || ''
                      const lastName = d.user?.lastName || ''
                      const fullName = `${firstName} ${lastName}`.trim() || 'Shifokor'
                      const isMe = d.user?.id === user?.id
                      return (
                        <SelectItem key={d.id} value={d.id}>
                          Dr. {fullName} {isMe ? "(O'zim)" : ''}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className='flex items-center gap-1.5'>
              <span className='text-xs font-medium text-muted-foreground'>Davr:</span>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className='w-36 text-xs h-9'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='day'>Bugun (Kunlik)</SelectItem>
                  <SelectItem value='week'>Shu Hafta</SelectItem>
                  <SelectItem value='month'>Shu Oy</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Eksport Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='outline' size='sm' className='h-9 text-xs gap-2 font-medium bg-background shadow-xs hover:bg-muted/50 border-primary/20'>
                  <Download className='h-4 w-4 text-primary' /> Eksport
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end' className='w-48'>
                <DropdownMenuItem
                  onClick={() => {
                    if (isDoctor || (isBoshShifokor && selectedDoctorId)) handleExportDoctorAnalytics('excel')
                    else if (isReception) handleExportReception('excel')
                    else handleExportProcedures('excel')
                  }}
                  className='cursor-pointer text-xs font-medium'
                >
                  <FileSpreadsheet className='h-4 w-4 mr-2 text-emerald-600' /> Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    if (isDoctor || (isBoshShifokor && selectedDoctorId)) handleExportDoctorAnalytics('pdf')
                    else if (isReception) handleExportReception('pdf')
                    else handleExportProcedures('pdf')
                  }}
                  className='cursor-pointer text-xs font-medium'
                >
                  <FileText className='h-4 w-4 mr-2 text-rose-600' /> PDF (.pdf)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* SECTION 1: DOCTOR PERSONAL DASHBOARD (For Doctor OR Bosh Shifokor inspecting doctor) */}
        {(isDoctor || (isBoshShifokor && selectedDoctorId)) && (
          <div className='space-y-6 mb-8'>
            <div className='flex items-center justify-between border-b pb-3'>
              <div className='flex items-center gap-2'>
                <Award className='h-5 w-5 text-emerald-500' />
                <h2 className='text-lg font-bold text-foreground'>
                  {doctorAnalytics?.doctorName || 'Shifokor'} — Shaxsiy Ish va Ish Haqi Ko'rsatkichlari
                </h2>
              </div>
              <Badge variant='outline' className='text-xs font-mono py-1 px-3 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'>
                Oylik Komissiya: {doctorAnalytics?.commissionRate || '30'}%
              </Badge>
            </div>

            {isDocAnalyticsLoading ? (
              <div className='py-8 text-center text-xs text-muted-foreground animate-pulse'>
                Shifokor analitikasi yuklanmoqda...
              </div>
            ) : (
              <>
                {/* 5 Stat Cards Grid */}
                <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3'>
                  {/* Card 1: Total Revenue */}
                  <Card className='shadow-xs border-emerald-500/20 bg-emerald-500/5'>
                    <CardHeader className='pb-2 flex flex-row items-center justify-between space-y-0 p-3'>
                      <CardTitle className='text-xs font-semibold text-muted-foreground'>
                        Jami Tushum
                      </CardTitle>
                      <DollarSign className='h-4 w-4 text-emerald-600 dark:text-emerald-400' />
                    </CardHeader>
                    <CardContent className='p-3 pt-0'>
                      <div className='text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400'>
                        {Number(doctorAnalytics?.totalRevenue || 0).toLocaleString()} so'm
                      </div>
                      <p className='text-[10px] text-muted-foreground mt-1'>
                        To'langan: {Number(doctorAnalytics?.paidRevenue || 0).toLocaleString()} so'm
                      </p>
                    </CardContent>
                  </Card>

                  {/* Card 2: Material Expense */}
                  <Card className='shadow-xs border-rose-500/20 bg-rose-500/5'>
                    <CardHeader className='pb-2 flex flex-row items-center justify-between space-y-0 p-3'>
                      <CardTitle className='text-xs font-semibold text-muted-foreground'>
                        Material Sarfi (Chiqim)
                      </CardTitle>
                      <Package className='h-4 w-4 text-rose-600 dark:text-rose-400' />
                    </CardHeader>
                    <CardContent className='p-3 pt-0'>
                      <div className='text-xl font-bold font-mono text-rose-600 dark:text-rose-400'>
                        {Number(doctorAnalytics?.totalMaterialCost || 0).toLocaleString()} so'm
                      </div>
                      <p className='text-[10px] text-muted-foreground mt-1'>
                        Ishlatilgan materiallar tannarxi
                      </p>
                    </CardContent>
                  </Card>

                  {/* Card 3: Earned Commission / Net Earnings */}
                  <Card className='shadow-xs border-blue-500/20 bg-blue-500/5'>
                    <CardHeader className='pb-2 flex flex-row items-center justify-between space-y-0 p-3'>
                      <CardTitle className='text-xs font-semibold text-muted-foreground'>
                        Sof Ish Haqi (Komissiya)
                      </CardTitle>
                      <TrendingUp className='h-4 w-4 text-blue-600 dark:text-blue-400' />
                    </CardHeader>
                    <CardContent className='p-3 pt-0'>
                      <div className='text-xl font-bold font-mono text-blue-600 dark:text-blue-400'>
                        {Number(doctorAnalytics?.earnedCommission || 0).toLocaleString()} so'm
                      </div>
                      <p className='text-[10px] text-muted-foreground mt-1'>
                        Ulashish stavkasi: {doctorAnalytics?.commissionRate || '30'}%
                      </p>
                    </CardContent>
                  </Card>

                  {/* Card 4: Patients & Treatments */}
                  <Card className='shadow-xs border-purple-500/20 bg-purple-500/5'>
                    <CardHeader className='pb-2 flex flex-row items-center justify-between space-y-0 p-3'>
                      <CardTitle className='text-xs font-semibold text-muted-foreground'>
                        Davolangan Bemorlar
                      </CardTitle>
                      <Users className='h-4 w-4 text-purple-600 dark:text-purple-400' />
                    </CardHeader>
                    <CardContent className='p-3 pt-0'>
                      <div className='text-xl font-bold font-mono text-purple-600 dark:text-purple-400'>
                        {doctorAnalytics?.totalPatientsTreated || 0} ta bemor
                      </div>
                      <p className='text-[10px] text-muted-foreground mt-1'>
                        Jami muolajalar: {doctorAnalytics?.totalTreatmentsCount || 0} ta
                      </p>
                    </CardContent>
                  </Card>

                  {/* Card 5: Appointments & Cancelled Value */}
                  <Card className='shadow-xs border-amber-500/20 bg-amber-500/5'>
                    <CardHeader className='pb-2 flex flex-row items-center justify-between space-y-0 p-3'>
                      <CardTitle className='text-xs font-semibold text-muted-foreground'>
                        Muvaffaqiyatli Qabullar
                      </CardTitle>
                      <CheckCircle2 className='h-4 w-4 text-amber-600 dark:text-amber-400' />
                    </CardHeader>
                    <CardContent className='p-3 pt-0'>
                      <div className='text-xl font-bold font-mono text-amber-600 dark:text-amber-400'>
                        {doctorAnalytics?.appointments?.completed || 0} / {doctorAnalytics?.appointments?.total || 0}
                      </div>
                      <p className='text-[10px] text-muted-foreground mt-1'>
                        Bekor bo'lgan: {doctorAnalytics?.appointments?.canceled || 0} ta ({doctorAnalytics?.appointments?.cancellationRatePercent || 0}%)
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* 2 Detailed Analytical Tables */}
                <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
                  {/* Table 1: Procedure Breakdown */}
                  <Card className='shadow-xs'>
                    <CardHeader className='py-3 border-b'>
                      <CardTitle className='text-sm font-bold flex items-center gap-2'>
                        <Activity className='h-4 w-4 text-primary' /> Bajarilgan Muolajalar Tahlili
                      </CardTitle>
                      <CardDescription className='text-xs'>
                        Shifokor tomonidan amalga oshirilgan muolajalar turlari va ularning qiymati
                      </CardDescription>
                    </CardHeader>
                    <CardContent className='p-0'>
                      {Array.isArray(doctorAnalytics?.procedureBreakdown) && doctorAnalytics.procedureBreakdown.length > 0 ? (
                        <div className='overflow-x-auto'>
                          <table className='w-full text-left text-xs'>
                            <thead className='bg-muted/50 text-muted-foreground font-semibold border-b'>
                              <tr>
                                <th className='p-3'>Muolaja Nomi</th>
                                <th className='p-3 text-center'>Soni</th>
                                <th className='p-3 text-right'>Jami Tushum</th>
                              </tr>
                            </thead>
                            <tbody className='divide-y'>
                              {doctorAnalytics.procedureBreakdown.map((proc: any, idx: number) => (
                                <tr key={String(proc.name || idx)} className='hover:bg-muted/20'>
                                  <td className='p-3 font-semibold text-foreground'>{String(proc.name || 'Muolaja')}</td>
                                  <td className='p-3 text-center font-mono font-bold'>{String(proc.count || 0)} ta</td>
                                  <td className='p-3 text-right font-mono text-emerald-600 dark:text-emerald-400 font-bold'>
                                    {Number(proc.totalAmount || 0).toLocaleString()} so'm
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className='text-xs text-muted-foreground text-center py-6 italic'>
                          Ushbu davrda muolajalar yozib olinmagan
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Table 2: Material Usage & Costs */}
                  <Card className='shadow-xs'>
                    <CardHeader className='py-3 border-b'>
                      <div className='flex items-center justify-between'>
                        <div>
                          <CardTitle className='text-sm font-bold flex items-center gap-2'>
                            <Package className='h-4 w-4 text-rose-500' /> Ishlatilgan Materiallar va Sarf
                          </CardTitle>
                          <CardDescription className='text-xs'>
                            Muolajalar uchun sarflangan materiallar va ularning umumiy tannarxi
                          </CardDescription>
                        </div>
                        <Badge variant='outline' className='text-[10px] font-mono border-rose-500/30 text-rose-600 dark:text-rose-400'>
                          Sarflangan: {Number(doctorAnalytics?.totalMaterialCost || 0).toLocaleString()} so'm
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className='p-0'>
                      {Array.isArray(doctorAnalytics?.materialsUsed) && doctorAnalytics.materialsUsed.length > 0 ? (
                        <div className='overflow-x-auto'>
                          <table className='w-full text-left text-xs'>
                            <thead className='bg-muted/50 text-muted-foreground font-semibold border-b'>
                              <tr>
                                <th className='p-3'>Material Nomi</th>
                                <th className='p-3 text-center'>Miqdori</th>
                                <th className='p-3 text-right'>Chiqim Narxi</th>
                              </tr>
                            </thead>
                            <tbody className='divide-y'>
                              {doctorAnalytics.materialsUsed.map((mat: any, idx: number) => (
                                <tr key={String(mat.materialName || idx)} className='hover:bg-muted/20'>
                                  <td className='p-3 font-semibold text-foreground'>{String(mat.materialName || 'Material')}</td>
                                  <td className='p-3 text-center font-mono font-bold'>
                                    {String(mat.quantity || 0)} {String(mat.unit || '')}
                                  </td>
                                  <td className='p-3 text-right font-mono text-rose-600 dark:text-rose-400 font-bold'>
                                    {Number(mat.totalCost || 0).toLocaleString()} so'm
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className='text-xs text-muted-foreground text-center py-6 italic'>
                          Ushbu davrda sarflangan materiallar hisobga olinmagan
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </div>
        )}

        {/* SECTION 2: RECEPTION & CASH REGISTER DASHBOARD (For Administrator OR Bosh Shifokor) */}
        {(isReception || (isBoshShifokor && !selectedDoctorId)) && (
          <div className='space-y-6 mb-8'>
            <div className='flex items-center justify-between border-b pb-3'>
              <div className='flex items-center gap-2'>
                <CreditCard className='h-5 w-5 text-blue-500' />
                <h2 className='text-lg font-bold text-foreground'>
                  Kassa Tushumi va Qabullar Tahlili
                </h2>
              </div>
            </div>

            {isReceptionLoading ? (
              <div className='py-8 text-center text-xs text-muted-foreground animate-pulse'>
                Kassa va qabullar tahlili yuklanmoqda...
              </div>
            ) : (
              <>
                {/* 4 Reception Stat Cards */}
                <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
                  <Card className='shadow-xs border-emerald-500/20 bg-emerald-500/5'>
                    <CardHeader className='pb-2 flex flex-row items-center justify-between space-y-0'>
                      <CardTitle className='text-xs font-semibold text-muted-foreground'>
                        Kassaga Qabul Qilingan Pulla
                      </CardTitle>
                      <DollarSign className='h-4 w-4 text-emerald-600 dark:text-emerald-400' />
                    </CardHeader>
                    <CardContent>
                      <div className='text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400'>
                        {Number(receptionAnalytics?.totalPaymentsCollected || 0).toLocaleString()} so'm
                      </div>
                      <p className='text-[11px] text-muted-foreground mt-1'>
                        To'lovlar soni: {receptionAnalytics?.paymentsCount || 0} ta
                      </p>
                    </CardContent>
                  </Card>

                  <Card className='shadow-xs border-blue-500/20 bg-blue-500/5'>
                    <CardHeader className='pb-2 flex flex-row items-center justify-between space-y-0'>
                      <CardTitle className='text-xs font-semibold text-muted-foreground'>
                        Yakunlangan Qabullar
                      </CardTitle>
                      <UserCheck className='h-4 w-4 text-blue-600 dark:text-blue-400' />
                    </CardHeader>
                    <CardContent>
                      <div className='text-2xl font-bold font-mono text-blue-600 dark:text-blue-400'>
                        {receptionAnalytics?.appointments?.completed || 0} ta
                      </div>
                      <p className='text-[11px] text-muted-foreground mt-1'>
                        Jami navbatlar: {receptionAnalytics?.appointments?.total || 0} ta
                      </p>
                    </CardContent>
                  </Card>

                  <Card className='shadow-xs border-amber-500/20 bg-amber-500/5'>
                    <CardHeader className='pb-2 flex flex-row items-center justify-between space-y-0'>
                      <CardTitle className='text-xs font-semibold text-muted-foreground'>
                        Kutilayotgan Navbatlar
                      </CardTitle>
                      <Clock className='h-4 w-4 text-amber-600 dark:text-amber-400' />
                    </CardHeader>
                    <CardContent>
                      <div className='text-2xl font-bold font-mono text-amber-600 dark:text-amber-400'>
                        {receptionAnalytics?.appointments?.scheduled || 0} ta
                      </div>
                      <p className='text-[11px] text-muted-foreground mt-1'>
                        Bekor qilingan: {receptionAnalytics?.appointments?.canceled || 0} ta
                      </p>
                    </CardContent>
                  </Card>

                  <Card className='shadow-xs border-rose-500/20 bg-rose-500/5'>
                    <CardHeader className='pb-2 flex flex-row items-center justify-between space-y-0'>
                      <CardTitle className='text-xs font-semibold text-muted-foreground'>
                        Tizimdagi Qarzdorliklar
                      </CardTitle>
                      <AlertCircle className='h-4 w-4 text-rose-600 dark:text-rose-400' />
                    </CardHeader>
                    <CardContent>
                      <div className='text-2xl font-bold font-mono text-rose-600 dark:text-rose-400'>
                        {Number(receptionAnalytics?.unpaidTreatmentsTotal || 0).toLocaleString()} so'm
                      </div>
                      <p className='text-[11px] text-muted-foreground mt-1'>
                        To'lanmagan muolajalar: {receptionAnalytics?.unpaidTreatmentsCount || 0} ta
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Payment Methods Breakdown Table */}
                <Card className='shadow-xs'>
                  <CardHeader className='py-3 border-b'>
                    <CardTitle className='text-sm font-bold flex items-center gap-2'>
                      <CreditCard className='h-4 w-4 text-primary' /> To'lov Usullari Bo'yicha Tahlil
                    </CardTitle>
                    <CardDescription className='text-xs'>
                      Naqd pulsiz va naqd shakldagi to'lovlar taqsimoti
                    </CardDescription>
                  </CardHeader>
                  <CardContent className='p-0'>
                    {Array.isArray(receptionAnalytics?.byMethod) && receptionAnalytics.byMethod.length > 0 ? (
                      <div className='overflow-x-auto'>
                        <table className='w-full text-left text-xs'>
                          <thead className='bg-muted/50 text-muted-foreground font-semibold border-b'>
                            <tr>
                              <th className='p-3'>To'lov Usuli</th>
                              <th className='p-3 text-center'>To'lovlar Soni</th>
                              <th className='p-3 text-right'>Jami Tushgan Summa</th>
                            </tr>
                          </thead>
                          <tbody className='divide-y'>
                            {receptionAnalytics.byMethod.map((item: any) => {
                              const methodLabel =
                                item.method === 'cash'
                                  ? '💵 Naqd Pul'
                                  : item.method === 'card'
                                  ? '💳 Terminal (Karta)'
                                  : item.method === 'payme'
                                  ? '📱 Payme'
                                  : item.method === 'click'
                                  ? '📲 Click'
                                  : item.method === 'bank_transfer'
                                  ? "🏛️ Bank O'tkazmasi"
                                  : String(item.method || '')

                              return (
                                <tr key={String(item.method)} className='hover:bg-muted/20'>
                                  <td className='p-3 font-semibold text-foreground'>{methodLabel}</td>
                                  <td className='p-3 text-center font-mono font-bold'>{item.count} ta</td>
                                  <td className='p-3 text-right font-mono text-emerald-600 dark:text-emerald-400 font-bold'>
                                    {Number(item.total || 0).toLocaleString()} so'm
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className='text-xs text-muted-foreground text-center py-6 italic'>
                        Ushbu davrda to'lovlar qayd etilmagan
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        )}

        {/* SECTION 3: BOSH SHIFOKOR EXECUTIVE DASHBOARD (For Bosh Shifokor overall view) */}
        {isBoshShifokor && !selectedDoctorId && (
          <div className='space-y-6'>
            <div className='grid grid-cols-1 md:grid-cols-3 gap-4 mb-6'>
              <Card className='shadow-sm border-emerald-500/20 bg-emerald-500/5'>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-xs font-medium text-muted-foreground'>
                    Jami Tushgan Klinika Daromadi
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400'>
                    {isRevLoading ? '...' : `${Number(totalRevenue).toLocaleString()} so'm`}
                  </div>
                </CardContent>
              </Card>

              <Card className='shadow-sm'>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-xs font-medium text-muted-foreground'>
                    Top Muolajalar Turi Soni
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-bold font-mono'>
                    {topProcedures.length} ta
                  </div>
                </CardContent>
              </Card>

              <Card className='shadow-sm'>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-xs font-medium text-muted-foreground'>
                    Qamrab Olingan Bo'limlar
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-bold font-mono'>
                    {departmentBreakdown.length} ta
                  </div>
                </CardContent>
              </Card>
            </div>

            <StatsCharts
              topProcedures={topProcedures}
              departmentBreakdown={departmentBreakdown}
            />
          </div>
        )}
      </Main>
    </>
  )
}
