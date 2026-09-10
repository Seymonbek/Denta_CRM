import { useState, useEffect, useRef } from 'react'
import { format } from 'date-fns'
import {
  Search,
  Printer,
  Download,
  Wallet,
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  FileText,
} from 'lucide-react'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import {
  useCashShifts,
  useCloseCashShift,
  useCashShiftStats,
  useCashShiftDetails,
  type CashShift,
} from '@/api/hooks/use-cash-shifts'
import { useAuthStore } from '@/stores/auth-store'
import { useReactToPrint } from 'react-to-print'
import { toast } from 'sonner'
import { ZReportPrint } from '@/components/print/z-report-print'

function ShiftDetailsModal({
  shiftId,
  open,
  onOpenChange,
  onPrintZReport,
}: {
  shiftId: string | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onPrintZReport: (shift: CashShift) => void
}) {
  const { data: shiftDetails, isLoading } = useCashShiftDetails(shiftId)

  if (!shiftId) return null

  const shift = shiftDetails?.shift
  const payments = shiftDetails?.payments || []
  const expenses = shiftDetails?.expenses || []

  const totalPaymentsAmount = payments.reduce((acc, p) => acc + Number(p.amount || 0), 0)
  const totalExpensesAmount = expenses.reduce((acc, e) => acc + Number(e.amount || 0), 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6 flex-wrap gap-2">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              Smena Tafsilotlari (#{shiftId.slice(0, 8).toUpperCase()})
            </DialogTitle>
            {shift && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => onPrintZReport(shift)}
              >
                <Printer className="w-3.5 h-3.5" />
                Z-Hisobot Chop Etish
              </Button>
            )}
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Yuklanmoqda...</div>
        ) : (
          <div className="space-y-4 mt-2">
            {/* Shift Overview Bar */}
            {shift && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-muted/40 p-3 rounded-lg border text-xs">
                <div>
                  <span className="text-muted-foreground">Mas'ul:</span>
                  <div className="font-semibold">{shift.admin_name}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Boshlang'ich kassa:</span>
                  <div className="font-mono font-semibold">{Number(shift.start_balance).toLocaleString()} UZS</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Ochilgan vaqti:</span>
                  <div className="font-mono">{format(new Date(shift.opened_at), 'dd.MM.yy HH:mm')}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Holati:</span>
                  <div>
                    {shift.status === 'open' ? (
                      <Badge variant="default" className="bg-emerald-600 h-5 text-[10px]">Ochiq</Badge>
                    ) : (
                      <Badge variant="secondary" className="h-5 text-[10px]">Yopiq</Badge>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Tabs for Payments and Expenses */}
            <Tabs defaultValue="payments" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="payments" className="text-xs">
                  Tushumlar ({payments.length}) — {totalPaymentsAmount.toLocaleString()} UZS
                </TabsTrigger>
                <TabsTrigger value="expenses" className="text-xs">
                  Chiqimlar ({expenses.length}) — {totalExpensesAmount.toLocaleString()} UZS
                </TabsTrigger>
              </TabsList>

              <TabsContent value="payments" className="mt-3">
                <div className="rounded-md border bg-card text-card-foreground overflow-x-auto w-full">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/20">
                        <TableHead className="text-xs">Vaqti</TableHead>
                        <TableHead className="text-xs">Bemor</TableHead>
                        <TableHead className="text-xs">Shifokor</TableHead>
                        <TableHead className="text-xs">To'lov Turi</TableHead>
                        <TableHead className="text-right text-xs">Summa</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-6 text-xs text-muted-foreground">
                            Ushbu smenada hali to'lovlar qayd etilmagan
                          </TableCell>
                        </TableRow>
                      ) : (
                        payments.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="text-xs font-mono">
                              {format(new Date(p.created_at), 'dd.MM.yy HH:mm')}
                            </TableCell>
                            <TableCell className="text-xs font-medium">{p.patient_name || '-'}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{p.doctor_name || '-'}</TableCell>
                            <TableCell className="text-xs">
                              <Badge variant="outline" className="text-[10px] uppercase">
                                {p.method === 'cash' ? 'Naqd' : p.method}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-xs font-mono font-semibold text-emerald-600">
                              +{Number(p.amount).toLocaleString()} UZS
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="expenses" className="mt-3">
                <div className="rounded-md border bg-card text-card-foreground overflow-x-auto w-full">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/20">
                        <TableHead className="text-xs">Vaqti</TableHead>
                        <TableHead className="text-xs">Toifa</TableHead>
                        <TableHead className="text-xs">Izoh</TableHead>
                        <TableHead className="text-xs">Usul</TableHead>
                        <TableHead className="text-right text-xs">Summa</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expenses.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-6 text-xs text-muted-foreground">
                            Ushbu smenada kassa chiqimlari yo'q
                          </TableCell>
                        </TableRow>
                      ) : (
                        expenses.map((e) => (
                          <TableRow key={e.id}>
                            <TableCell className="text-xs font-mono">
                              {format(new Date(e.date), 'dd.MM.yy HH:mm')}
                            </TableCell>
                            <TableCell className="text-xs font-medium">{e.category_name}</TableCell>
                            <TableCell className="text-xs max-w-xs truncate">{e.description || '-'}</TableCell>
                            <TableCell className="text-xs">
                              <Badge variant="outline" className="text-[10px]">
                                {e.payment_method === 'cash' ? 'Naqd' : 'Karta'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-xs font-mono font-semibold text-red-600">
                              -{Number(e.amount).toLocaleString()} UZS
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function CashShiftsFeature() {
  const [searchTerm, setSearchTerm] = useState('')
  const [status, setStatus] = useState<string>('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  useEffect(() => {
    setPage(1)
  }, [searchTerm, status])

  const { data: stats } = useCashShiftStats()
  const { data, isLoading } = useCashShifts({
    search: searchTerm || undefined,
    status: status || undefined,
    page,
    page_size: pageSize,
  })

  const shifts = data?.results || []
  const totalCount = data?.count ?? shifts.length

  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null)
  const currentUserId = useAuthStore((s) => s.user?.id)
  const isBoshShifokor = useAuthStore((s) => s.isBoshShifokor())
  const { mutate: closeShift, isPending: isClosing } = useCloseCashShift()
  const [shiftToClose, setShiftToClose] = useState<CashShift | null>(null)

  // Z-Report Print
  const [shiftForPrint, setShiftForPrint] = useState<CashShift | null>(null)
  const printRef = useRef<HTMLDivElement>(null)
  const { data: printDetails } = useCashShiftDetails(shiftForPrint?.id || null)

  const handlePrintZ = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Z_Hisobot_${shiftForPrint?.id ? shiftForPrint.id.slice(0, 8).toUpperCase() : 'Smena'}`,
  })

  const triggerZReportPrint = (shift: CashShift) => {
    setShiftForPrint(shift)
    setTimeout(() => {
      handlePrintZ()
    }, 250)
  }

  const handleExportCSV = () => {
    if (shifts.length === 0) {
      toast.info('Eksport qilish uchun smenalar topilmadi')
      return
    }

    const headers = [
      'Smena ID',
      'Administrator',
      'Ochilgan Vaqt',
      'Yopilgan Vaqt',
      'Boshlang\'ich Kassa',
      'Naqd Tushum',
      'Karta Tushum',
      'Naqd Chiqim',
      'Karta Chiqim',
      'Kassada Qoldi (Naqd)',
      'Holati',
    ]

    const rows = shifts.map((s) => [
      `"#${s.id.slice(0, 8).toUpperCase()}"`,
      `"${s.admin_name || ''}"`,
      `"${format(new Date(s.opened_at), 'dd.MM.yyyy HH:mm')}"`,
      `"${s.closed_at ? format(new Date(s.closed_at), 'dd.MM.yyyy HH:mm') : 'Ochiq'}"`,
      `"${Number(s.start_balance).toLocaleString('uz-UZ')}"`,
      `"${Number(s.cash_collected).toLocaleString('uz-UZ')}"`,
      `"${Number(s.card_collected).toLocaleString('uz-UZ')}"`,
      `"${Number(s.cash_expenses).toLocaleString('uz-UZ')}"`,
      `"${Number(s.card_expenses).toLocaleString('uz-UZ')}"`,
      `"${(Number(s.start_balance) + Number(s.cash_collected) - Number(s.cash_expenses)).toLocaleString('uz-UZ')}"`,
      `"${s.status === 'open' ? 'Ochiq' : 'Yopiq'}"`,
    ])

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `Klinika_Kassa_Smenalari_${format(new Date(), 'yyyy-MM-dd')}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success('Kassa smenalari hisoboti CSV faylga yuklab olindi!')
  }

  return (
    <>
      <Header>
        <div className="flex items-center justify-between w-full">
          <h2 className="text-2xl font-bold tracking-tight">Kassa Smenalari</h2>
          <ProfileDropdown />
        </div>
      </Header>
      <Main>
        <div className="space-y-6">
          {/* Top Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight">Kassa Smenalari va Z-Hisobotlar</h1>
              <p className="text-xs text-muted-foreground">
                Kunlik ochilgan va yopilgan kassa smenalari, naqd pul harakati va smena yopish hisoboti.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleExportCSV}>
                <Download className="w-4 h-4 mr-2 text-emerald-600" />
                CSV Eksport
              </Button>
            </div>
          </div>

          {/* 4 KPI Summary Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="border-l-4 border-l-emerald-500 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Faol Ochiq Smenalar
                </CardTitle>
                <Clock className="h-4 w-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-600 font-mono">
                  {stats?.openShiftsCount || 0} ta
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Klinika bo'yicha jami {stats?.totalShiftsCount || 0} ta smena yuritilgan
                </p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-blue-500 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Kassadagi Naqd Qoldiq
                </CardTitle>
                <Wallet className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold text-blue-600 font-mono">
                  {Number(stats?.currentCashInHand || 0).toLocaleString()} UZS
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Ochiq smenalardagi kutilayotgan naqd pul
                </p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-teal-500 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Bugungi Tushumlar
                </CardTitle>
                <ArrowUpRight className="h-4 w-4 text-teal-500" />
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">Naqd:</span>
                    <span className="font-semibold font-mono text-emerald-600">
                      +{Number(stats?.todayCashCollected || 0).toLocaleString()} UZS
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">Karta:</span>
                    <span className="font-semibold font-mono text-blue-600">
                      +{Number(stats?.todayCardCollected || 0).toLocaleString()} UZS
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-amber-500 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Bugungi Chiqimlar
                </CardTitle>
                <ArrowDownRight className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold text-amber-600 font-mono">
                  -{Number(stats?.todayCashExpenses || 0).toLocaleString()} UZS
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Bugungi kassa chiqim xarajatlari
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Search & Filter Bar */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg">Kassa Tarixi</CardTitle>
                  <Badge variant="secondary" className="text-xs font-mono">
                    {totalCount} ta
                  </Badge>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative min-w-[200px]">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Administrator qidirish..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="ps-8 text-xs h-8"
                    />
                  </div>
                  <select
                    className="flex h-8 w-[140px] rounded-md border border-input bg-transparent px-2.5 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="">Barcha smenalar</option>
                    <option value="open">Faqat ochiq</option>
                    <option value="closed">Faqat yopiq</option>
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto w-full">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="text-xs font-semibold">ID</TableHead>
                      <TableHead className="text-xs">Administrator</TableHead>
                      <TableHead className="text-xs">Ochilgan</TableHead>
                      <TableHead className="text-xs">Yopilgan</TableHead>
                      <TableHead className="text-xs">Boshlang'ich</TableHead>
                      <TableHead className="text-xs">Tushumlar</TableHead>
                      <TableHead className="text-xs">Chiqimlar</TableHead>
                      <TableHead className="text-xs">Kassada Qoldi (Naqd)</TableHead>
                      <TableHead className="text-xs">Holati</TableHead>
                      <TableHead className="text-right text-xs w-[120px]">Amallar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-6 text-xs text-muted-foreground">
                          Yuklanmoqda...
                        </TableCell>
                      </TableRow>
                    ) : shifts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-6 text-xs text-muted-foreground">
                          Smenalar topilmadi.
                        </TableCell>
                      </TableRow>
                    ) : (
                      shifts.map((shift: CashShift) => {
                        const canClose =
                          shift.status === 'open' &&
                          (isBoshShifokor || shift.administrator === currentUserId)
                        const inHand =
                          Number(shift.start_balance) +
                          Number(shift.cash_collected) -
                          Number(shift.cash_expenses)

                        return (
                          <TableRow
                            key={shift.id}
                            className="cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => setSelectedShiftId(shift.id)}
                          >
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              #{shift.id.slice(0, 8).toUpperCase()}
                            </TableCell>
                            <TableCell className="text-xs font-medium">{shift.admin_name}</TableCell>
                            <TableCell className="text-xs font-mono">
                              {format(new Date(shift.opened_at), 'dd.MM.yy HH:mm')}
                            </TableCell>
                            <TableCell className="text-xs font-mono">
                              {shift.closed_at ? format(new Date(shift.closed_at), 'dd.MM.yy HH:mm') : '-'}
                            </TableCell>
                            <TableCell className="text-xs font-mono">
                              {Number(shift.start_balance).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-xs">
                              <div className="text-emerald-600 font-mono font-medium">
                                Naqd: +{Number(shift.cash_collected).toLocaleString()}
                              </div>
                              <div className="text-blue-600 font-mono text-[10px]">
                                Karta: +{Number(shift.card_collected).toLocaleString()}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs">
                              <div className="text-red-600 font-mono font-medium">
                                Naqd: -{Number(shift.cash_expenses).toLocaleString()}
                              </div>
                              <div className="text-orange-600 font-mono text-[10px]">
                                Karta: -{Number(shift.card_expenses).toLocaleString()}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs font-mono font-bold text-foreground">
                              {inHand.toLocaleString()} UZS
                            </TableCell>
                            <TableCell className="text-xs">
                              {shift.status === 'open' ? (
                                <Badge variant="default" className="bg-emerald-600 text-[10px] h-5">
                                  Ochiq
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[10px] h-5">
                                  Yopiq
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-blue-600"
                                  title="Z-Hisobot (Smena kvitansiyasini chop etish)"
                                  onClick={() => triggerZReportPrint(shift)}
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                </Button>

                                {canClose && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-[11px] px-2 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                                    onClick={() => setShiftToClose(shift)}
                                  >
                                    Yopish
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

              <TablePagination
                totalCount={totalCount}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(newSize) => {
                  setPageSize(newSize)
                  setPage(1)
                }}
                className="mt-4"
              />
            </CardContent>
          </Card>

          {/* Shift Details Modal */}
          <ShiftDetailsModal
            shiftId={selectedShiftId}
            open={!!selectedShiftId}
            onOpenChange={(open) => !open && setSelectedShiftId(null)}
            onPrintZReport={triggerZReportPrint}
          />

          {/* Close Shift Confirmation Dialog */}
          <Dialog open={!!shiftToClose} onOpenChange={(open) => !open && setShiftToClose(null)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-red-600">
                  <CheckCircle2 className="w-5 h-5" />
                  Kassa Smenasini Yopish
                </DialogTitle>
              </DialogHeader>
              {shiftToClose && (
                <div className="py-3 space-y-3 text-xs">
                  <p className="text-muted-foreground">
                    Haqiqatan ham ushbu smenani yopmoqchimisiz? Smena yopilganda barcha tushum va chiqimlar to'liq rekonsiliatsiya qilinadi va Z-Hisobot shakllanadi.
                  </p>
                  <div className="bg-muted/40 p-3 rounded-lg border space-y-1.5 font-mono">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Boshlang'ich qoldiq:</span>
                      <span>{Number(shiftToClose.start_balance).toLocaleString()} UZS</span>
                    </div>
                    <div className="flex justify-between text-emerald-600">
                      <span>(+) Naqd tushum:</span>
                      <span>+{Number(shiftToClose.cash_collected).toLocaleString()} UZS</span>
                    </div>
                    <div className="flex justify-between text-red-600">
                      <span>(-) Naqd chiqim:</span>
                      <span>-{Number(shiftToClose.cash_expenses).toLocaleString()} UZS</span>
                    </div>
                    <div className="border-t pt-1.5 flex justify-between font-bold text-sm text-foreground">
                      <span>Topshiriladigan Naqd Pul:</span>
                      <span>
                        {(
                          Number(shiftToClose.start_balance) +
                          Number(shiftToClose.cash_collected) -
                          Number(shiftToClose.cash_expenses)
                        ).toLocaleString()}{' '}
                        UZS
                      </span>
                    </div>
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2 mt-2">
                <Button variant="outline" size="sm" onClick={() => setShiftToClose(null)}>
                  Bekor qilish
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={isClosing}
                  onClick={() => {
                    if (shiftToClose) {
                      closeShift(shiftToClose.id, {
                        onSuccess: () => {
                          toast.success('Kassa smenasi muvaffaqiyatli yopildi!')
                          triggerZReportPrint(shiftToClose)
                          setShiftToClose(null)
                        },
                      })
                    }
                  }}
                >
                  {isClosing ? 'Yopilmoqda...' : 'Tasdiqlash va Yopish'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Hidden Z-Report Print Container */}
          <div style={{ display: 'none' }}>
            <ZReportPrint
              ref={printRef}
              shift={shiftForPrint}
              payments={printDetails?.payments || []}
              expenses={printDetails?.expenses || []}
            />
          </div>
        </div>
      </Main>
    </>
  )
}
