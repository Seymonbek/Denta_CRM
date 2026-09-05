import { useState, useEffect } from 'react'
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
import { Plus, Settings, Trash2, Search, X } from 'lucide-react'
import { useExpenses, useDeleteExpense, useExpenseCategories } from '@/api/hooks/use-expenses'
import { format } from 'date-fns'
import { ExpenseFormModal } from './expense-form-modal'
import { CategoriesModal } from './categories-modal'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { TablePagination } from '@/components/ui/table-pagination'

export function ExpensesPage() {
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(false)
  
  // Search, Filters & Pagination State
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [methodFilter, setMethodFilter] = useState<string>('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  useEffect(() => {
    setPage(1)
  }, [searchTerm, categoryFilter, methodFilter])

  const { data: categories = [] } = useExpenseCategories()
  const { data, isLoading } = useExpenses({
    search: searchTerm.trim() || undefined,
    category: categoryFilter && categoryFilter !== 'all' ? categoryFilter : undefined,
    payment_method: methodFilter && methodFilter !== 'all' ? methodFilter : undefined,
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

  return (
    <>
      <Header>
        <div className="flex items-center justify-between w-full">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Xarajatlar</h2>
          </div>
          <div className="flex items-center space-x-4">
            <ProfileDropdown />
          </div>
        </div>
      </Header>
      <Main>
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-muted-foreground text-xs sm:text-sm">Klinika xarajatlari va to'lovlarini boshqarish.</p>
            </div>
            <div className="flex gap-2">
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

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 flex-wrap">
                <CardTitle className="text-lg">Barcha Xarajatlar</CardTitle>

                {/* Search & Filters */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative min-w-[200px] max-w-xs">
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
                    <SelectTrigger className="w-[150px] h-8 text-xs">
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
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                      <SelectValue placeholder="To'lov usuli" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Barcha usullar</SelectItem>
                      <SelectItem value="cash">Naqd</SelectItem>
                      <SelectItem value="card">Karta/Plastik</SelectItem>
                    </SelectContent>
                  </Select>

                  {(searchTerm || (categoryFilter && categoryFilter !== 'all') || (methodFilter && methodFilter !== 'all')) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setSearchTerm('')
                        setCategoryFilter('')
                        setMethodFilter('')
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
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-6 text-xs text-muted-foreground">
                          Yuklanmoqda...
                        </TableCell>
                      </TableRow>
                    ) : expenses.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-6 text-xs text-muted-foreground">
                          Xarajatlar topilmadi
                        </TableCell>
                      </TableRow>
                    ) : (
                      expenses.map((expense) => (
                        <TableRow key={expense.id}>
                          <TableCell className="text-xs font-mono">{format(new Date(expense.date), 'dd.MM.yyyy HH:mm')}</TableCell>
                          <TableCell className="text-xs font-medium">{expense.category_name}</TableCell>
                          <TableCell className="text-xs">{expense.description || '-'}</TableCell>
                          <TableCell className="text-xs">
                            {expense.payment_method === 'cash' ? 'Naqd' : 'Karta/Plastik'}
                          </TableCell>
                          <TableCell className="text-xs">{expense.recorded_by_name}</TableCell>
                          <TableCell className="text-right text-xs font-medium font-mono text-red-500">
                            -{Number(expense.amount).toLocaleString()} UZS
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(expense.id)}>
                              <Trash2 className="w-3.5 h-3.5 text-red-500" />
                            </Button>
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
                className="mt-3"
              />
            </CardContent>
          </Card>

          {isFormOpen && (
            <ExpenseFormModal open={isFormOpen} onOpenChange={setIsFormOpen} />
          )}
          {isCategoriesOpen && (
            <CategoriesModal open={isCategoriesOpen} onOpenChange={setIsCategoriesOpen} />
          )}
        </div>
      </Main>
    </>
  )
}

