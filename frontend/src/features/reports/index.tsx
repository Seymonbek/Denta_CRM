import { useState } from 'react'
import { BarChart3, TrendingUp, DollarSign, Calendar } from 'lucide-react'
import {
  useRevenueReport,
  useProceduresReport,
  useDepartmentsReport,
} from '@/api/hooks/use-reports'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatsCharts } from '@/components/stats-charts/stats-charts'

export function ReportsList() {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data: revenueData } = useRevenueReport({ dateFrom, dateTo })
  const { data: proceduresData } = useProceduresReport({ dateFrom, dateTo })
  const { data: departmentsData } = useDepartmentsReport({ dateFrom, dateTo })

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
              Sana oralig’i bo’yicha klinika tahlillari va statistikasi.
            </p>
          </div>

          <div className='flex items-center gap-2'>
            <div className='flex items-center gap-1.5'>
              <span className='text-xs text-muted-foreground'>Dan:</span>
              <Input
                type='date'
                className='h-8 text-xs font-mono w-32'
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className='flex items-center gap-1.5'>
              <span className='text-xs text-muted-foreground'>Gacha:</span>
              <Input
                type='date'
                className='h-8 text-xs font-mono w-32'
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-3 gap-4 mb-6'>
          <Card>
            <CardHeader className='pb-2'>
              <CardTitle className='text-xs font-medium text-muted-foreground'>
                Tanlangan Oraliqdagi Jami Daromad
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400'>
                {revenueData?.totalRevenue
                  ? `${Number(revenueData.totalRevenue).toLocaleString()} so'm`
                  : "0 so'm"}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='pb-2'>
              <CardTitle className='text-xs font-medium text-muted-foreground'>
                Amalga Oshirilgan Muolajalar Soni
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold font-mono'>
                {proceduresData?.totalCount || 0} ta
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='pb-2'>
              <CardTitle className='text-xs font-medium text-muted-foreground'>
                Faol Bo'limlar
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold font-mono'>
                {departmentsData?.length || 0} ta
              </div>
            </CardContent>
          </Card>
        </div>

        <StatsCharts
          topProcedures={proceduresData?.results || []}
          departmentBreakdown={departmentsData || []}
        />
      </Main>
    </>
  )
}
