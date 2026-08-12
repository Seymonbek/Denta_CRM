import { useState } from 'react'
import { format } from 'date-fns'
import { Check, X } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { useTreatments, useApproveDiscount } from '@/api/hooks/use-treatments'
import { usePayments, useApproveRefund } from '@/api/hooks/use-payments'
import { toast } from 'sonner'
import { Textarea } from '@/components/ui/textarea'

function DiscountsTable() {
  const { data, isLoading } = useTreatments({ approval_status: 'pending' })
  const { mutate: approveDiscount, isPending } = useApproveDiscount()
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const handleApprove = (id: string) => {
    approveDiscount(
      { id, status: 'approved' },
      {
        onSuccess: () => toast.success('Chegirma tasdiqlandi'),
        onError: () => toast.error('Xatolik yuz berdi'),
      }
    )
  }

  const handleReject = () => {
    if (!rejectingId) return
    if (!rejectReason.trim()) {
      toast.error('Iltimos, sababni kiriting')
      return
    }
    approveDiscount(
      { id: rejectingId, status: 'rejected' },
      {
        onSuccess: () => {
          toast.success('Chegirma rad etildi')
          setRejectingId(null)
          setRejectReason('')
        },
        onError: () => toast.error('Xatolik yuz berdi'),
      }
    )
  }

  return (
    <>
      <div className="rounded-md border bg-card text-card-foreground overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sana</TableHead>
              <TableHead>Bemor</TableHead>
              <TableHead>Shifokor</TableHead>
              <TableHead>Asl Narx</TableHead>
              <TableHead>Yangi Narx</TableHead>
              <TableHead>Holat</TableHead>
              <TableHead className="text-right">Amallar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-4">Yuklanmoqda...</TableCell>
              </TableRow>
            ) : data?.results?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-4">Kutilayotgan chegirmalar yo'q.</TableCell>
              </TableRow>
            ) : (
              data?.results?.map((item: any) => (
                <TableRow key={item.id}>
                  <TableCell>{format(new Date(item.createdAt || new Date()), 'dd.MM.yyyy HH:mm')}</TableCell>
                  <TableCell>{item.patient?.firstName} {item.patient?.lastName}</TableCell>
                  <TableCell>{item.doctor?.firstName} {item.doctor?.lastName}</TableCell>
                  <TableCell className="line-through text-muted-foreground">{Number(item.price).toLocaleString()} UZS</TableCell>
                  <TableCell className="font-medium text-blue-600">{Number(item.price).toLocaleString()} UZS (Chegirma: %)</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-500">Kutilmoqda</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="icon" variant="outline" className="text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => handleApprove(item.id)} disabled={isPending}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setRejectingId(item.id)} disabled={isPending}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!rejectingId} onOpenChange={(o) => !o && setRejectingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chegirmani rad etish</DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            <label className="text-sm font-medium mb-2 block">Rad etish sababi</label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Sababini yozing..."
            />
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setRejectingId(null)}>Bekor qilish</Button>
            <Button variant="destructive" onClick={handleReject} disabled={isPending}>Rad etish</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function RefundsTable() {
  const { data, isLoading } = usePayments({ refund_status: 'pending' })
  const { mutate: approveRefund, isPending } = useApproveRefund()

  const handleAction = (id: string, approved: boolean) => {
    approveRefund(
      { id, approved },
      {
        onSuccess: () => toast.success(approved ? 'Bekor qilish tasdiqlandi' : 'Bekor qilish rad etildi'),
        onError: () => toast.error('Xatolik yuz berdi'),
      }
    )
  }

  return (
    <div className="rounded-md border bg-card text-card-foreground overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sana</TableHead>
            <TableHead>Bemor</TableHead>
            <TableHead>To'lov Turi</TableHead>
            <TableHead>Summa</TableHead>
            <TableHead>Holat</TableHead>
            <TableHead className="text-right">Amallar</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-4">Yuklanmoqda...</TableCell>
            </TableRow>
          ) : data?.results?.length === 0 ? (
             <TableRow>
              <TableCell colSpan={6} className="text-center py-4">Kutilayotgan to'lov bekor qilishlari yo'q.</TableCell>
            </TableRow>
          ) : (
            data?.results?.map((item: any) => (
              <TableRow key={item.id}>
                <TableCell>{format(new Date(item.createdAt || new Date()), 'dd.MM.yyyy HH:mm')}</TableCell>
                <TableCell>{item.patient?.firstName} {item.patient?.lastName}</TableCell>
                <TableCell className="uppercase">{item.method}</TableCell>
                <TableCell className="font-medium">{Number(item.amount).toLocaleString()} UZS</TableCell>
                <TableCell>
                  <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-500">Refund Kutilmoqda</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button size="icon" variant="outline" className="text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => handleAction(item.id, true)} disabled={isPending}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleAction(item.id, false)} disabled={isPending}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

export function ApprovalsFeature() {
  return (
    <>
      <Header>
        <div className='flex items-center justify-between w-full'>
          <h2 className='text-2xl font-bold tracking-tight'>Tasdiqlashlar (Approvals)</h2>
          <ProfileDropdown />
        </div>
      </Header>
      <Main>
        <Tabs defaultValue="discounts" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="discounts">Chegirmalar</TabsTrigger>
            <TabsTrigger value="refunds">To'lovni Bekor Qilish (Refunds)</TabsTrigger>
          </TabsList>
          
          <TabsContent value="discounts">
            <DiscountsTable />
          </TabsContent>
          
          <TabsContent value="refunds">
            <RefundsTable />
          </TabsContent>
        </Tabs>
      </Main>
    </>
  )
}
