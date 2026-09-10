import { useState, useEffect, useRef } from 'react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  Plus,
  Settings,
  Trash2,
  Search,
  X,
  Printer,
  Download,
  TrendingDown,
  Wallet,
  CreditCard,
  Tag,
  Calendar,
} from 'lucide-react'
import {
  useExpenses,
  useDeleteExpense,
  useExpenseCategories,
  useExpenseStats,
} from '@/api/hooks/use-expenses'
import {
  format,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
} from 'date-fns'
import { useReactToPrint } from 'react-to-print'
import { toast } from 'sonner'
import { ExpenseFormModal } from './expense-form-modal'
import { CategoriesModal } from './categories-modal'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { TablePagination } from '@/components/ui/table-pagination'
import { ExpenseVoucherPrint } from '@/components/print/expense-voucher-print'
import type { Expense } from '@/api/expenses'

type PeriodFilter = 'all' | 'today' | 'week' | 'month'

export function ExpensesPage() {
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(false)

  // Search, Filters & Pagination State
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [methodFilter, setMethodFilter] = useState<string>('')
  const [period, setPeriod] = useState<PeriodFilter>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // Print voucher state
  const [selectedExpenseForPrint, setSelectedExpenseForPrint] = useState<Expense | null>(null)
  const printComponentRef = useRef<HTMLDivElement>(null)

  const handlePrint = useReactToPrint({
    contentRef: printComponentRef,
    documentTitle: `Xarajat_Kvitansiyasi_${selectedExpenseForPrint ? String(selectedExpenseForPrint.id).slice(-6) : 'Vaucher'}`,
  })

  const triggerPrint = (expense: Expense) => {
    setSelectedExpenseForPrint(expense)
    setTimeout(() => {
      handlePrint()
    }, 150)
  }

  // Calculate start_date & end_date from period
  let startDateParam: string | undefined = undefined
  let endDateParam: string | undefined = undefined
  const now = new Date()

  if (period === 'today') {
    startDateParam = startOfDay(now).toISOString()
    endDateParam = endOfDay(now).toISOString()
  } else if (period === 'week') {
    startDateParam = startOfWeek(now, { weekStartsOn: 1 }).toISOString()
    endDateParam = endOfWeek(now, { weekStartsOn: 1 }).toISOString()
  } else if (period === 'month') {
    startDateParam = startOfMonth(now).toISOString()
    endDateParam = endOfMonth(now).toISOString()
  }

  useEffect(() => {
    setPage(1)
  }, [searchTerm, categoryFilter, methodFilter, period])

  const { data: categories = [] } = useExpenseCategories()
  const { data: stats } = useExpenseStats()
  const { data, isLoading } = useExpenses({
    search: searchTerm.trim() || undefined,
    category: categoryFilter && categoryFilter !== 'all' ? categoryFilter : undefined,
    payment_method: methodFilter && methodFilter !== 'all' ? methodFilter : undefined,
    start_date: startDateParam,
    end_date: endDateParam,
    page,
    page_size: pageSize,
  })
  const deleteMutation = useDeleteExpense()

  const expenses = data?.results ?? []
  const totalCount = data?.count ?? expenses.length

  const handleDelete = (id: string) => {
    if (confirm('Rostdan ham ushbu xarajatni o\'chirmoqchimisiz?')) {
      deleteMutation.mutate(id)
    }
  }

  const handleExportCSV = () => {
    if (expenses.length === 0) {
      toast.info('Eksport qilish uchun xarajat ma\'lumotlari topilmadi')
      return
    }

    const headers = [
      'Sana',
      'Xarajat Toifasi',
      'Izoh / Tavsif',
      'To\'lov Usuli',
      'Kiritgan Xodim',
      'Summa (UZS)',
    ]

    const rows = expenses.map((e) => [
      `"${format(new Date(e.date), 'dd.MM.yyyy HH:mm')}"`,
      `"${e.category_name || ''}"`,
      `"${(e.description || '').replace(/"/g, '""')}"`,
      `"${e.payment_method === 'cash' ? 'Naqd' : 'Karta/O\'tkazma'}"`,
      `"${e.recorded_by_name || ''}"`,
      `"${Number(e.amount).toLocaleString('uz-UZ')}"`,
    ])

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `Klinika_Xarajatlari_${format(new Date(), 'yyyy-MM-dd')}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success('Xarajatlar ro\'yxati muvaffaqiyatli CSV faylga yuklab olindi!')
  }

  return (
    <>
      <Header>
        <div className="flex items-center justify-between w-full">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Klinika Xarajatlari</h2>
          </div>
          <div className="flex items-center space-x-4">
            <ProfileDropdown />
          </div>
        </div>
      </Header>
      <Main>
        <div className="space-y-6">
          {/* Top Bar Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-muted-foreground text-xs sm:text-sm">
                Klinikaning operatsion xarajatlari, kassa chiqimlari va toifalar bo'yicha hisob-kitoblar.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={handleExportCSV}>
                <Download className="w-4 h-4 mr-2 text-emerald-600" />
                CSV Eksport
              </Button>
              <Button variant="outline" size="sm" onClick={() => setIsCategoriesOpen(true)}>
                <Settings className="w-4 h-4 mr-2" />
                Toifalar
              </Button>
              <Button size="sm" onClick={() => setIsFormOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Xarajat Kiritish
              </Button>
            </div>
          </div>

          {/* 4 KPI Summary Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="border-l-4 border-l-red-500 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Jami Xarajatlar
                </CardTitle>
                <TrendingDown className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold text-red-600 font-mono">
                  {Number(stats?.totalAmount || 0).toLocaleString()} UZS
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Klinika bo'yicha jami {stats?.totalCount || 0} ta operatsiya
                </p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-amber-500 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Shu Oygi Xarajat
                </CardTitle>
                <Calendar className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold text-amber-600 font-mono">
                  {Number(stats?.monthTotal || 0).toLocaleString()} UZS
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Joriy oyda {stats?.monthCount || 0} ta chiqim qayd etildi
                </p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-blue-500 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  To'lov Turlari Bo'yicha
                </CardTitle>
                <Wallet className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground flex items-center">
                      <Wallet className="h-3 w-3 mr-1 text-emerald-600" /> Naqd:
                    </span>
                    <span className="font-semibold font-mono text-foreground">
                      {Number(stats?.cashTotal || 0).toLocaleString()} UZS
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground flex items-center">
                      <CreditCard className="h-3 w-3 mr-1 text-blue-600" /> Karta:
                    </span>
                    <span className="font-semibold font-mono text-foreground">
                      {Number(stats?.cardTotal || 0).toLocaleString()} UZS
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-purple-500 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Eng Katta Toifa
                </CardTitle>
                <Tag className="h-4 w-4 text-purple-500" />
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold text-purple-700 truncate" title={stats?.topCategoryName || '-'}>
                  {stats?.topCategoryName || 'Mavjud emas'}
                </div>
                <p className="text-xs text-muted-foreground mt-1 font-mono">
                  {Number(stats?.topCategoryTotal || 0).toLocaleString()} UZS sarflandi
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg">Xarajatlar Ro'yxati</CardTitle>
                  <Badge variant="secondary" className="text-xs font-mono">
                    {totalCount} ta
                  </Badge>
                </div>

                {/* Search & Filters */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Period Filter Buttons */}
                  <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border">
                    <Button
                      variant={period === 'all' ? 'default' : 'ghost'}
                      size="sm"
                      className="h-7 text-xs px-2.5"
                      onClick={() => setPeriod('all')}
                    >
                      Barchasi
                    </Button>
                    <Button
                      variant={period === 'today' ? 'default' : 'ghost'}
                      size="sm"
                      className="h-7 text-xs px-2.5"
                      onClick={() => setPeriod('today')}
                    >
                      Bugun
                    </Button>
                    <Button
                      variant={period === 'week' ? 'default' : 'ghost'}
                      size="sm"
                      className="h-7 text-xs px-2.5"
                      onClick={() => setPeriod('week')}
                    >
                      Hafta
                    </Button>
                    <Button
                      variant={period === 'month' ? 'default' : 'ghost'}
                      size="sm"
                      className="h-7 text-xs px-2.5"
                      onClick={() => setPeriod('month')}
                    >
                      Shu Oy
                    </Button>
                  </div>

                  <div className="relative min-w-[180px] max-w-xs">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Izoh yoki kirituvchi..."
                      className="pl-8 h-8 text-xs"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    {searchTerm && (
                      <button
                        type="button"
                        onClick={() => setSearchTerm('')}
                        className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-[145px] h-8 text-xs">
                      <SelectValue placeholder="Barcha toifalar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Barcha toifalar</SelectItem>
                      {categories.map((cat: any) => (
                        <SelectItem key={cat.id} value={String(cat.id)}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={methodFilter} onValueChange={setMethodFilter}>
                    <SelectTrigger className="w-[130px] h-8 text-xs">
                      <SelectValue placeholder="To'lov usuli" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Barcha usullar</SelectItem>
                      <SelectItem value="cash">Naqd</SelectItem>
                      <SelectItem value="card">Karta/Plastik</SelectItem>
                    </SelectContent>
                  </Select>

                  {(searchTerm || (categoryFilter && categoryFilter !== 'all') || (methodFilter && methodFilter !== 'all') || period !== 'all') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setSearchTerm('')
                        setCategoryFilter('')
                        setMethodFilter('')
                        setPeriod('all')
                      }}
                    >
                      <X className="me-1 h-3.5 w-3.5" /> Tozalash
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Sana</TableHead>
                      <TableHead className="text-xs">Toifa</TableHead>
                      <TableHead className="text-xs">Izoh</TableHead>
                      <TableHead className="text-xs">To'lov Usuli</TableHead>
                      <TableHead className="text-xs">Kiritdi</TableHead>
                      <TableHead className="text-right text-xs">Summa</TableHead>
                      <TableHead className="w-[90px] text-right text-xs">Amallar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-xs text-muted-foreground">
                          Yuklanmoqda...
                        </TableCell>
                      </TableRow>
                    ) : expenses.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-xs text-muted-foreground">
                          Xarajatlar topilmadi
                        </TableCell>
                      </TableRow>
                    ) : (
                      expenses.map((expense) => (
                        <TableRow key={expense.id} className="hover:bg-muted/40 transition-colors">
                          <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                            {format(new Date(expense.date), 'dd.MM.yyyy HH:mm')}
                          </TableCell>
                          <TableCell className="text-xs">
                            <Badge variant="outline" className="font-medium bg-muted/30">
                              {expense.category_name}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs max-w-xs truncate" title={expense.description || '-'}>
                            {expense.description || '-'}
                          </TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            {expense.payment_method === 'cash' ? (
                              <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 bg-emerald-50/50">
                                Naqd
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-blue-500/30 text-blue-600 bg-blue-50/50">
                                Karta/Plastik
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                            {expense.recorded_by_name || '-'}
                          </TableCell>
                          <TableCell className="text-right text-xs font-semibold font-mono text-red-600 whitespace-nowrap">
                            -{Number(expense.amount).toLocaleString()} UZS
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-blue-600"
                                title="Chiqim orderini chop etish"
                                onClick={() => triggerPrint(expense)}
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-red-600"
                                title="O'chirish"
                                onClick={() => handleDelete(expense.id)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Table Pagination */}
              <TablePagination
                page={page}
                pageSize={pageSize}
                totalCount={totalCount}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                className="mt-4"
              />
            </CardContent>
          </Card>

          {isFormOpen && (
            <ExpenseFormModal open={isFormOpen} onOpenChange={setIsFormOpen} />
          )}
          {isCategoriesOpen && (
            <CategoriesModal open={isCategoriesOpen} onOpenChange={setIsCategoriesOpen} />
          )}

          {/* Hidden Print Container for Official Expense Voucher */}
          <div style={{ display: 'none' }}>
            <ExpenseVoucherPrint ref={printComponentRef} expense={selectedExpenseForPrint} />
          </div>
        </div>
      </Main>
    </>
  )
}
