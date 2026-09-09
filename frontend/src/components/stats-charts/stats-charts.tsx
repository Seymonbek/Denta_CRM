import { useState } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  LabelList,
} from 'recharts'
import { Activity, PieChart as PieIcon, BarChart3, TrendingUp, Award, DollarSign, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface TopProcedure {
  name?: string
  procedureTypeName?: string
  count?: number
  revenue?: string | number
}

interface DepartmentBreakdown {
  name?: string
  departmentName?: string
  revenue?: string | number
  treatments?: number
  patientCount?: number
}

interface ExpenseCategory {
  categoryId?: string | null
  name?: string
  amount?: string | number
  count?: number
}

interface TimelinePoint {
  date: string
  label?: string
  revenue?: string | number
  expense?: string | number
  netProfit?: string | number
}

interface TopDoctorItem {
  doctorId?: string
  firstName?: string
  lastName?: string
  specialization?: string
  treatments?: number
  revenue?: string | number
  averageTicket?: string | number
}

interface StatsChartsProps {
  topProcedures?: TopProcedure[]
  departmentBreakdown?: DepartmentBreakdown[]
  expensesByCategory?: ExpenseCategory[]
  timeline?: TimelinePoint[]
  topDoctors?: TopDoctorItem[]
}

const COLOR_PALETTE = [
  '#0284c7', // Sky blue
  '#10b981', // Emerald
  '#6366f1', // Indigo
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#8b5cf6', // Purple
  '#14b8a6', // Teal
]

function formatShortMoney(value: number): string {
  if (!value || isNaN(value)) return "0 so'm"
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)} mlrd`
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)} mln`
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(0)} ming`
  }
  return `${value.toLocaleString()}`
}

function getShortName(fullName: string): string {
  if (!fullName) return ''
  const cleaned = fullName
    .replace(/\(Endodontiya\)/gi, '')
    .replace(/\(Zirconia\)/gi, '')
    .replace(/\(Therapy\)/gi, '')
    .replace(/Tish kanalini tozalash va plombirlash/gi, 'Kanal tozalash')
    .replace(/Tishni sirkoniy koronka/gi, 'Sirkoniy Koronka')
    .replace(/Tsirokniy/gi, 'Sirkoniy')
    .replace(/Kariesni davolash va ftorlash/gi, 'Ftorlash')
    .replace(/Kariesni davolash va plomba/gi, 'Plombirlash')
    .replace(/Tishni olib tashlash/gi, 'Ekstraksiya')
    .trim()

  if (cleaned.length > 15) {
    return cleaned.substring(0, 15) + '..'
  }
  return cleaned
}

export function StatsCharts({
  topProcedures = [],
  departmentBreakdown = [],
  expensesByCategory = [],
  timeline = [],
  topDoctors = [],
}: StatsChartsProps) {
  const [viewType, setViewType] = useState<'area' | 'pie'>('area')
  const [expenseViewType, setExpenseViewType] = useState<'pie' | 'bar'>('pie')
  const [timelineView, setTimelineView] = useState<'area' | 'bar'>('area')

  const timelineData = (timeline || []).map((t) => {
    const rev = parseFloat(String(t.revenue || '0'))
    const exp = parseFloat(String(t.expense || '0'))
    const net = parseFloat(String(t.netProfit || '0'))
    return {
      date: t.date,
      label: t.label || t.date,
      revenue: rev,
      expense: exp,
      netProfit: net,
    }
  })

  const doctorData = (topDoctors || []).map((doc) => {
    const name = `Dr. ${doc.firstName || ''} ${doc.lastName || ''}`.trim()
    return {
      name,
      specialization: doc.specialization || 'Stomatolog',
      treatments: Number(doc.treatments || 0),
      revenue: parseFloat(String(doc.revenue || '0')),
      averageTicket: parseFloat(String(doc.averageTicket || '0')),
    }
  })

  const procData = (topProcedures || []).map((p: any) => {
    const fullName = String(p.name || p.procedureTypeName || p.procedure_type_name || 'Muolaja')
    return {
      fullName,
      shortName: getShortName(fullName),
      count: Number(p.count ?? p.patientCount ?? 0),
      revenue: parseFloat(String(p.revenue || '0')),
    }
  })

  const totalDeptRevenue = (departmentBreakdown || []).reduce(
    (acc: number, d: any) => acc + parseFloat(String(d.revenue || '0')),
    0
  )

  const deptData = (departmentBreakdown || []).map((d: any, idx: number) => {
    const name = String(d.name || d.departmentName || d.department_name || "Bo'lim")
    const rev = parseFloat(String(d.revenue || '0'))
    const percent = totalDeptRevenue > 0 ? ((rev / totalDeptRevenue) * 100).toFixed(1) : '0'
    return {
      name,
      shortName: getShortName(name),
      treatments: Number(d.treatments ?? d.patientCount ?? 0),
      revenue: rev,
      percent: Number(percent),
      color: COLOR_PALETTE[idx % COLOR_PALETTE.length],
    }
  })

  const totalExpense = (expensesByCategory || []).reduce(
    (acc: number, d: any) => acc + parseFloat(String(d.amount || '0')),
    0
  )

  const expenseData = (expensesByCategory || []).map((d: any, idx: number) => {
    const name = String(d.name || "Boshqa")
    const amount = parseFloat(String(d.amount || '0'))
    const percent = totalExpense > 0 ? ((amount / totalExpense) * 100).toFixed(1) : '0'
    return {
      name,
      shortName: getShortName(name),
      count: Number(d.count || 0),
      amount,
      percent: Number(percent),
      color: COLOR_PALETTE[(idx + 2) % COLOR_PALETTE.length], // Shift colors for variety
    }
  })

  return (
    <div className='space-y-6'>
      {/* 0. Financial P&L Timeline Chart */}
      {timelineData.length > 0 && (
        <div className='flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-shadow'>
          <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b pb-3'>
            <div className='flex items-center gap-2.5'>
              <div className='flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'>
                <DollarSign className='h-5 w-5' />
              </div>
              <div>
                <h4 className='text-sm font-bold tracking-tight'>Moliya Dinamikasi: Tushum, Chiqim va Sof Foyda</h4>
                <p className='text-[11px] text-muted-foreground'>Davrlar kesimida daromad va xarajatlarning o'zgarish tendensiyasi</p>
              </div>
            </div>

            <div className='flex items-center gap-3'>
              {/* Legend Badges */}
              <div className='hidden md:flex items-center gap-2 text-xs'>
                <span className='flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400'>
                  <span className='h-2.5 w-2.5 rounded-full bg-emerald-500' /> Tushum
                </span>
                <span className='flex items-center gap-1 font-medium text-rose-600 dark:text-rose-400'>
                  <span className='h-2.5 w-2.5 rounded-full bg-rose-500' /> Chiqim
                </span>
                <span className='flex items-center gap-1 font-medium text-sky-600 dark:text-sky-400'>
                  <span className='h-2.5 w-2.5 rounded-full bg-sky-500' /> Sof Foyda
                </span>
              </div>

              <div className='flex items-center gap-1 bg-muted/40 p-0.5 rounded-lg border'>
                <Button
                  size='sm'
                  variant={timelineView === 'area' ? 'secondary' : 'ghost'}
                  className='h-6 px-2 text-[10px]'
                  onClick={() => setTimelineView('area')}
                >
                  <TrendingUp className='h-3 w-3 me-1' /> Grafik
                </Button>
                <Button
                  size='sm'
                  variant={timelineView === 'bar' ? 'secondary' : 'ghost'}
                  className='h-6 px-2 text-[10px]'
                  onClick={() => setTimelineView('bar')}
                >
                  <BarChart3 className='h-3 w-3 me-1' /> Ustunli
                </Button>
              </div>
            </div>
          </div>

          <div className='h-[300px] w-full pt-2'>
            <ResponsiveContainer width='100%' height='100%'>
              {timelineView === 'area' ? (
                <AreaChart data={timelineData} margin={{ top: 20, right: 20, left: 10, bottom: 15 }}>
                  <defs>
                    <linearGradient id='revAreaGrad' x1='0' y1='0' x2='0' y2='1'>
                      <stop offset='0%' stopColor='#10b981' stopOpacity={0.35} />
                      <stop offset='100%' stopColor='#10b981' stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id='expAreaGrad' x1='0' y1='0' x2='0' y2='1'>
                      <stop offset='0%' stopColor='#f43f5e' stopOpacity={0.35} />
                      <stop offset='100%' stopColor='#f43f5e' stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id='profitAreaGrad' x1='0' y1='0' x2='0' y2='1'>
                      <stop offset='0%' stopColor='#0284c7' stopOpacity={0.35} />
                      <stop offset='100%' stopColor='#0284c7' stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray='3 3' vertical={false} className='stroke-muted/20' />
                  <XAxis dataKey='label' className='text-[10px] font-medium' tickLine={false} dy={6} />
                  <YAxis className='text-[10px] font-mono' tickLine={false} axisLine={false} tickFormatter={formatShortMoney} />
                  <Tooltip content={<CustomTimelineTooltip />} />
                  <Area type='monotone' dataKey='revenue' stroke='#10b981' strokeWidth={2.5} fill='url(#revAreaGrad)' />
                  <Area type='monotone' dataKey='expense' stroke='#f43f5e' strokeWidth={2.5} fill='url(#expAreaGrad)' />
                  <Area type='monotone' dataKey='netProfit' stroke='#0284c7' strokeWidth={3} fill='url(#profitAreaGrad)' />
                </AreaChart>
              ) : (
                <BarChart data={timelineData} margin={{ top: 20, right: 20, left: 10, bottom: 15 }}>
                  <CartesianGrid strokeDasharray='3 3' vertical={false} className='stroke-muted/20' />
                  <XAxis dataKey='label' className='text-[10px] font-medium' tickLine={false} dy={6} />
                  <YAxis className='text-[10px] font-mono' tickLine={false} axisLine={false} tickFormatter={formatShortMoney} />
                  <Tooltip content={<CustomTimelineTooltip />} />
                  <Bar dataKey='revenue' name='Tushum' fill='#10b981' radius={[6, 6, 0, 0]} maxBarSize={32} />
                  <Bar dataKey='expense' name='Chiqim' fill='#f43f5e' radius={[6, 6, 0, 0]} maxBarSize={32} />
                  <Bar dataKey='netProfit' name='Sof Foyda' fill='#0284c7' radius={[6, 6, 0, 0]} maxBarSize={32} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Doctor Performance Comparison Chart */}
      {doctorData.length > 0 && (
        <div className='flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-shadow'>
          <div className='flex items-center justify-between border-b pb-3'>
            <div className='flex items-center gap-2.5'>
              <div className='flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400'>
                <Users className='h-5 w-5' />
              </div>
              <div>
                <h4 className='text-sm font-bold tracking-tight'>Shifokorlar Samaradorligi & Keltirgan Tushumi</h4>
                <p className='text-[11px] text-muted-foreground'>Shifokorlar kesimida qabul qilingan bemorlar, muolajalar va umumiy tushum taqqoslashi</p>
              </div>
            </div>
            <Badge variant='outline' className='text-xs font-mono py-1 px-3 border-purple-500/30 text-purple-600 dark:text-purple-400'>
              {doctorData.length} nafar shifokor
            </Badge>
          </div>

          <div className='h-[260px] w-full pt-2'>
            <ResponsiveContainer width='100%' height='100%'>
              <BarChart data={doctorData} layout='vertical' margin={{ top: 10, right: 30, left: 20, bottom: 10 }}>
                <CartesianGrid strokeDasharray='3 3' horizontal={false} className='stroke-muted/20' />
                <XAxis type='number' className='text-[10px] font-mono' tickLine={false} axisLine={false} tickFormatter={formatShortMoney} />
                <YAxis dataKey='name' type='category' className='text-xs font-medium' tickLine={false} axisLine={false} width={130} />
                <Tooltip content={<CustomDoctorTooltip />} />
                <Bar dataKey='revenue' name='Tushum' fill='#8b5cf6' radius={[0, 8, 8, 0]} barSize={22}>
                  {doctorData.map((_, idx) => (
                    <Cell key={`doc-${idx}`} fill={COLOR_PALETTE[(idx + 4) % COLOR_PALETTE.length]} />
                  ))}
                  <LabelList dataKey='revenue' position='right' className='fill-foreground text-[10px] font-bold font-mono' formatter={(val: any) => formatShortMoney(Number(val))} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 3-Column Breakdown Grid */}
      <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
      {/* 1. Top Procedures Chart */}
      <div className='flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-shadow'>
        <div className='flex items-center justify-between border-b pb-3'>
          <div className='flex items-center gap-2'>
            <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary'>
              <Award className='h-4 w-4' />
            </div>
            <div>
              <h4 className='text-sm font-bold tracking-tight'>Eng Mashhur Muolajalar</h4>
              <p className='text-[11px] text-muted-foreground'>Top bajarilgan davolash ishlari miqdori</p>
            </div>
          </div>
          <Badge variant='outline' className='text-[10px] font-mono'>
            Top {procData.length}
          </Badge>
        </div>

        <div className='h-[290px] w-full pt-2'>
          {procData.length === 0 ? (
            <div className='flex h-full items-center justify-center text-xs text-muted-foreground'>
              Ma'lumotlar mavjud emas
            </div>
          ) : (
            <ResponsiveContainer width='100%' height='100%'>
              <BarChart data={procData} margin={{ top: 25, right: 15, left: -20, bottom: 15 }}>
                <defs>
                  <linearGradient id='barGradient' x1='0' y1='0' x2='0' y2='1'>
                    <stop offset='0%' stopColor='#38bdf8' stopOpacity={1} />
                    <stop offset='100%' stopColor='#0284c7' stopOpacity={0.8} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray='3 3' vertical={false} className='stroke-muted/20' />
                <XAxis
                  dataKey='shortName'
                  className='text-[10px] font-medium'
                  tickLine={false}
                  interval={0}
                  dy={6}
                />
                <YAxis
                  className='text-[10px] font-mono'
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                {/* DARK HOVER CURSOR HIGHLIGHT FIX - NO MORE WHITE BOX */}
                <Tooltip
                  cursor={{ fill: 'rgba(255, 255, 255, 0.05)', radius: 6 }}
                  content={<CustomProcedureTooltip />}
                />
                <Bar
                  dataKey='count'
                  name='Bemorlar soni'
                  fill='url(#barGradient)'
                  radius={[8, 8, 0, 0]}
                  barSize={38}
                >
                  <LabelList
                    dataKey='count'
                    position='top'
                    dy={-6}
                    className='fill-foreground text-[11px] font-bold font-mono'
                    formatter={(val: any) => (Number(val) > 0 ? `${val} ta` : '')}
                  />
                  {procData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLOR_PALETTE[index % COLOR_PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* 2. Department Breakdown Chart */}
      <div className='flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-shadow'>
        <div className='flex items-center justify-between border-b pb-3'>
          <div className='flex items-center gap-2'>
            <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'>
              <TrendingUp className='h-4 w-4' />
            </div>
            <div>
              <h4 className='text-sm font-bold tracking-tight'>Bo'limlar Daromadi (so'm)</h4>
              <p className='text-[11px] text-muted-foreground'>Klinika bo'limlari ulushi va tushumi</p>
            </div>
          </div>

          <div className='flex items-center gap-1 bg-muted/40 p-0.5 rounded-lg border'>
            <Button
              size='sm'
              variant={viewType === 'area' ? 'secondary' : 'ghost'}
              className='h-6 px-2 text-[10px]'
              onClick={() => setViewType('area')}
            >
              <BarChart3 className='h-3 w-3 me-1' /> Grafik
            </Button>
            <Button
              size='sm'
              variant={viewType === 'pie' ? 'secondary' : 'ghost'}
              className='h-6 px-2 text-[10px]'
              onClick={() => setViewType('pie')}
            >
              <PieIcon className='h-3 w-3 me-1' /> Ulush (%)
            </Button>
          </div>
        </div>

        <div className='h-[290px] w-full pt-2'>
          {deptData.length === 0 ? (
            <div className='flex h-full items-center justify-center text-xs text-muted-foreground'>
              Ma'lumotlar mavjud emas
            </div>
          ) : viewType === 'area' ? (
            <ResponsiveContainer width='100%' height='100%'>
              <AreaChart data={deptData} margin={{ top: 20, right: 15, left: 10, bottom: 15 }}>
                <defs>
                  <linearGradient id='areaGradient' x1='0' y1='0' x2='0' y2='1'>
                    <stop offset='0%' stopColor='#10b981' stopOpacity={0.4} />
                    <stop offset='100%' stopColor='#10b981' stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray='3 3' vertical={false} className='stroke-muted/20' />
                <XAxis
                  dataKey='shortName'
                  className='text-[10px] font-medium'
                  tickLine={false}
                  interval={0}
                  dy={6}
                />
                <YAxis
                  className='text-[10px] font-mono'
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatShortMoney}
                />
                <Tooltip
                  cursor={{ stroke: '#10b981', strokeWidth: 1.5, strokeDasharray: '4 4' }}
                  content={<CustomDepartmentTooltip />}
                />
                <Area
                  type='monotone'
                  dataKey='revenue'
                  stroke='#10b981'
                  strokeWidth={3}
                  fill='url(#areaGradient)'
                  activeDot={{ r: 6, strokeWidth: 0, fill: '#059669' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className='flex flex-col sm:flex-row items-center justify-between h-full gap-4'>
              <div className='h-[230px] w-full sm:w-1/2'>
                <ResponsiveContainer width='100%' height='100%'>
                  <PieChart>
                    <Pie
                      data={deptData}
                      cx='50%'
                      cy='50%'
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={4}
                      dataKey='revenue'
                    >
                      {deptData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomDepartmentTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className='w-full sm:w-1/2 flex flex-col gap-2 max-h-[230px] overflow-y-auto pe-2'>
                {deptData.map((d, i) => (
                  <div
                    key={i}
                    className='flex items-center justify-between text-xs p-2 rounded-lg border bg-muted/20'
                  >
                    <div className='flex items-center gap-2 truncate me-2'>
                      <div
                        className='h-2.5 w-2.5 rounded-full shrink-0'
                        style={{ backgroundColor: d.color }}
                      />
                      <span className='font-medium truncate'>{d.name}</span>
                    </div>
                    <div className='text-end font-mono shrink-0'>
                      <span className='font-bold text-foreground'>{d.percent}%</span>
                      <p className='text-[10px] text-muted-foreground'>
                        {formatShortMoney(d.revenue)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Expenses Breakdown Chart */}
      <div className='flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-shadow'>
        <div className='flex items-center justify-between border-b pb-3'>
          <div className='flex items-center gap-2'>
            <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400'>
              <PieIcon className='h-4 w-4' />
            </div>
            <div>
              <h4 className='text-sm font-bold tracking-tight'>Xarajatlar Tuzilmasi</h4>
              <p className='text-[11px] text-muted-foreground'>Kategoriyalar bo'yicha xarajatlar foizi</p>
            </div>
          </div>

          <div className='flex items-center gap-1 bg-muted/40 p-0.5 rounded-lg border'>
            <Button
              size='sm'
              variant={expenseViewType === 'pie' ? 'secondary' : 'ghost'}
              className='h-6 px-2 text-[10px]'
              onClick={() => setExpenseViewType('pie')}
            >
              <PieIcon className='h-3 w-3 me-1' /> Ulush (%)
            </Button>
            <Button
              size='sm'
              variant={expenseViewType === 'bar' ? 'secondary' : 'ghost'}
              className='h-6 px-2 text-[10px]'
              onClick={() => setExpenseViewType('bar')}
            >
              <BarChart3 className='h-3 w-3 me-1' /> Grafik
            </Button>
          </div>
        </div>

        <div className='h-[290px] w-full pt-2'>
          {expenseData.length === 0 ? (
            <div className='flex h-full items-center justify-center text-xs text-muted-foreground'>
              Ma'lumotlar mavjud emas
            </div>
          ) : expenseViewType === 'pie' ? (
            <div className='flex flex-col sm:flex-row items-center justify-between h-full gap-4'>
              <div className='h-[230px] w-full sm:w-1/2'>
                <ResponsiveContainer width='100%' height='100%'>
                  <PieChart>
                    <Pie
                      data={expenseData}
                      cx='50%'
                      cy='50%'
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={4}
                      dataKey='amount'
                    >
                      {expenseData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomExpenseTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className='w-full sm:w-1/2 flex flex-col gap-2 max-h-[230px] overflow-y-auto pe-2'>
                {expenseData.map((d, i) => (
                  <div
                    key={i}
                    className='flex items-center justify-between text-xs p-2 rounded-lg border bg-muted/20'
                  >
                    <div className='flex items-center gap-2 truncate me-2'>
                      <div
                        className='h-2.5 w-2.5 rounded-full shrink-0'
                        style={{ backgroundColor: d.color }}
                      />
                      <span className='font-medium truncate'>{d.name}</span>
                    </div>
                    <div className='text-end font-mono shrink-0'>
                      <span className='font-bold text-foreground'>{d.percent}%</span>
                      <p className='text-[10px] text-rose-500'>
                        {formatShortMoney(d.amount)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <ResponsiveContainer width='100%' height='100%'>
              <BarChart data={expenseData} margin={{ top: 25, right: 15, left: -20, bottom: 15 }}>
                <defs>
                  <linearGradient id='expenseGradient' x1='0' y1='0' x2='0' y2='1'>
                    <stop offset='0%' stopColor='#f43f5e' stopOpacity={1} />
                    <stop offset='100%' stopColor='#e11d48' stopOpacity={0.8} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray='3 3' vertical={false} className='stroke-muted/20' />
                <XAxis
                  dataKey='shortName'
                  className='text-[10px] font-medium'
                  tickLine={false}
                  interval={0}
                  dy={6}
                />
                <YAxis
                  className='text-[10px] font-mono'
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatShortMoney}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(255, 255, 255, 0.05)', radius: 6 }}
                  content={<CustomExpenseTooltip />}
                />
                <Bar
                  dataKey='amount'
                  name='Xarajat'
                  fill='url(#expenseGradient)'
                  radius={[8, 8, 0, 0]}
                  barSize={38}
                >
                  <LabelList
                    dataKey='amount'
                    position='top'
                    dy={-6}
                    className='fill-foreground text-[11px] font-bold font-mono'
                    formatter={(val: any) => (Number(val) > 0 ? formatShortMoney(Number(val)) : '')}
                  />
                  {expenseData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLOR_PALETTE[(index + 2) % COLOR_PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  </div>
  )
}

// Custom High-Quality Glassmorphic Tooltip for Procedures
function CustomProcedureTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    return (
      <div className='rounded-xl border bg-slate-900/95 backdrop-blur-md p-3 shadow-2xl text-xs space-y-1.5 min-w-[210px] border-slate-700 text-slate-100 z-50'>
        <div className='flex items-center gap-2 font-bold text-white border-b border-slate-800 pb-1.5'>
          <Activity className='h-3.5 w-3.5 text-sky-400' />
          <span>{data.fullName}</span>
        </div>
        <div className='flex justify-between items-center text-slate-300'>
          <span>Bajarilgan muolajalar:</span>
          <span className='font-bold font-mono text-white'>{data.count} ta</span>
        </div>
        {data.revenue > 0 && (
          <div className='flex justify-between items-center text-slate-300 border-t border-slate-800 pt-1'>
            <span>Jami tushum:</span>
            <span className='font-bold font-mono text-emerald-400'>
              {Number(data.revenue).toLocaleString()} so'm
            </span>
          </div>
        )}
      </div>
    )
  }
  return null
}

// Custom High-Quality Glassmorphic Tooltip for Departments
function CustomDepartmentTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    return (
      <div className='rounded-xl border bg-slate-900/95 backdrop-blur-md p-3 shadow-2xl text-xs space-y-1.5 min-w-[210px] border-slate-700 text-slate-100 z-50'>
        <div className='flex items-center gap-2 font-bold text-white border-b border-slate-800 pb-1.5'>
          <TrendingUp className='h-3.5 w-3.5 text-emerald-400' />
          <span>{data.name}</span>
        </div>
        <div className='flex justify-between items-center text-slate-300'>
          <span>Jami tushgan daromad:</span>
          <span className='font-bold font-mono text-emerald-400'>
            {Number(data.revenue).toLocaleString()} so'm
          </span>
        </div>
        {data.treatments > 0 && (
          <div className='flex justify-between items-center text-slate-300 border-t border-slate-800 pt-1'>
            <span>Bajarilgan muolajalar:</span>
            <span className='font-bold font-mono text-white'>{data.treatments} ta</span>
          </div>
        )}
      </div>
    )
  }
  return null
}

// Custom High-Quality Glassmorphic Tooltip for Expenses
function CustomExpenseTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    return (
      <div className='rounded-xl border bg-slate-900/95 backdrop-blur-md p-3 shadow-2xl text-xs space-y-1.5 min-w-[210px] border-slate-700 text-slate-100 z-50'>
        <div className='flex items-center gap-2 font-bold text-white border-b border-slate-800 pb-1.5'>
          <PieIcon className='h-3.5 w-3.5 text-rose-400' />
          <span>{data.name}</span>
        </div>
        <div className='flex justify-between items-center text-slate-300'>
          <span>Xarajat miqdori:</span>
          <span className='font-bold font-mono text-rose-400'>
            {Number(data.amount).toLocaleString()} so'm
          </span>
        </div>
        {data.count > 0 && (
          <div className='flex justify-between items-center text-slate-300 border-t border-slate-800 pt-1'>
            <span>Tranzaksiyalar soni:</span>
            <span className='font-bold font-mono text-white'>{data.count} ta</span>
          </div>
        )}
      </div>
    )
  }
  return null
}

function CustomTimelineTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    const margin = data.revenue > 0 ? ((data.netProfit / data.revenue) * 100).toFixed(1) : '0'
    return (
      <div className='rounded-xl border bg-slate-900/95 backdrop-blur-md p-3.5 shadow-2xl text-xs space-y-2 min-w-[240px] border-slate-700 text-slate-100 z-50'>
        <div className='flex items-center justify-between font-bold text-white border-b border-slate-800 pb-1.5'>
          <span className='text-sm'>{data.label}</span>
          <span className='text-[10px] font-mono text-muted-foreground'>{data.date}</span>
        </div>
        <div className='space-y-1'>
          <div className='flex justify-between items-center text-slate-300'>
            <span className='flex items-center gap-1.5 text-emerald-400'>
              <span className='h-2 w-2 rounded-full bg-emerald-400' /> Tushum:
            </span>
            <span className='font-bold font-mono text-emerald-400'>
              {Number(data.revenue).toLocaleString()} so'm
            </span>
          </div>
          <div className='flex justify-between items-center text-slate-300'>
            <span className='flex items-center gap-1.5 text-rose-400'>
              <span className='h-2 w-2 rounded-full bg-rose-400' /> Chiqim:
            </span>
            <span className='font-bold font-mono text-rose-400'>
              {Number(data.expense).toLocaleString()} so'm
            </span>
          </div>
          <div className='flex justify-between items-center text-slate-200 border-t border-slate-800 pt-1'>
            <span className='flex items-center gap-1.5 text-sky-400 font-semibold'>
              <span className='h-2 w-2 rounded-full bg-sky-400' /> Sof Foyda:
            </span>
            <span className='font-bold font-mono text-sky-400 text-sm'>
              {Number(data.netProfit).toLocaleString()} so'm
            </span>
          </div>
          <div className='flex justify-between items-center text-slate-400 text-[11px] pt-0.5'>
            <span>Foyda marjasi:</span>
            <span className='font-mono font-bold text-slate-200'>{margin}%</span>
          </div>
        </div>
      </div>
    )
  }
  return null
}

function CustomDoctorTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    return (
      <div className='rounded-xl border bg-slate-900/95 backdrop-blur-md p-3.5 shadow-2xl text-xs space-y-2 min-w-[230px] border-slate-700 text-slate-100 z-50'>
        <div className='border-b border-slate-800 pb-1.5'>
          <p className='font-bold text-white text-sm'>{data.name}</p>
          <p className='text-[10px] text-muted-foreground'>{data.specialization}</p>
        </div>
        <div className='space-y-1 text-slate-300'>
          <div className='flex justify-between items-center'>
            <span>Keltirgan tushum:</span>
            <span className='font-bold font-mono text-emerald-400'>
              {Number(data.revenue).toLocaleString()} so'm
            </span>
          </div>
          <div className='flex justify-between items-center'>
            <span>Muolajalar soni:</span>
            <span className='font-bold font-mono text-white'>{data.treatments} ta</span>
          </div>
          {data.averageTicket > 0 && (
            <div className='flex justify-between items-center border-t border-slate-800 pt-1'>
              <span>O'rtacha chek:</span>
              <span className='font-bold font-mono text-sky-400'>
                {Number(data.averageTicket).toLocaleString()} so'm
              </span>
            </div>
          )}
        </div>
      </div>
    )
  }
  return null
}

