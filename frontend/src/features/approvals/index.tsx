import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import { Check, X, ShieldAlert, AlertCircle, Search } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { TablePagination } from '@/components/ui/table-pagination'
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
  const { data: treatmentsData, isLoading } = useTreatments({ approval_status: 'pending' })
  const discounts = Array.isArray((treatmentsData as any)?.results)
    ? (treatmentsData as any).results
    : Array.isArray(treatmentsData)
    ? treatmentsData
    : []

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const { mutate: approveDiscount, isPending } = useApproveDiscount()
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const filteredDiscounts = useMemo(() => {
    if (!search) return discounts
    const q = search.toLowerCase()
    return discounts.filter((item: any) => {
      const patientName = (item.patientName || (item.patient ? `${item.patient.firstName || ''} ${item.patient.lastName || ''}` : '')).toLowerCase()
      const doctorName = (item.doctorName || (item.doctor?.user ? `${item.doctor.user.firstName || ''} ${item.doctor.user.lastName || ''}` : '')).toLowerCase()
      const diag = (item.diagnosis || '').toLowerCase()
      return patientName.includes(q) || doctorName.includes(q) || diag.includes(q)
    })
  }, [discounts, search])

  const paginatedDiscounts = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredDiscounts.slice(start, start + pageSize)
  }, [filteredDiscounts, page, pageSize])

  const handleApprove = (id: string) => {
    approveDiscount(
      { id, status: 'approved' },
      {
        onSuccess: () => toast.success('Chegirma muvaffaqiyatli tasdiqlandi ✅'),
        onError: (err: any) => toast.error(err?.response?.data?.detail || 'Tasdiqlashda xatolik yuz berdi'),
      }
    )
  }

  const handleReject = () => {
    if (!rejectingId) return
    if (!rejectReason.trim()) {
      toast.error('Iltimos, rad etish sababini kiriting')
      return
    }
    approveDiscount(
      { id: rejectingId, status: 'rejected' },
      {
        onSuccess: () => {
          toast.success('Chegirma rad etildi ❌')
          setRejectingId(null)
          setRejectReason('')
        },
        onError: (err: any) => toast.error(err?.response?.data?.detail || 'Rad etishda xatolik yuz berdi'),
      }
    )
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Bemor, shifokor yoki tashxis..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="ps-8 text-xs h-8"
          />
        </div>
        <div className="text-xs text-muted-foreground">
          Kutilayotgan: <span className="font-bold text-foreground">{filteredDiscounts.length}</span> ta chegirma
        </div>
      </div>

      <div className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-x-auto w-full">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="text-xs font-semibold">Sana</TableHead>
              <TableHead className="text-xs font-semibold">Bemor</TableHead>
              <TableHead className="text-xs font-semibold">Shifokor</TableHead>
              <TableHead className="text-xs font-semibold">Tashxis / Muolaja</TableHead>
              <TableHead className="text-xs font-semibold">Asl Narx</TableHead>
              <TableHead className="text-xs font-semibold">Chegirma va Sababi</TableHead>
              <TableHead className="text-xs font-semibold">Tasdiqlanuvchi Narx</TableHead>
              <TableHead className="text-xs font-semibold text-right">Amallar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-xs text-muted-foreground animate-pulse">
                  Kutilayotgan chegirmalar yuklanmoqda...
                </TableCell>
              </TableRow>
            ) : filteredDiscounts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-xs text-muted-foreground">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <ShieldAlert className="h-8 w-8 text-muted-foreground/40" />
                    <span>Hozirda tasdiqlash kutilayotgan hech qanday chegirma yo'q.</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginatedDiscounts.map((item: any) => {
                const patientName = item.patientName || (item.patient ? `${item.patient.firstName || ''} ${item.patient.lastName || ''}`.trim() : 'Bemor')
                const doctorName = item.doctorName || (item.doctor?.user ? `Dr. ${item.doctor.user.firstName || ''} ${item.doctor.user.lastName || ''}`.trim() : 'Shifokor')
                const originalPrice = Number(item.originalPrice || item.price || 0)
                const finalPrice = Number(item.price || 0)
                const discountPercent = item.discountPercent || (originalPrice > 0 ? ((originalPrice - finalPrice) / originalPrice * 100).toFixed(0) : 0)

                return (
                  <TableRow key={String(item.id)} className="hover:bg-muted/20">
                    <TableCell className="text-xs font-mono">
                      {item.createdAt ? format(new Date(item.createdAt), 'dd.MM.yyyy HH:mm') : '-'}
                    </TableCell>
                    <TableCell className="text-xs font-bold text-primary">
                      {patientName}
                    </TableCell>
                    <TableCell className="text-xs font-medium">
                      {doctorName}
                    </TableCell>
                    <TableCell className="text-xs max-w-xs truncate">
                      <span className="font-semibold">{item.diagnosis || 'Muolaja'}</span>
                      {item.procedureTypeName && <span className="text-[10px] text-muted-foreground block truncate">{item.procedureTypeName}</span>}
                    </TableCell>
                    <TableCell className="text-xs line-through text-muted-foreground font-mono">
                      {originalPrice.toLocaleString()} so'm
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="flex flex-col gap-0.5">
                        <Badge variant="outline" className="w-fit text-[10px] bg-amber-500/10 text-amber-600 border-amber-300">
                          {discountPercent}% chegirma
                        </Badge>
                        {item.discountReason && (
                          <span className="text-[10px] text-muted-foreground italic">
                            "{item.discountReason}"
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                      {finalPrice.toLocaleString()} so'm
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-7 px-2.5 text-xs text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300" 
                          onClick={() => handleApprove(String(item.id))} 
                          disabled={isPending}
                        >
                          <Check className="h-3.5 w-3.5 me-1" /> Tasdiqlash
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-7 px-2 text-xs text-rose-700 bg-rose-50 hover:bg-rose-100 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300" 
                          onClick={() => setRejectingId(String(item.id))} 
                          disabled={isPending}
                        >
                          <X className="h-3.5 w-3.5 me-1" /> Rad etish
                        </Button>
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
        totalCount={filteredDiscounts.length}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize)
          setPage(1)
        }}
      />

      <Dialog open={!!rejectingId} onOpenChange={(o) => !o && setRejectingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chegirmani rad etish</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-xs font-medium text-foreground">Rad etish sababi *</label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Shifokorga ko'rsatiladigan rad etish sababini yozing..."
              className="text-xs"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRejectingId(null)}>Bekor qilish</Button>
            <Button variant="destructive" size="sm" onClick={handleReject} disabled={isPending}>Rad etish</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function RefundsTable() {
  const { data: paymentsData, isLoading } = usePayments({ refund_status: 'pending' })
  const refunds = Array.isArray((paymentsData as any)?.results)
    ? (paymentsData as any).results
    : Array.isArray(paymentsData)
    ? paymentsData
    : []

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const { mutate: approveRefund, isPending } = useApproveRefund()

  const filteredRefunds = useMemo(() => {
    if (!search) return refunds
    const q = search.toLowerCase()
    return refunds.filter((item: any) => {
      const patientName = (item.patientName || (item.patient ? `${item.patient.firstName || ''} ${item.patient.lastName || ''}` : '')).toLowerCase()
      const shortId = (item.shortId || (item.id ? String(item.id).slice(0, 8) : '')).toLowerCase()
      const method = String(item.method || '').toLowerCase()
      return patientName.includes(q) || shortId.includes(q) || method.includes(q)
    })
  }, [refunds, search])

  const paginatedRefunds = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredRefunds.slice(start, start + pageSize)
  }, [filteredRefunds, page, pageSize])

  const handleAction = (id: string, approved: boolean) => {
    approveRefund(
      { id, approved },
      {
        onSuccess: () => toast.success(approved ? 'To\'lovni bekor qilish tasdiqlandi ✅' : 'Bekor qilish rad etildi ❌'),
        onError: (err: any) => toast.error(err?.response?.data?.detail || 'Xatolik yuz berdi'),
      }
    )
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Bemor, chek raqami yoki to'lov turi..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="ps-8 text-xs h-8"
          />
        </div>
        <div className="text-xs text-muted-foreground">
          Kutilayotgan: <span className="font-bold text-foreground">{filteredRefunds.length}</span> ta bekor qilish
        </div>
      </div>

      <div className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-x-auto w-full">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="text-xs font-semibold">Sana</TableHead>
              <TableHead className="text-xs font-semibold">Chek / ID</TableHead>
              <TableHead className="text-xs font-semibold">Bemor</TableHead>
              <TableHead className="text-xs font-semibold">To'lov Turi</TableHead>
              <TableHead className="text-xs font-semibold">Summa</TableHead>
              <TableHead className="text-xs font-semibold">Holat</TableHead>
              <TableHead className="text-xs font-semibold text-right">Amallar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-xs text-muted-foreground animate-pulse">
                  Kutilayotgan bekor qilishlar yuklanmoqda...
                </TableCell>
              </TableRow>
            ) : filteredRefunds.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-xs text-muted-foreground">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <AlertCircle className="h-8 w-8 text-muted-foreground/40" />
                    <span>Hozirda kutilayotgan to'lovni bekor qilish arizalari yo'q.</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginatedRefunds.map((item: any) => {
                const patientName = item.patientName || (item.patient ? `${item.patient.firstName || ''} ${item.patient.lastName || ''}`.trim() : 'Bemor')
                const shortId = item.shortId || (item.id ? String(item.id).slice(0, 8).toUpperCase() : '')

                return (
                  <TableRow key={String(item.id)} className="hover:bg-muted/20">
                    <TableCell className="text-xs font-mono">
                      {item.createdAt ? format(new Date(item.createdAt), 'dd.MM.yyyy HH:mm') : '-'}
                    </TableCell>
                    <TableCell className="text-xs font-mono font-bold text-muted-foreground">
                      #{shortId}
                    </TableCell>
                    <TableCell className="text-xs font-bold text-primary">
                      {patientName}
                    </TableCell>
                    <TableCell className="text-xs uppercase font-medium">
                      {String(item.method || 'cash')}
                    </TableCell>
                    <TableCell className="text-xs font-mono font-bold text-rose-600 dark:text-rose-400">
                      {Number(item.amount || 0).toLocaleString()} so'm
                    </TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-300 text-[10px]">
                        Refund Kutilmoqda
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-7 px-2.5 text-xs text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300" 
                          onClick={() => handleAction(String(item.id), true)} 
                          disabled={isPending}
                        >
                          <Check className="h-3.5 w-3.5 me-1" /> Tasdiqlash
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-7 px-2 text-xs text-rose-700 bg-rose-50 hover:bg-rose-100 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300" 
                          onClick={() => handleAction(String(item.id), false)} 
                          disabled={isPending}
                        >
                          <X className="h-3.5 w-3.5 me-1" /> Rad etish
                        </Button>
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
        totalCount={filteredRefunds.length}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize)
          setPage(1)
        }}
      />
    </>
  )
}

