import { useState } from 'react'
import {
  useRevenueReport,
  useProceduresReport,
  useDepartmentsReport,
} from '@/api/hooks/use-reports'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { StatsCharts } from '@/components/stats-charts/stats-charts'

export function ReportsList() {
  const [period, setPeriod] = useState<string>('month')

  const { data: revenueData, isLoading: isRevLoading } = useRevenueReport(period)
  const { data: proceduresData } = useProceduresReport(period)
  const { data: departmentsData } = useDepartmentsReport(period)

  const totalRevenue = revenueData?.totalRevenue ?? revenueData?.total_revenue ?? 0
  const topProcedures = Array.isArray(proceduresData?.results)
    ? proceduresData.results
    : Array.isArray(proceduresData)
    ? proceduresData
    : []
  const departmentBreakdown = Array.isArray(departmentsData)
    ? departmentsData
    : Array.isArray(departmentsData?.results)
    ? departmentsData.results
    : []

  return (
    <>
      <Header>
        <div className='flex items-center gap-2 me-auto font-bold text-lg tracking-tight'>
          <span>📊 Hisobotlar va Analitika</span>
        </div>
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main>
        <div className='mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>Moliyaviy va Operatsion Hisobotlar</h1>
            <p className='text-xs text-muted-foreground'>
              Sana oralig’i va davrlar bo’yicha klinika tahlillari va statistikasi.
            </p>
          </div>

          <div className='flex items-center gap-2'>
            <span className='text-xs font-medium text-muted-foreground'>Davr:</span>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className='w-36 text-xs'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='day'>Bugun (Kunlik)</SelectItem>
                <SelectItem value='week'>Shu Hafta</SelectItem>
                <SelectItem value='month'>Shu Oy</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-3 gap-4 mb-6'>
          <Card className='shadow-sm'>
            <CardHeader className='pb-2'>
              <CardTitle className='text-xs font-medium text-muted-foreground'>
                Jami Tushgan Daromad
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
      </Main>
    </>
  )
}
