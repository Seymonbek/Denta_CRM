import { useState } from 'react'
import { format } from 'date-fns'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { useCashShifts, CashShift } from '@/api/hooks/use-cash-shifts'
import { usePayments } from '@/api/hooks/use-payments'

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
            <div className="rounded-md border bg-card text-card-foreground overflow-hidden">
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
  const [status, setStatus] = useState<string>('')
  const { data, isLoading } = useCashShifts({ status: status || undefined })
  const [selectedShift, setSelectedShift] = useState<string | null>(null)

  return (
    <>
      <Header>
        <div className='flex items-center justify-between w-full'>
          <h2 className='text-2xl font-bold tracking-tight'>Kassa Smenalari</h2>
          <div className='flex items-center space-x-4'>
            <select
              className="flex h-9 w-[180px] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Barcha smenalar</option>
              <option value="open">Ochiq</option>
              <option value="closed">Yopiq</option>
            </select>
            <ProfileDropdown />
          </div>
        </div>
      </Header>
      <Main>
        <div className='rounded-md border bg-card text-card-foreground overflow-hidden'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Administrator</TableHead>
                <TableHead>Ochilgan</TableHead>
                <TableHead>Yopilgan</TableHead>
                <TableHead>Boshlang'ich</TableHead>
                <TableHead>Naqd tushum</TableHead>
                <TableHead>Karta tushum</TableHead>
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
                    <TableCell className="text-green-600 font-medium">{Number(shift.cash_collected).toLocaleString()}</TableCell>
                    <TableCell className="text-blue-600 font-medium">{Number(shift.card_collected).toLocaleString()}</TableCell>
                    <TableCell>
                      {shift.status === 'open' ? (
                        <Badge variant="default" className="bg-green-500">Ochiq</Badge>
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
        <ShiftPaymentsModal 
          shiftId={selectedShift} 
          open={!!selectedShift} 
          onOpenChange={(o) => !o && setSelectedShift(null)} 
        />
      </Main>
    </>
  )
}
