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
} from 'recharts'

interface TopProcedure {
  name?: string
  procedureTypeName?: string
  count?: number
  revenue?: string
}

interface DepartmentBreakdown {
  name?: string
  departmentName?: string
  revenue?: string
  treatments?: number
  patientCount?: number
}

interface StatsChartsProps {
  topProcedures?: TopProcedure[]
  departmentBreakdown?: DepartmentBreakdown[]
}

export function StatsCharts({
  topProcedures = [],
  departmentBreakdown = [],
}: StatsChartsProps) {
  const procData = topProcedures.map((p: any) => ({
    name: p.name || p.procedureTypeName || p.procedure_type_name || 'Muolaja',
    Bemorlar: p.count ?? p.patientCount ?? 0,
    Daromad: parseFloat(p.revenue || '0'),
  }))

  const deptData = departmentBreakdown.map((d: any) => ({
    name: d.name || d.departmentName || d.department_name || 'Bo\'lim',
    Muolajalar: d.treatments ?? d.patientCount ?? 0,
    Daromad: parseFloat(d.revenue || '0'),
  }))

  return (
    <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
      {/* Top Procedures Chart */}
      <div className='flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-sm'>
        <h4 className='text-sm font-semibold tracking-tight'>Eng Ko'p Bajarilgan Muolajalar</h4>
        <div className='h-[260px] w-full'>
          {procData.length === 0 ? (
            <div className='flex h-full items-center justify-center text-xs text-muted-foreground'>
              Ma'lumotlar mavjud emas
            </div>
          ) : (
            <ResponsiveContainer width='100%' height='100%'>
              <BarChart data={procData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray='3 3' className='stroke-muted/30' />
                <XAxis dataKey='name' className='text-[10px]' tickLine={false} />
                <YAxis className='text-[10px]' tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--popover)',
                    borderColor: 'var(--border)',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey='Bemorlar' fill='#3b82f6' radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Department Breakdown Chart */}
      <div className='flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-sm'>
        <h4 className='text-sm font-semibold tracking-tight'>Bo'limlar Bo'yicha Daromad (so'm)</h4>
        <div className='h-[260px] w-full'>
          {deptData.length === 0 ? (
            <div className='flex h-full items-center justify-center text-xs text-muted-foreground'>
              Ma'lumotlar mavjud emas
            </div>
          ) : (
            <ResponsiveContainer width='100%' height='100%'>
              <AreaChart data={deptData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray='3 3' className='stroke-muted/30' />
                <XAxis dataKey='name' className='text-[10px]' tickLine={false} />
                <YAxis className='text-[10px]' tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--popover)',
                    borderColor: 'var(--border)',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Area type='monotone' dataKey='Daromad' stroke='#10b981' fill='#10b981' fillOpacity={0.2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}
