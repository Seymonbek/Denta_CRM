import { useState } from 'react'
import {
  Users,
  CreditCard,
  UserPlus,
  CheckCircle2,
  XCircle,
  TrendingUp,
  AlertCircle,
  LogOut,
  Package,
  DollarSign,
  Activity,
  Calendar,
} from 'lucide-react'
import { useDashboardReport, useDoctorMyAnalytics } from '@/api/hooks/use-reports'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { StatsCharts } from '@/components/stats-charts/stats-charts'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth-store'

export function Dashboard() {
  const [period, setPeriod] = useState<string>('month')
  const authUser = useAuthStore((state) => state.user)
  const isHeadDoctor = authUser?.role === 'bosh_shifokor'
  const isAdministrator = authUser?.role === 'administrator'
  const isDoctor = authUser?.role === 'doctor'

  const { data: report, isLoading, isError, error } = useDashboardReport(period, {
    enabled: isHeadDoctor,
  })
  const { data: doctorAnalytics, isLoading: isDocAnalyticsLoading } = useDoctorMyAnalytics(period)
  const resetAuth = useAuthStore((state) => state.reset)

  const topProcedures = Array.isArray(report?.topProcedures)
    ? report.topProcedures
    : Array.isArray(report?.top_procedures)
    ? report.top_procedures
    : []

  const departmentBreakdown = Array.isArray(report?.departmentBreakdown)
    ? report.departmentBreakdown
    : Array.isArray(report?.department_breakdown)
    ? report.department_breakdown
    : []

  // Support backend kpi payload nested structure
  const kpi = report?.kpi || {}
  const totalRevenue = kpi.revenue ?? report?.totalRevenue ?? report?.total_revenue ?? 0
  const totalPatients = kpi.newPatients ?? report?.totalPatients ?? report?.total_patients ?? 0
  const newPatientsCount = kpi.newPatients ?? report?.newPatientsCount ?? report?.new_patients_count ?? 0
  const completedAppts = kpi.appointmentsCompleted ?? report?.completedAppointments ?? report?.completed_appointments ?? 0
  const totalAppts = kpi.appointmentsTotal ?? report?.totalAppointments ?? report?.total_appointments ?? 0
  const cancelledAppts = report?.appointmentsByStatus?.cancelled ?? report?.cancelledAppointments ?? report?.cancelled_appointments ?? 0

  return (
    <>
      <Header>
        <div className='flex items-center gap-2 me-auto font-bold text-lg tracking-tight'>
          <span>📊 {isHeadDoctor ? 'KPI Dashboard' : isAdministrator ? 'Administrator Boshqaruv Paneli' : 'Shifokor Boshqaruv Paneli'}</span>
        </div>
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main>
        {isHeadDoctor && isError && (
          <div className='mb-6 p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-between gap-4 text-xs font-semibold'>
            <div className='flex items-center gap-2'>
              <AlertCircle className='h-5 w-5 shrink-0' />
              <span>
                Xatolik: {(error as any)?.response?.data?.error?.message || (error as any)?.response?.data?.detail || error?.message || "Ma'lumotlarni yuklashda xatolik yuz berdi."}
              </span>
            </div>
            <Button
              size='sm'
              variant='destructive'
              className='h-8 text-xs font-bold gap-1'
              onClick={() => {
                resetAuth()
                window.location.href = '/sign-in'
              }}
            >
              <LogOut className='h-3.5 w-3.5' /> Qaytadan kirish
            </Button>
          </div>
        )}

        {(isAdministrator || isDoctor) && (
          <div className='mb-6 p-6 rounded-2xl border border-primary/20 bg-primary/5 text-card-foreground flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm'>
            <div>
              <h2 className='text-xl font-bold tracking-tight'>
                Xush kelibsiz, {authUser?.first_name || authUser?.phone_number}! ({isAdministrator ? 'Administrator' : 'Shifokor'})
              </h2>
              <p className='text-xs text-muted-foreground mt-1'>
                {isAdministrator
                  ? "Bemorlarni ro'yxatga olish, navbatlarni boshqarish hamda kassa to'lovlarini chap menyu orqali amalgash oshiring."
                  : "Bugungi shaxsiy navbatlaringiz, bemorlaringiz tish kartalari va daromadingiz statistikasi."}
              </p>
            </div>
            <div className='flex flex-wrap items-center gap-2 shrink-0'>
              {isAdministrator ? (
                <>
                  <Button size='sm' onClick={() => (window.location.href = '/patients')}>
                    <UserPlus className='h-3.5 w-3.5 mr-1.5' /> Yangi Bemor Ro'yxatga Olish
                  </Button>
                  <Button size='sm' variant='outline' onClick={() => (window.location.href = '/appointments')}>
                    <Calendar className='h-3.5 w-3.5 mr-1.5' /> Navbat Yozish
                  </Button>
                  <Button size='sm' variant='secondary' onClick={() => (window.location.href = '/payments')}>
                    <CreditCard className='h-3.5 w-3.5 mr-1.5' /> Kassa & To'lovlar
                  </Button>
                </>
              ) : (
                <>
                  <Button size='sm' onClick={() => (window.location.href = '/appointments')}>
                    📋 Navbatlarim
                  </Button>
                  <Button size='sm' variant='outline' onClick={() => (window.location.href = '/patients')}>
                    👤 Bemorlarim
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        <div className='mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>
              {isHeadDoctor ? "Klinika Umumiy Ko'rsatkichlari" : isDoctor ? "Shaxsiy Ko'rsatkichlar va Statistika" : "Tezkor Boshqaruv va Bemorlar Qabuli"}
            </h1>
            <p className='text-xs text-muted-foreground'>
              {isHeadDoctor
                ? 'Real vaqtdagi moliyaviy, bemor va navbatlar statistikasi.'
                : isDoctor
                ? "Shaxsiy bajargan muolajalaringiz, tushum, material sarfi va ish haqingiz."
                : 'Klinikaga bemor kelganda bajariladigan asosiy tezkor jarayonlar.'}
            </p>
          </div>
          {(isHeadDoctor || isDoctor) && (
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className='w-[160px] h-9 text-xs font-semibold'>
                <SelectValue placeholder='Davrni tanlang' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='day'>Bugun</SelectItem>
                <SelectItem value='week'>Shu hafta</SelectItem>
                <SelectItem value='month'>Shu oy</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Administrator Quick Action Cards */}
        {isAdministrator && (
          <div className='grid gap-4 sm:grid-cols-3 mb-6'>
            <Card className='shadow-sm border-blue-500/20 bg-blue-500/5 hover:shadow-md transition-shadow cursor-pointer' onClick={() => (window.location.href = '/patients')}>
              <CardHeader className='pb-2'>
                <CardTitle className='text-sm font-bold flex items-center gap-2 text-blue-600 dark:text-blue-400'>
                  <UserPlus className='h-5 w-5' /> 1. Bemor Ro'yxatga Olish
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-2'>
                <p className='text-xs text-muted-foreground'>
                  Klinikaga yangi kelgan bemor ma'lumotlarini (F.I.SH, Telefon, Jinsi) tizimga kiritish va shaxsiy karta ochish.
                </p>
                <Button size='sm' className='w-full text-xs font-bold gap-1 mt-2'>
                  <UserPlus className='h-3.5 w-3.5' /> Bemor Qo'shish (/patients)
                </Button>
              </CardContent>
            </Card>

            <Card className='shadow-sm border-emerald-500/20 bg-emerald-500/5 hover:shadow-md transition-shadow cursor-pointer' onClick={() => (window.location.href = '/appointments')}>
              <CardHeader className='pb-2'>
                <CardTitle className='text-sm font-bold flex items-center gap-2 text-emerald-600 dark:text-emerald-400'>
                  <Calendar className='h-5 w-5' /> 2. Navbat Yozish & Qabul
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-2'>
                <p className='text-xs text-muted-foreground'>
                  Bemorni tanlangan shifokor qabuliga navbatga kiritish yoki kelgan bemor holatini "Kutmoqda" ga o'tkazish.
                </p>
                <Button size='sm' variant='outline' className='w-full text-xs font-bold gap-1 mt-2 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'>
                  <Calendar className='h-3.5 w-3.5' /> Navbatlar Jadvali (/appointments)
                </Button>
              </CardContent>
            </Card>

            <Card className='shadow-sm border-purple-500/20 bg-purple-500/5 hover:shadow-md transition-shadow cursor-pointer' onClick={() => (window.location.href = '/payments')}>
              <CardHeader className='pb-2'>
                <CardTitle className='text-sm font-bold flex items-center gap-2 text-purple-600 dark:text-purple-400'>
                  <CreditCard className='h-5 w-5' /> 3. To'lov Qabul Qilish (Kassa)
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-2'>
                <p className='text-xs text-muted-foreground'>
                  Muolajasi yakunlangan bemor to'lovini naqd, karta yoki Click/Payme orqali qabul qilish hamda chek berish.
                </p>
                <Button size='sm' variant='secondary' className='w-full text-xs font-bold gap-1 mt-2'>
                  <CreditCard className='h-3.5 w-3.5' /> Kassa & To'lovlar (/payments)
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Doctor Personal Stat Cards */}
        {isDoctor && (
          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6'>
            <Card className='shadow-sm border-emerald-500/20 bg-emerald-500/5 hover:shadow transition-shadow'>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-xs font-semibold text-muted-foreground'>
                  Jami Bajarilgan Ishlar (Tushum)
                </CardTitle>
                <DollarSign className='h-4 w-4 text-emerald-500' />
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold text-emerald-600 dark:text-emerald-400'>
                  {isDocAnalyticsLoading ? '...' : `${Number(doctorAnalytics?.totalRevenue || 0).toLocaleString()} so'm`}
                </div>
                <p className='text-[11px] text-muted-foreground mt-1'>
                  To'langan: {Number(doctorAnalytics?.paidRevenue || 0).toLocaleString()} so'm
                </p>
              </CardContent>
            </Card>

            <Card className='shadow-sm border-rose-500/20 bg-rose-500/5 hover:shadow transition-shadow'>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-xs font-semibold text-muted-foreground'>
                  Material Sarfi (Chiqim)
                </CardTitle>
                <Package className='h-4 w-4 text-rose-500' />
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold text-rose-600 dark:text-rose-400'>
                  {isDocAnalyticsLoading ? '...' : `${Number(doctorAnalytics?.totalMaterialCost || 0).toLocaleString()} so'm`}
                </div>
                <p className='text-[11px] text-muted-foreground mt-1'>
                  Muolajalarga ketgan materiallar
                </p>
              </CardContent>
            </Card>

            <Card className='shadow-sm border-blue-500/20 bg-blue-500/5 hover:shadow transition-shadow'>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-xs font-semibold text-muted-foreground'>
                  Sof Ish Haqi (Komissiya)
                </CardTitle>
                <TrendingUp className='h-4 w-4 text-blue-500' />
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold text-blue-600 dark:text-blue-400'>
                  {isDocAnalyticsLoading ? '...' : `${Number(doctorAnalytics?.earnedCommission || 0).toLocaleString()} so'm`}
                </div>
                <p className='text-[11px] text-muted-foreground mt-1'>
                  Komissiya stavkasi: {doctorAnalytics?.commissionRate || '30'}%
                </p>
              </CardContent>
            </Card>

            <Card className='shadow-sm border-purple-500/20 bg-purple-500/5 hover:shadow transition-shadow'>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-xs font-semibold text-muted-foreground'>
                  Davolangan Bemorlar
                </CardTitle>
                <Users className='h-4 w-4 text-purple-500' />
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold text-purple-600 dark:text-purple-400'>
                  {isDocAnalyticsLoading ? '...' : `${doctorAnalytics?.totalPatientsTreated || 0} ta bemor`}
                </div>
                <p className='text-[11px] text-muted-foreground mt-1'>
                  Jami muolajalar: {doctorAnalytics?.totalTreatmentsCount || 0} ta
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* KPI Cards & Charts for Bosh Shifokor */}
        {isHeadDoctor && (
          <>
            <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6'>
              <Card className='shadow-sm hover:shadow transition-shadow'>
                <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                  <CardTitle className='text-xs font-medium text-muted-foreground'>
                    Umumiy Daromad
                  </CardTitle>
                  <CreditCard className='h-4 w-4 text-emerald-500' />
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-bold text-emerald-600 dark:text-emerald-400'>
                    {isLoading
                      ? '...'
                      : `${Number(totalRevenue).toLocaleString()} so'm`}
                  </div>
                  <p className='text-[11px] text-muted-foreground mt-1 flex items-center gap-1'>
                    <TrendingUp className='h-3 w-3 text-emerald-500' /> Tushgan barcha to'lovlar
                  </p>
                </CardContent>
              </Card>

              <Card className='shadow-sm hover:shadow transition-shadow'>
                <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                  <CardTitle className='text-xs font-medium text-muted-foreground'>
                    Jami Bemorlar
                  </CardTitle>
                  <Users className='h-4 w-4 text-blue-500' />
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-bold'>
                    {isLoading ? '...' : totalPatients} ta
                  </div>
                  <p className='text-[11px] text-muted-foreground mt-1 flex items-center gap-1'>
                    <UserPlus className='h-3 w-3 text-blue-500' /> +{newPatientsCount} ta yangi
                  </p>
                </CardContent>
              </Card>

              <Card className='shadow-sm hover:shadow transition-shadow'>
                <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                  <CardTitle className='text-xs font-medium text-muted-foreground'>
                    Bajarilgan Navbatlar
                  </CardTitle>
                  <CheckCircle2 className='h-4 w-4 text-emerald-500' />
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-bold'>
                    {isLoading ? '...' : `${completedAppts} / ${totalAppts}`}
                  </div>
                  <p className='text-[11px] text-muted-foreground mt-1'>
                    Muvaffaqiyatli yakunlangan
                  </p>
                </CardContent>
              </Card>

              <Card className='shadow-sm hover:shadow transition-shadow'>
                <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                  <CardTitle className='text-xs font-medium text-muted-foreground'>
                    Bekor Qilingan Navbatlar
                  </CardTitle>
                  <XCircle className='h-4 w-4 text-rose-500' />
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-bold text-rose-600 dark:text-rose-400'>
                    {isLoading ? '...' : cancelledAppts} ta
                  </div>
                  <p className='text-[11px] text-muted-foreground mt-1'>
                    Mijoz bekor qilgan
                  </p>
                </CardContent>
              </Card>
            </div>

            <StatsCharts
              topProcedures={topProcedures}
              departmentBreakdown={departmentBreakdown}
            />
          </>
        )}
      </Main>
    </>
  )
}
