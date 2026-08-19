import { useState, useMemo } from 'react'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Banknote, TrendingUp, DollarSign, Wallet, User, Eye } from 'lucide-react'
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
    return doctors.find((d: any) => 
      (d.user && d.user.id === authUser?.id) || 
      (d.user && (d.user.phone_number === (authUser as any)?.phone_number || d.user.phone_number === authUser?.phoneNumber)) ||
      d.id === (authUser as any)?.doctorId
    ) || null
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

  const effectiveDoctorId = isDoctor ? (myDoctorProfile?.id || selectedDoctorId) : selectedDoctorId
  const { data: commissionsData = [] } = useDoctorCommissions(effectiveDoctorId)
  const commissions: any[] = Array.isArray(commissionsData) ? commissionsData : []
  const { data: summary } = useDoctorCommissionSummary(effectiveDoctorId)

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

  // Total summary calculations
  const totalClinicEarned = balances.reduce((acc, b) => acc + (b.totalEarned || 0), 0)
  const totalClinicPaid = balances.reduce((acc, b) => acc + (b.totalPaid || 0), 0)
  const totalClinicBalance = balances.reduce((acc, b) => acc + (b.balance || 0), 0)

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
                <CardTitle className="text-xs font-semibold text-muted-foreground">Jami Hisoblangan Komissiya</CardTitle>
                <TrendingUp className="w-4 h-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono text-primary">
                  {formatMoney(myDoctorBalance?.totalEarned || Number((summary as any)?.totalCommission || (summary as any)?.totalEarned || 0))} so'm
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Barcha muolajalardan hisoblangan</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">Olingan Maosh (To'langan)</CardTitle>
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
                <CardTitle className="text-xs font-semibold text-muted-foreground">Joriy Olinmagan Qoldiq</CardTitle>
                <Wallet className="w-4 h-4 text-amber-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
                  {formatMoney(myDoctorBalance?.balance || 0)} so'm
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Kassadan olinishi kerak bo'lgan summa</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">Mening Foiz Stavkasi</CardTitle>
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
                <CardTitle className="text-xs font-semibold text-muted-foreground">Jami Shifokorlar Ishlagan</CardTitle>
                <TrendingUp className="w-4 h-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono text-primary">{formatMoney(totalClinicEarned)} so'm</div>
                <p className="text-[11px] text-muted-foreground mt-1">Shifokorlar hisoblangan umumiy komissiyasi</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">Jami To'langan Maosh</CardTitle>
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
                <CardTitle className="text-xs font-semibold text-muted-foreground">Klinika Qarzdorligi (Qoldiq)</CardTitle>
                <Wallet className="w-4 h-4 text-amber-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
                  {formatMoney(totalClinicBalance)} so'm
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Shifokorlarga to'lanishi kutilayotgan summa</p>
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
                  Har bir bemordan sizga hisoblangan komissiya foizlari va summalari yoyilmasi.
                </CardDescription>
              </div>

              {/* Date Filter Buttons */}
              <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
                {[
                  { label: 'Barchasi', value: 'all' },
                  { label: 'Bugun', value: 'today' },
                  { label: 'Shu Hafta', value: 'week' },
                  { label: 'Shu Oy', value: 'month' }
                ].map((item) => (
                  <Button
                    key={item.value}
                    size="sm"
                    variant={dateFilter === item.value ? 'default' : 'ghost'}
                    className="h-7 text-xs px-2.5"
                    onClick={() => setDateFilter(item.value as any)}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </CardHeader>

            <CardContent>
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
                    {filteredCommissions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-xs text-muted-foreground">
                          Tanlangan davr bo'yicha hisoblangan komissiyalar mavjud emas.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredCommissions.map((c: any) => {
                        const dateStr = c?.calculatedAt || c?.calculated_at || c?.createdAt || c?.created_at || ''
                        const patientName = c?.patientName || (c?.patient ? `${c.patient.firstName || ''} ${c.patient.lastName || ''}`.trim() : '') || 'Bemor'
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
            </CardContent>
          </Card>
        ) : (
          /* Head Doctor & Admin View: All Doctors Table + Statement Viewer */
          <Tabs defaultValue="doctors" className="space-y-4">
            <TabsList>
              <TabsTrigger value="doctors">Shifokorlar Balansi</TabsTrigger>
              {selectedDoctorId && <TabsTrigger value="statement">Shifokor Tafsiloti (Tarix)</TabsTrigger>}
            </TabsList>

            <TabsContent value="doctors">
              <Card className="shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <div>
                    <CardTitle className="text-base font-bold">Shifokorlar Ish Haqi Balansi</CardTitle>
                    <CardDescription className="text-xs">
                      Har bir shifokorning jami ishlagan summasi, to'langan oyligi va joriy qarzdorlik qoldig'i.
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="text-center p-8 text-xs text-muted-foreground">Ma'lumotlar yuklanmoqda...</div>
                  ) : (
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
                          {balances.map((doc: DoctorBalance) => (
                            <TableRow key={doc.id}>
                              <TableCell className="font-semibold text-xs">
                                {doc.firstName} {doc.lastName}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground font-mono">{doc.phone}</TableCell>
                              <TableCell className="text-xs text-center font-mono">
                                <Badge variant="outline" className="text-[10px]">{doc.defaultRate || '30'}%</Badge>
                              </TableCell>
                              <TableCell className="text-right text-xs font-mono">{formatMoney(doc.totalEarned)}</TableCell>
                              <TableCell className="text-right text-xs font-mono text-muted-foreground">{formatMoney(doc.totalPaid)}</TableCell>
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
                                      className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700"
                                      onClick={() => setSelectedDoctorForPayout(doc)}
                                    >
                                      <Banknote className="w-3.5 h-3.5 mr-1" /> To'lash
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                          {balances.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center py-8 text-xs text-muted-foreground">
                                Shifokorlar ma'lumotlari topilmadi.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {selectedDoctorId && (
              <TabsContent value="statement">
                <Card className="shadow-sm">
                  <CardHeader className="flex flex-row items-center justify-between pb-3">
                    <div>
                      <CardTitle className="text-base font-bold">
                        Shifokor Komissiyalari Tarixi ({commissions.length} ta yozuv)
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Tanlangan shifokorning barcha muolajalari bo'yicha hisoblangan komissiyalar.
                      </CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setSelectedDoctorId('')}>
                      Orqaga
                    </Button>
                  </CardHeader>
                  <CardContent>
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
                          {commissions.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center py-8 text-xs text-muted-foreground">
                                Komissiyalar topilmadi.
                              </TableCell>
                            </TableRow>
                          ) : (
                            commissions.map((c: any) => {
                              const dateStr = c?.calculatedAt || c?.calculated_at || c?.createdAt || ''
                              const patientName = c?.patientName || (c?.patient ? `${c.patient.firstName || ''} ${c.patient.lastName || ''}`.trim() : '') || 'Bemor'
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
                                    <Badge variant="outline" className="text-[10px]">{c?.rate || 30}%</Badge>
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
    </div>
  )
}
