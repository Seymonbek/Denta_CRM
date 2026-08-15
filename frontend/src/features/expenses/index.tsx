import React, { useState } from 'react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { _Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Plus, Settings, Trash2 } from 'lucide-react'
import { useExpenses, useDeleteExpense } from '@/api/hooks/use-expenses'
import { format } from 'date-fns'
import { ExpenseFormModal } from './expense-form-modal'
import { CategoriesModal } from './categories-modal'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'

export function ExpensesPage() {
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(false)
  const [page, _setPage] = useState(1)

  const { data, isLoading } = useExpenses({ page })
  const deleteMutation = useDeleteExpense()

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
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground">Klinika xarajatlari va to'lovlarini boshqarish.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsCategoriesOpen(true)}>
                <Settings className="w-4 h-4 mr-2" />
                Toifalar
              </Button>
              <Button onClick={() => setIsFormOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Xarajat Kiritish
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Barcha Xarajatlar</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sana</TableHead>
                    <TableHead>Toifa</TableHead>
                    <TableHead>Izoh</TableHead>
                    <TableHead>To'lov Usuli</TableHead>
                    <TableHead>Kiritdi</TableHead>
                    <TableHead className="text-right">Summa</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center">Yuklanmoqda...</TableCell>
                    </TableRow>
                  ) : data?.results?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center">Ma'lumot topilmadi</TableCell>
                    </TableRow>
                  ) : (
                    data?.results?.map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell>{format(new Date(expense.date), 'dd.MM.yyyy HH:mm')}</TableCell>
                        <TableCell>{expense.category_name}</TableCell>
                        <TableCell>{expense.description || '-'}</TableCell>
                        <TableCell>
                          {expense.payment_method === 'cash' ? 'Naqd' : 'Karta/Plastik'}
                        </TableCell>
                        <TableCell>{expense.recorded_by_name}</TableCell>
                        <TableCell className="text-right font-medium text-red-500">
                          -{Number(expense.amount).toLocaleString()} UZS
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(expense.id)}>
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
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
