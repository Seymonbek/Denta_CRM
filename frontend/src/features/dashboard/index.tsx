import { useState } from 'react'
import {
  Users,
  Calendar,
  CreditCard,
  UserPlus,
  CheckCircle2,
  XCircle,
  TrendingUp,
} from 'lucide-react'
import { useDashboardReport } from '@/api/hooks/use-reports'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { StatsCharts } from '@/components/stats-charts/stats-charts'
import {
  Card,
  CardContent,
  CardDescription,
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

export function Dashboard() {
  const [period, setPeriod] = useState<string>('month')
  const { data: report, isLoading } = useDashboardReport(period)

  return (
    <>
      <Header>
        <div className='flex items-center gap-2 me-auto font-bold text-lg tracking-tight'>
          <span>📊 KPI Dashboard</span>
        </div>
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main>
        <div className='mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>Klinika Umumiy Ko'rsatkichlari</h1>
            <p className='text-xs text-muted-foreground'>
              Real vaqtdagi moliyaviy, bemor va navbatlar statistikasi.
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <span className='text-xs font-medium text-muted-foreground'>Davr:</span>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className='w-32 text-xs'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='day'>Bugun (Kunlik)</SelectItem>
                <SelectItem value='week'>Shu hafta</SelectItem>
                <SelectItem value='month'>Shu oy</SelectItem>
                <SelectItem value='year'>Shu yil</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* KPI Cards */}
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
                  : `${Number(report?.totalRevenue || 0).toLocaleString()} so'm`}
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
                {isLoading ? '...' : report?.totalPatients || 0} ta
              </div>
              <p className='text-[11px] text-muted-foreground mt-1 flex items-center gap-1'>
                <UserPlus className='h-3 w-3 text-blue-500' /> +{report?.newPatientsCount || 0} ta yangi
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
                {isLoading ? '...' : report?.completedAppointments || 0} / {report?.totalAppointments || 0}
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
                {isLoading ? '...' : report?.cancelledAppointments || 0} ta
              </div>
              <p className='text-[11px] text-muted-foreground mt-1'>
                Mijoz bekor qilgan
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <StatsCharts
          topProcedures={report?.topProcedures}
          departmentBreakdown={report?.departmentBreakdown}
        />
      </Main>
    </>
  )
}