export function ApprovalsFeature() {
  const { data: treatmentsData } = useTreatments({ approval_status: 'pending' })
  const discountsCount = (Array.isArray((treatmentsData as any)?.results) ? (treatmentsData as any).results.length : Array.isArray(treatmentsData) ? treatmentsData.length : 0)

  const { data: paymentsData } = usePayments({ refund_status: 'pending' })
  const refundsCount = (Array.isArray((paymentsData as any)?.results) ? (paymentsData as any).results.length : Array.isArray(paymentsData) ? paymentsData.length : 0)

  return (
    <>
      <Header>
        <div className='flex items-center justify-between w-full'>
          <div>
            <h2 className='text-2xl font-bold tracking-tight'>Tasdiqlashlar (Approvals)</h2>
            <p className='text-xs text-muted-foreground'>Bosh shifokor uchun chegirmalar va to'lov bekor qilishlarni boshqarish paneli</p>
          </div>
          <ProfileDropdown />
        </div>
      </Header>
      <Main>
        <Tabs defaultValue="discounts" className="w-full space-y-4">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="discounts" className="flex items-center gap-2">
              Chegirmalar
              {discountsCount > 0 && (
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px] bg-amber-500 text-white">
                  {discountsCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="refunds" className="flex items-center gap-2">
              To'lovni Bekor Qilish (Refunds)
              {refundsCount > 0 && (
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px] bg-rose-500 text-white">
                  {refundsCount}
                </Badge>
              )}
            </TabsTrigger>
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
