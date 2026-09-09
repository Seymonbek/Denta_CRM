import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { Search } from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { useCashShifts, useCloseCashShift, type CashShift } from '@/api/hooks/use-cash-shifts'
import { usePayments } from '@/api/hooks/use-payments'
import { useAuthStore } from '@/stores/auth-store'

function ShiftPaymentsModal({ shiftId, open, onOpenChange }: { shiftId: string | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data, isLoading } = usePayments({ cash_shift: shiftId || undefined })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Smena To'lovlari (#{shiftId?.slice(0, 8).toUpperCase()})</DialogTitle>
        </DialogHeader>
        <div className="mt-4">
          {isLoading ? (
            <p>Yuklanmoqda...</p>
          ) : (
            <div className="rounded-md border bg-card text-card-foreground overflow-x-auto w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Chek №</TableHead>
                    <TableHead>Vaqti</TableHead>
                    <TableHead>Bemor</TableHead>
                    <TableHead>To'lov Turi</TableHead>
                    <TableHead className="text-right">Summa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.results?.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">#{payment.shortId || payment.id.slice(0, 8).toUpperCase()}</TableCell>
                      <TableCell>{format(new Date(payment.createdAt || new Date()), 'dd.MM.yyyy HH:mm')}</TableCell>
                      <TableCell>{payment.patientName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="uppercase">{payment.method}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{Number(payment.amount).toLocaleString()} UZS</TableCell>
                    </TableRow>
                  ))}
                  {!data?.results?.length && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-4">To'lovlar topilmadi</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
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

  const { data, isLoading } = useCashShifts({
    search: searchTerm || undefined,
    status: status || undefined,
    page,
    page_size: pageSize,
  })

  const shifts = data?.results || []
  const totalCount = data?.count ?? shifts.length
  const [selectedShift, setSelectedShift] = useState<string | null>(null)
  
  const isBoshShifokor = useAuthStore(s => s.isBoshShifokor())
  const { mutate: closeShift, isPending: isClosing } = useCloseCashShift()
  const [shiftToClose, setShiftToClose] = useState<string | null>(null)

  return (
    <>
      <Header>
        <div className='flex items-center justify-between w-full'>
          <h2 className='text-2xl font-bold tracking-tight'>Kassa Smenalari</h2>
          <ProfileDropdown />
        </div>
      </Header>
      <Main>
        <div className='mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
          <div>
            <h1 className='text-xl font-bold tracking-tight'>Klinika Kassa Smenalari</h1>
            <p className='text-xs text-muted-foreground'>
              Kunlik ochilgan va yopilgan kassa smenalari nazorati ({totalCount} ta smena)
            </p>
          </div>

          <div className='flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto'>
            <div className='relative w-full sm:w-64'>
              <Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
              <Input
                placeholder="Administrator ismi bo'yicha..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className='ps-9 text-xs h-9'
              />
            </div>
            <select
              className="flex h-9 w-full sm:w-[160px] rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Barcha smenalar</option>
              <option value="open">Ochiq smenalar</option>
              <option value="closed">Yopiq smenalar</option>
            </select>
          </div>
        </div>

        <div className='rounded-xl border bg-card text-card-foreground shadow-sm overflow-x-auto w-full'>
          <Table>
            <TableHeader>
              <TableRow className='bg-muted/30'>
                <TableHead className='text-xs font-semibold'>ID</TableHead>
                <TableHead>Administrator</TableHead>
                <TableHead>Ochilgan</TableHead>
                <TableHead>Yopilgan</TableHead>
                <TableHead>Boshlang'ich</TableHead>
                <TableHead>Tushumlar</TableHead>
                <TableHead>Xarajatlar</TableHead>
                <TableHead>Kassada Qoldi (Naqd)</TableHead>
                <TableHead>Holati</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className='text-center py-4'>
                    Yuklanmoqda...
                  </TableCell>
                </TableRow>
              ) : data?.results?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className='text-center py-4'>
                    Smenalar topilmadi.
                  </TableCell>
                </TableRow>
              ) : (
                data?.results?.map((shift: CashShift) => (
                  <TableRow key={shift.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedShift(shift.id)}>
                    <TableCell className="font-mono text-xs">#{shift.id.slice(0, 8).toUpperCase()}</TableCell>
                    <TableCell>{shift.admin_name}</TableCell>
                    <TableCell>{format(new Date(shift.opened_at), 'dd.MM.yy HH:mm')}</TableCell>
                    <TableCell>
                      {shift.closed_at ? format(new Date(shift.closed_at), 'dd.MM.yy HH:mm') : '-'}
                    </TableCell>
                    <TableCell>{Number(shift.start_balance).toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="text-green-600 font-medium">Naqd: {Number(shift.cash_collected).toLocaleString()}</div>
                      <div className="text-blue-600 font-medium text-xs">Karta: {Number(shift.card_collected).toLocaleString()}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-red-500 font-medium">Naqd: {Number(shift.cash_expenses).toLocaleString()}</div>
                      <div className="text-orange-500 font-medium text-xs">Karta: {Number(shift.card_expenses).toLocaleString()}</div>
                    </TableCell>
                    <TableCell className="font-bold">
                      {(Number(shift.start_balance) + Number(shift.cash_collected) - Number(shift.cash_expenses)).toLocaleString()}
                    </TableCell>
                    <TableCell className="flex items-center gap-2">
                      {shift.status === 'open' ? (
                        <>
                          <Badge variant="default" className="bg-green-500">Ochiq</Badge>
                          {isBoshShifokor && (
                            <Button 
                              variant="destructive" 
                              size="sm" 
                              className="h-6 text-[10px] px-2"
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                setShiftToClose(shift.id); 
                              }}
                            >
                              Yopish
                            </Button>
                          )}
                        </>
                      ) : (
                        <Badge variant="secondary">Yopiq</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
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
        />

        <ShiftPaymentsModal 
          shiftId={selectedShift} 
          open={!!selectedShift} 
          onOpenChange={(open) => !open && setSelectedShift(null)} 
        />

        <Dialog open={!!shiftToClose} onOpenChange={(open) => !open && setShiftToClose(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Smenani majburiy yopish</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="text-sm text-muted-foreground">
                Haqiqatdan ham ushbu smenani yopmoqchimisiz? Bu jarayon barcha tushumlarni yakuniy hisoblaydi va smenani yopadi. Bu amalni orqaga qaytarib bo'lmaydi.
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShiftToClose(null)}>Bekor qilish</Button>
              <Button 
                variant="destructive" 
                disabled={isClosing}
                onClick={() => {
                  if (shiftToClose) {
                    closeShift(shiftToClose, {
                      onSuccess: () => setShiftToClose(null)
                    })
                  }
                }}
              >
                {isClosing ? 'Yopilmoqda...' : 'Smenani Yopish'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </Main>
    </>
  )
}
