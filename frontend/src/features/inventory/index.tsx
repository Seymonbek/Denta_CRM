import { useState, useEffect } from 'react'
import {
  Package,
  AlertTriangle,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Download,
  History,
  ArrowUpRight,
  ArrowDownRight,
  Pencil,
  Boxes,
  Coins,
  Layers,
  CheckCircle2,
} from 'lucide-react'
import { TablePagination } from '@/components/ui/table-pagination'
import {
  useMaterials,
  useCreateMaterial,
  useUpdateMaterial,
  useRestockMaterial,
  useAdjustMaterial,
  useInventoryStats,
  useAllStockLogs,
} from '@/api/hooks/use-inventory'
import {
  type Material,
  type MaterialUnit,
  type MaterialStockLogItem,
  type StockChangeReason,
  type PaginatedResponse,
} from '@/types/api'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { getErrorMessage } from '@/lib/get-error-message'
import { ProcedureBOMsTab } from './procedure-boms-tab'

export function InventoryList() {
  const [activeTab, setActiveTab] = useState<'materials' | 'movements' | 'boms'>('materials')

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [restockMaterial, setRestockMaterial] = useState<Material | null>(null)
  const [restockAmount, setRestockAmount] = useState('')

  const [adjustMaterial, setAdjustMaterial] = useState<Material | null>(null)
  const [adjustDelta, setAdjustDelta] = useState('')
  const [adjustNote, setAdjustNote] = useState('')

  const [editMaterial, setEditMaterial] = useState<Material | null>(null)
  const [editName, setEditName] = useState('')
  const [editUnit, setEditUnit] = useState<MaterialUnit>('piece')
  const [editThreshold, setEditThreshold] = useState('')
  const [editCost, setEditCost] = useState('')
  const [editNotes, setEditNotes] = useState('')

  // Create Form State
  const [name, setName] = useState('')
  const [unit, setUnit] = useState<MaterialUnit>('piece')
  const [quantityInStock, setQuantityInStock] = useState('')
  const [minimumThreshold, setMinimumThreshold] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [notes, setNotes] = useState('')

  // Materials tab filters & pagination
  const [searchTerm, setSearchTerm] = useState('')
  const [stockFilter, setStockFilter] = useState<'all' | 'low'>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // Movements tab filters & pagination
  const [movementReason, setMovementReason] = useState<string>('all')
  const [movementSearch, setMovementSearch] = useState('')
  const [movementPage, setMovementPage] = useState(1)
  const [movementPageSize, setMovementPageSize] = useState(20)

  // Reset pagination on filter change
  useEffect(() => {
    setPage(1)
  }, [searchTerm, stockFilter])

  useEffect(() => {
    setMovementPage(1)
  }, [movementReason, movementSearch])

  // Queries & Mutations
  const { data: materialsData = [], isLoading: isMaterialsLoading } = useMaterials()
  const materialsList: Material[] = Array.isArray(materialsData) ? materialsData : []

  const { data: stats } = useInventoryStats()

  const { data: logsData, isLoading: isLogsLoading } = useAllStockLogs({
    reason: movementReason === 'all' ? undefined : movementReason,
    search: movementSearch || undefined,
    page: movementPage,
    page_size: movementPageSize,
  })

  const logsList: MaterialStockLogItem[] = Array.isArray(logsData)
    ? logsData
    : (logsData as PaginatedResponse<MaterialStockLogItem>)?.results || []
  const logsTotalCount = Array.isArray(logsData)
    ? logsData.length
    : (logsData as PaginatedResponse<MaterialStockLogItem>)?.count || logsList.length

  const createMaterialMutation = useCreateMaterial()
  const updateMaterialMutation = useUpdateMaterial()
  const restockMutation = useRestockMaterial()
  const adjustMutation = useAdjustMaterial()

  // Filter materials
  const filteredMaterials = materialsList.filter((m: Material) => {
    const nameMatch = (m?.name || '').toLowerCase().includes(searchTerm.toLowerCase())
    const stockNum = parseFloat(String(m?.quantityInStock || 0))
    const thresholdNum = parseFloat(String(m?.minimumThreshold || 0))
    const isLow = stockNum <= thresholdNum

    if (stockFilter === 'low' && !isLow) return false
    return nameMatch
  })

  const totalCount = filteredMaterials.length
  const paginatedMaterials = filteredMaterials.slice((page - 1) * pageSize, page * pageSize)

  // Calculate quick totals if stats endpoint is loading
  const totalStockCount = materialsList.length
  const lowStockCount = materialsList.filter(
    (m) => parseFloat(String(m.quantityInStock || 0)) <= parseFloat(String(m.minimumThreshold || 0))
  ).length
  const totalStockSum = materialsList.reduce((acc, m) => {
    const qty = parseFloat(String(m.quantityInStock || 0))
    const cost = parseFloat(String(m.unitCost || 0))
    return acc + qty * cost
  }, 0)

  // Handlers
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !quantityInStock || !minimumThreshold) {
      toast.error('Material nomi, zaxirasi va minimal chegarasini kiriting.')
      return
    }

    try {
      await createMaterialMutation.mutateAsync({
        name,
        unit,
        quantityInStock,
        minimumThreshold,
        unitCost: unitCost || undefined,
        notes: notes || undefined,
      })
      toast.success('Yangi material qo’shildi!')
      setIsCreateModalOpen(false)
      setName('')
      setQuantityInStock('')
      setMinimumThreshold('')
      setUnitCost('')
      setNotes('')
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Material yaratishda xatolik.'))
    }
  }

  const handleOpenEdit = (m: Material) => {
    setEditMaterial(m)
    setEditName(m.name || '')
    setEditUnit(m.unit || 'piece')
    setEditThreshold(String(m.minimumThreshold || ''))
    setEditCost(m.unitCost ? String(m.unitCost) : '')
    setEditNotes(m.notes || '')
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editMaterial || !editName || !editThreshold) return

    try {
      await updateMaterialMutation.mutateAsync({
        id: editMaterial.id,
        data: {
          name: editName,
          unit: editUnit,
          minimumThreshold: editThreshold,
          unitCost: editCost ? editCost : null,
          notes: editNotes,
        },
      })
      toast.success('Material ma’lumotlari yangilandi!')
      setEditMaterial(null)
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Materialni tahrirlashda xatolik.'))
    }
  }

  const handleRestock = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!restockMaterial || !restockAmount) return

    try {
      await restockMutation.mutateAsync({
        id: restockMaterial.id,
        amount: restockAmount,
      })
      toast.success('Zaxira muvaffaqiyatli to’ldirildi!')
      setRestockMaterial(null)
      setRestockAmount('')
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Zaxira to’ldirishda xatolik.'))
    }
  }

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!adjustMaterial || !adjustDelta) return

    const deltaNum = parseFloat(adjustDelta)
    if (isNaN(deltaNum) || deltaNum === 0) {
      toast.error('Tuzatish miqdori nolga teng bo‘lolmaydi.')
      return
    }

    try {
      await adjustMutation.mutateAsync({
        id: adjustMaterial.id,
        delta: adjustDelta,
        note: adjustNote,
      })
      toast.success('Zaxira muvaffaqiyatli tuzatildi!')
      setAdjustMaterial(null)
      setAdjustDelta('')
      setAdjustNote('')
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Zaxirani tuzatishda xatolik.'))
    }
  }

  const handleExportCSV = () => {
    if (filteredMaterials.length === 0) {
      toast.error('Eksport qilish uchun materiallar mavjud emas.')
      return
    }

    const headers = [
      'Material Nomi',
      "O'lchov Birligi",
      'Mavjud Zaxira',
      'Minimal Chegara',
      "Birlik Narxi (so'm)",
      "Umumiy Qiymat (so'm)",
      'Holati',
    ]

    const rows = filteredMaterials.map((m) => {
      const stock = parseFloat(String(m.quantityInStock || 0))
      const threshold = parseFloat(String(m.minimumThreshold || 0))
      const cost = parseFloat(String(m.unitCost || 0))
      const totalVal = stock * cost
      const isLow = stock <= threshold

      return [
        `"${(m.name || '').replace(/"/g, '""')}"`,
        `"${m.unit || 'piece'}"`,
        stock,
        threshold,
        cost,
        totalVal,
        `"${isLow ? 'Kam Qolgan' : 'Yetarli'}"`,
      ]
    })

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `Ombor_Materiallar_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast.success('Materiallar CSV formatda yuklab olindi!')
  }

  const formatDate = (isoStr: string) => {
    if (!isoStr) return '—'
    const d = new Date(isoStr)
    return d.toLocaleString('uz-UZ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getReasonBadge = (reason: StockChangeReason, amount: string) => {
    const isPositive = parseFloat(amount) > 0
    if (reason === 'restock') {
      return (
        <Badge className='bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[11px] gap-1 font-medium'>
          <ArrowUpRight className='h-3 w-3' /> Kirim (Restock)
        </Badge>
      )
    }
    if (reason === 'usage') {
      return (
        <Badge className='bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30 text-[11px] gap-1 font-medium'>
          <ArrowDownRight className='h-3 w-3' /> Sarf (Usage)
        </Badge>
      )
    }
    return (
      <Badge className='bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[11px] gap-1 font-medium'>
        <SlidersHorizontal className='h-3 w-3' /> {isPositive ? '+ Tuzatish' : '- Tuzatish'}
      </Badge>
    )
  }

  return (
    <>
      <Header>
        <div className='flex items-center gap-2.5 me-auto font-bold text-lg tracking-tight'>
          <div className='p-2 rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-sm'>
            <Boxes className='h-5 w-5' />
          </div>
          <div>
            <div className='text-base font-bold'>Omborxona & Materiallar Monitoringi</div>
            <div className='text-xs font-normal text-muted-foreground'>
              Klinik sarf materiallari, qoldiqlar nazorati va texkartalar
            </div>
          </div>
        </div>
        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={handleExportCSV}
            className='h-9 text-xs font-medium gap-1.5 shadow-sm'
          >
            <Download className='h-3.5 w-3.5 text-muted-foreground' /> Eksport (CSV)
          </Button>
          <Button
            size='sm'
            onClick={() => setIsCreateModalOpen(true)}
            className='h-9 text-xs font-bold gap-1.5 shadow'
          >
            <Plus className='h-4 w-4' /> Yangi Material
          </Button>
        </div>
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main>
        {/* KPI Summary Cards */}
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6'>
          {/* Card 1: Total Materials */}
          <div className='p-4 rounded-xl border bg-card/60 backdrop-blur shadow-sm hover:shadow transition-shadow'>
            <div className='flex items-center justify-between'>
              <span className='text-xs font-medium text-muted-foreground'>Jami Materiallar</span>
              <div className='p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400'>
                <Package className='h-4 w-4' />
              </div>
            </div>
            <div className='mt-2 flex items-baseline gap-2'>
              <span className='text-2xl font-black tracking-tight'>
                {stats?.totalMaterials ?? totalStockCount}
              </span>
              <span className='text-xs text-muted-foreground'>faol tur</span>
            </div>
            <p className='text-[11px] text-muted-foreground mt-1'>
              Klinikadagi barcha ro'yxatdan o'tgan materiallar
            </p>
          </div>

          {/* Card 2: Low Stock Warning */}
          <div className='p-4 rounded-xl border bg-card/60 backdrop-blur shadow-sm hover:shadow transition-shadow'>
            <div className='flex items-center justify-between'>
              <span className='text-xs font-medium text-muted-foreground'>Kam Qolgan Zaxira</span>
              <div className='p-2 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400'>
                <AlertTriangle className='h-4 w-4' />
              </div>
            </div>
            <div className='mt-2 flex items-baseline gap-2'>
              <span
                className={`text-2xl font-black tracking-tight ${
                  (stats?.lowStockCount ?? lowStockCount) > 0 ? 'text-rose-600 dark:text-rose-400' : ''
                }`}
              >
                {stats?.lowStockCount ?? lowStockCount}
              </span>
              <span className='text-xs text-muted-foreground'>ta material</span>
            </div>
            <p className='text-[11px] text-muted-foreground mt-1'>
              Minimal chegaradan kam qolgan (ogohlantirish)
            </p>
          </div>

          {/* Card 3: Total Value */}
          <div className='p-4 rounded-xl border bg-card/60 backdrop-blur shadow-sm hover:shadow transition-shadow'>
            <div className='flex items-center justify-between'>
              <span className='text-xs font-medium text-muted-foreground'>Ombor Umumiy Qiymati</span>
              <div className='p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'>
                <Coins className='h-4 w-4' />
              </div>
            </div>
            <div className='mt-2 flex items-baseline gap-1'>
              <span className='text-2xl font-black tracking-tight text-emerald-600 dark:text-emerald-400 font-mono'>
                {stats?.totalStockValue
                  ? Number(stats.totalStockValue).toLocaleString()
                  : Math.round(totalStockSum).toLocaleString()}
              </span>
              <span className='text-xs font-medium text-muted-foreground'>so'm</span>
            </div>
            <p className='text-[11px] text-muted-foreground mt-1'>
              Tannarx bo'yicha hisoblangan jami zaxira qiymati
            </p>
          </div>

          {/* Card 4: Operations / Movements */}
          <div className='p-4 rounded-xl border bg-card/60 backdrop-blur shadow-sm hover:shadow transition-shadow'>
            <div className='flex items-center justify-between'>
              <span className='text-xs font-medium text-muted-foreground'>Jami Harakatlar</span>
              <div className='p-2 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400'>
                <History className='h-4 w-4' />
              </div>
            </div>
            <div className='mt-2 flex items-baseline gap-2'>
              <span className='text-2xl font-black tracking-tight'>
                {(stats?.recentRestocksCount ?? 0) + (stats?.recentUsagesCount ?? 0)}
              </span>
              <span className='text-xs text-muted-foreground'>operatsiya</span>
            </div>
            <p className='text-[11px] text-muted-foreground mt-1'>
              Kirim: {stats?.recentRestocksCount ?? 0}, Chiqim: {stats?.recentUsagesCount ?? 0}
            </p>
          </div>
        </div>

        {/* Main Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={(val: any) => setActiveTab(val)}
          className='w-full space-y-4'
        >
          <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b pb-2'>
            <TabsList className='bg-muted/60 p-1'>
              <TabsTrigger value='materials' className='gap-2 text-xs font-semibold'>
                <Package className='h-4 w-4' />
                <span>Ombor (Materiallar)</span>
                {lowStockCount > 0 && (
                  <span className='ms-1 px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold'>
                    {lowStockCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value='movements' className='gap-2 text-xs font-semibold'>
                <History className='h-4 w-4' />
                <span>Kirim/Chiqim Tarixi</span>
              </TabsTrigger>
              <TabsTrigger value='boms' className='gap-2 text-xs font-semibold'>
                <Layers className='h-4 w-4' />
                <span>Muolaja Texkartalari (BOM)</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* TAB 1: MATERIALS */}
          <TabsContent value='materials' className='space-y-4 m-0'>
            {/* Filter Toolbar */}
            <div className='flex flex-col sm:flex-row items-center gap-3'>
              <div className='relative flex-1 w-full'>
                <Search className='absolute left-3 top-2.5 h-4 w-4 text-muted-foreground' />
                <Input
                  placeholder="Material nomi bo'yicha qidiruv..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className='ps-9 text-xs h-9'
                />
              </div>
              <Select value={stockFilter} onValueChange={(val: any) => setStockFilter(val)}>
                <SelectTrigger className='w-full sm:w-56 text-xs h-9'>
                  <SelectValue placeholder='Zaxira Holati' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>Barcha Materiallar ({materialsList.length})</SelectItem>
                  <SelectItem value='low'>Kam Qolganlar ({lowStockCount})</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Materials Table */}
            <div className='rounded-xl border bg-card shadow-sm overflow-x-auto w-full'>
              <Table className='min-w-[800px] sm:min-w-full'>
                <TableHeader>
                  <TableRow className='bg-muted/40'>
                    <TableHead className='text-xs font-semibold'>Material Nomi</TableHead>
                    <TableHead className='text-xs font-semibold'>O'lchov Birligi</TableHead>
                    <TableHead className='text-xs font-semibold'>Mavjud Zaxira</TableHead>
                    <TableHead className='text-xs font-semibold'>Minimal Chegara</TableHead>
                    <TableHead className='text-xs font-semibold'>Birlik Narxi</TableHead>
                    <TableHead className='text-xs font-semibold'>Umumiy Qiymat</TableHead>
                    <TableHead className='text-xs font-semibold'>Holati</TableHead>
                    <TableHead className='text-xs font-semibold text-end'>Amallar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isMaterialsLoading ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className='text-center py-10 text-xs text-muted-foreground animate-pulse'
                      >
                        Materiallar yuklanmoqda...
                      </TableCell>
                    </TableRow>
                  ) : paginatedMaterials.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className='text-center py-10 text-xs text-muted-foreground'>
                        Materiallar topilmadi.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedMaterials.map((m: Material) => {
                      const stockNum = parseFloat(String(m.quantityInStock || 0))
                      const thresholdNum = parseFloat(String(m.minimumThreshold || 0))
                      const costNum = m.unitCost ? parseFloat(String(m.unitCost)) : 0
                      const totalValue = stockNum * costNum
                      const unitVal = m.unit || 'piece'
                      const isLowStock = stockNum <= thresholdNum

                      return (
                        <TableRow key={m.id} className='hover:bg-muted/20 transition-colors'>
                          <TableCell className='font-semibold text-xs'>
                            <div className='flex items-center gap-2.5'>
                              <div
                                className={`p-1.5 rounded-lg border ${
                                  isLowStock
                                    ? 'bg-rose-500/10 text-rose-600 border-rose-500/20'
                                    : 'bg-primary/10 text-primary border-primary/20'
                                }`}
                              >
                                <Package className='h-4 w-4' />
                              </div>
                              <div>
                                <div className='font-bold'>{m.name}</div>
                                {m.notes && (
                                  <div className='text-[11px] text-muted-foreground line-clamp-1'>
                                    {m.notes}
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className='text-xs font-mono uppercase text-muted-foreground'>
                            {unitVal === 'gram' ? 'Gramm' : unitVal === 'piece' ? 'Dona' : 'ML'}
                          </TableCell>
                          <TableCell className='text-xs font-bold font-mono'>
                            <span
                              className={`px-2 py-0.5 rounded-md ${
                                isLowStock
                                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 font-black'
                                  : 'bg-muted'
                              }`}
                            >
                              {stockNum.toLocaleString()} {unitVal}
                            </span>
                          </TableCell>
                          <TableCell className='text-xs font-mono text-muted-foreground'>
                            {thresholdNum.toLocaleString()} {unitVal}
                          </TableCell>
                          <TableCell className='text-xs font-mono'>
                            {costNum > 0 ? `${costNum.toLocaleString()} so'm` : '—'}
                          </TableCell>
                          <TableCell className='text-xs font-mono font-medium'>
                            {totalValue > 0 ? `${Math.round(totalValue).toLocaleString()} so'm` : '—'}
                          </TableCell>
                          <TableCell className='text-xs'>
                            {isLowStock ? (
                              <Badge variant='destructive' className='text-[10px] animate-pulse gap-1'>
                                <AlertTriangle className='h-3 w-3' /> Kam Qolgan
                              </Badge>
                            ) : (
                              <Badge
                                variant='outline'
                                className='text-[10px] text-emerald-600 border-emerald-500/40 bg-emerald-500/10 gap-1'
                              >
                                <CheckCircle2 className='h-3 w-3' /> Yetarli
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className='text-end'>
                            <div className='flex items-center justify-end gap-1.5'>
                              <Button
                                size='sm'
                                variant='outline'
                                className='h-7 px-2 text-[11px] font-medium gap-1 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10'
                                onClick={() => setRestockMaterial(m)}
                                title="Zaxirani to'ldirish"
                              >
                                <RefreshCw className='h-3 w-3' /> To'ldirish
                              </Button>
                              <Button
                                size='sm'
                                variant='outline'
                                className='h-7 px-2 text-[11px] font-medium gap-1 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10'
                                onClick={() => setAdjustMaterial(m)}
                                title='Zaxira tuzatish'
                              >
                                <SlidersHorizontal className='h-3 w-3' /> Tuzatish
                              </Button>
                              <Button
                                size='sm'
                                variant='ghost'
                                className='h-7 w-7 p-0 text-muted-foreground hover:text-foreground'
                                onClick={() => handleOpenEdit(m)}
                                title='Tahrirlash'
                              >
                                <Pencil className='h-3.5 w-3.5' />
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

            {/* Pagination */}
            <TablePagination
              page={page}
              pageSize={pageSize}
              totalCount={totalCount}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              className='mt-2'
            />
          </TabsContent>

          {/* TAB 2: MOVEMENTS LOGS */}
          <TabsContent value='movements' className='space-y-4 m-0'>
            {/* Movement Filter Toolbar */}
            <div className='flex flex-col sm:flex-row items-center gap-3'>
              <div className='relative flex-1 w-full'>
                <Search className='absolute left-3 top-2.5 h-4 w-4 text-muted-foreground' />
                <Input
                  placeholder="Material nomi, bemor yoki izoh bo'yicha qidiruv..."
                  value={movementSearch}
                  onChange={(e) => setMovementSearch(e.target.value)}
                  className='ps-9 text-xs h-9'
                />
              </div>
              <Select value={movementReason} onValueChange={(val) => setMovementReason(val)}>
                <SelectTrigger className='w-full sm:w-52 text-xs h-9'>
                  <SelectValue placeholder='Harakat turi' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>Barcha Harakatlar</SelectItem>
                  <SelectItem value='restock'>Faqat Kirim (Restock)</SelectItem>
                  <SelectItem value='usage'>Faqat Sarf (Usage)</SelectItem>
                  <SelectItem value='adjustment'>Faqat Tuzatish (Adjustment)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Movements Table */}
            <div className='rounded-xl border bg-card shadow-sm overflow-x-auto w-full'>
              <Table className='min-w-[850px] sm:min-w-full'>
                <TableHeader>
                  <TableRow className='bg-muted/40'>
                    <TableHead className='text-xs font-semibold'>Sana & Vaqt</TableHead>
                    <TableHead className='text-xs font-semibold'>Material</TableHead>
                    <TableHead className='text-xs font-semibold'>Harakat Turi</TableHead>
                    <TableHead className='text-xs font-semibold'>Miqdor</TableHead>
                    <TableHead className='text-xs font-semibold'>Qoldiq Snapshot</TableHead>
                    <TableHead className='text-xs font-semibold'>Bemor / Muolaja</TableHead>
                    <TableHead className='text-xs font-semibold'>Mas'ul Xodim</TableHead>
                    <TableHead className='text-xs font-semibold'>Izoh</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLogsLoading ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className='text-center py-10 text-xs text-muted-foreground animate-pulse'
                      >
                        Harakatlar tarixi yuklanmoqda...
                      </TableCell>
                    </TableRow>
                  ) : logsList.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className='text-center py-10 text-xs text-muted-foreground'>
                        Harakatlar tarixi topilmadi.
                      </TableCell>
                    </TableRow>
                  ) : (
                    logsList.map((log) => {
                      const changeNum = parseFloat(log.changeAmount)
                      const isPositive = changeNum > 0

                      return (
                        <TableRow key={log.id} className='hover:bg-muted/20 transition-colors'>
                          <TableCell className='text-xs text-muted-foreground whitespace-nowrap font-mono'>
                            {formatDate(log.createdAt)}
                          </TableCell>
                          <TableCell className='text-xs font-bold'>
                            <div className='flex items-center gap-1.5'>
                              <Package className='h-3.5 w-3.5 text-primary' />
                              <span>{log.materialName || 'Material'}</span>
                            </div>
                          </TableCell>
                          <TableCell className='text-xs'>
                            {getReasonBadge(log.reason, log.changeAmount)}
                          </TableCell>
                          <TableCell className='text-xs font-mono font-bold whitespace-nowrap'>
                            <span
                              className={
                                isPositive
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-rose-600 dark:text-rose-400'
                              }
                            >
                              {isPositive ? `+${changeNum}` : changeNum} {log.materialUnit || ''}
                            </span>
                          </TableCell>
                          <TableCell className='text-xs font-mono text-muted-foreground whitespace-nowrap'>
                            {Number(log.resultingQuantity).toLocaleString()} {log.materialUnit || ''}
                          </TableCell>
                          <TableCell className='text-xs'>
                            {log.relatedTreatment?.patientName ? (
                              <div className='flex flex-col'>
                                <span className='font-semibold'>
                                  {log.relatedTreatment.patientName}
                                </span>
                                <span className='text-[10px] text-muted-foreground'>
                                  Davolash #{log.relatedTreatment.id.slice(0, 8)}
                                </span>
                              </div>
                            ) : log.relatedTreatmentId ? (
                              <span className='text-[11px] text-muted-foreground'>
                                Davolash #{log.relatedTreatmentId.slice(0, 8)}
                              </span>
                            ) : (
                              <span className='text-muted-foreground text-xs'>—</span>
                            )}
                          </TableCell>
                          <TableCell className='text-xs whitespace-nowrap'>
                            {log.performedBy ? (
                              <span>
                                {log.performedBy.firstName} {log.performedBy.lastName}
                              </span>
                            ) : (
                              <span className='text-muted-foreground'>Tizim (Avto)</span>
                            )}
                          </TableCell>
                          <TableCell className='text-xs text-muted-foreground max-w-[200px] truncate'>
                            {log.note || '—'}
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination for movements */}
            <TablePagination
              page={movementPage}
              pageSize={movementPageSize}
              totalCount={logsTotalCount}
              onPageChange={setMovementPage}
              onPageSizeChange={setMovementPageSize}
              className='mt-2'
            />
          </TabsContent>

          {/* TAB 3: BOMS */}
          <TabsContent value='boms' className='m-0'>
            <ProcedureBOMsTab />
          </TabsContent>
        </Tabs>

        {/* ----------------- MODALS ----------------- */}

        {/* 1. Create Material Modal */}
        <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
          <DialogContent className='sm:max-w-md'>
            <DialogHeader>
              <DialogTitle className='text-base font-bold flex items-center gap-2'>
                <Plus className='h-4 w-4 text-primary' />
                Yangi Material Qo'shish
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleCreate} className='space-y-3.5 py-2'>
              <div className='space-y-1'>
                <label className='text-xs font-semibold'>Material Nomi *</label>
                <Input
                  placeholder='Masalan: Stomatologik Plomba kompozit A2'
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className='text-xs'
                  required
                />
              </div>

              <div className='grid grid-cols-2 gap-3'>
                <div className='space-y-1'>
                  <label className='text-xs font-semibold'>O'lchov birligi *</label>
                  <Select value={unit} onValueChange={(val) => setUnit(val as MaterialUnit)}>
                    <SelectTrigger className='text-xs'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='piece'>Dona (Piece)</SelectItem>
                      <SelectItem value='gram'>Gramm (Gram)</SelectItem>
                      <SelectItem value='ml'>Millilitr (ML)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className='space-y-1'>
                  <label className='text-xs font-semibold'>Birlik narxi (so'm)</label>
                  <Input
                    type='number'
                    placeholder='25000'
                    value={unitCost}
                    onChange={(e) => setUnitCost(e.target.value)}
                    className='text-xs font-mono'
                  />
                </div>
              </div>

              <div className='grid grid-cols-2 gap-3'>
                <div className='space-y-1'>
                  <label className='text-xs font-semibold'>Boshlang'ich zaxira *</label>
                  <Input
                    type='number'
                    step='0.001'
                    placeholder='100'
                    value={quantityInStock}
                    onChange={(e) => setQuantityInStock(e.target.value)}
                    className='text-xs font-mono'
                    required
                  />
                </div>

                <div className='space-y-1'>
                  <label className='text-xs font-semibold'>Minimal chegara *</label>
                  <Input
                    type='number'
                    step='0.001'
                    placeholder='15'
                    value={minimumThreshold}
                    onChange={(e) => setMinimumThreshold(e.target.value)}
                    className='text-xs font-mono'
                    required
                  />
                </div>
              </div>

              <div className='space-y-1'>
                <label className='text-xs font-semibold'>Qo'shimcha izoh</label>
                <Input
                  placeholder='Yetkazib beruvchi, saqlash sharoiti va boshqalar'
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className='text-xs'
                />
              </div>

              <DialogFooter className='pt-3 gap-2'>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  Bekor qilish
                </Button>
                <Button
                  type='submit'
                  size='sm'
                  disabled={createMaterialMutation.isPending}
                  className='font-bold'
                >
                  {createMaterialMutation.isPending ? 'Saqlanmoqda...' : "Materialni Qo'shish"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* 2. Restock Modal */}
        <Dialog
          open={restockMaterial !== null}
          onOpenChange={(open) => !open && setRestockMaterial(null)}
        >
          <DialogContent className='sm:max-w-md'>
            <DialogHeader>
              <DialogTitle className='text-base font-bold flex items-center gap-2'>
                <RefreshCw className='h-4 w-4 text-emerald-600' />
                Zaxirani To'ldirish ({restockMaterial?.name})
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleRestock} className='space-y-3.5 py-2'>
              <div className='p-3 rounded-lg bg-muted/40 border text-xs space-y-1'>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>Hozirgi zaxira:</span>
                  <span className='font-bold font-mono'>
                    {restockMaterial?.quantityInStock} {restockMaterial?.unit}
                  </span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>Minimal chegara:</span>
                  <span className='font-mono'>
                    {restockMaterial?.minimumThreshold} {restockMaterial?.unit}
                  </span>
                </div>
              </div>

              <div className='space-y-1'>
                <label className='text-xs font-semibold'>
                  Qo'shilayotgan miqdor ({restockMaterial?.unit}) *
                </label>
                <Input
                  type='number'
                  step='0.001'
                  placeholder='Masalan: 50'
                  value={restockAmount}
                  onChange={(e) => setRestockAmount(e.target.value)}
                  className='text-xs font-mono font-bold'
                  required
                />
              </div>

              <DialogFooter className='pt-3 gap-2'>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => setRestockMaterial(null)}
                >
                  Bekor qilish
                </Button>
                <Button
                  type='submit'
                  size='sm'
                  disabled={restockMutation.isPending}
                  className='font-bold bg-emerald-600 hover:bg-emerald-700 text-white'
                >
                  {restockMutation.isPending ? 'Saqlanmoqda...' : "Zaxirani To'ldirish"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* 3. Adjust Stock Modal */}
        <Dialog
          open={adjustMaterial !== null}
          onOpenChange={(open) => !open && setAdjustMaterial(null)}
        >
          <DialogContent className='sm:max-w-md'>
            <DialogHeader>
              <DialogTitle className='text-base font-bold flex items-center gap-2'>
                <SlidersHorizontal className='h-4 w-4 text-amber-600' />
                Zaxira Tuzatish ({adjustMaterial?.name})
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleAdjust} className='space-y-3.5 py-2'>
              <div className='p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs space-y-1'>
                <div className='flex justify-between'>
                  <span className='text-amber-800 dark:text-amber-300 font-medium'>
                    Hozirgi mavjud zaxira:
                  </span>
                  <span className='font-bold font-mono text-amber-900 dark:text-amber-200'>
                    {adjustMaterial?.quantityInStock} {adjustMaterial?.unit}
                  </span>
                </div>
                <p className='text-[11px] text-muted-foreground pt-1 border-t border-amber-500/20'>
                  Zaxiraga qo'shish uchun musbat son (masalan: <b>+5</b>), kamaytirish uchun manfiy son
                  (masalan: <b>-3</b>) kiriting.
                </p>
              </div>

              <div className='space-y-1'>
                <label className='text-xs font-semibold'>
                  Tuzatish miqdori (Delta: +/-) *
                </label>
                <Input
                  type='number'
                  step='0.001'
                  placeholder='Masalan: -2 yoki +5'
                  value={adjustDelta}
                  onChange={(e) => setAdjustDelta(e.target.value)}
                  className='text-xs font-mono font-bold'
                  required
                />
              </div>

              <div className='space-y-1'>
                <label className='text-xs font-semibold'>Tuzatish sababi / Izoh</label>
                <Input
                  placeholder='Masalan: Inventarizatsiya kamomadi yoki yaroqsiz'
                  value={adjustNote}
                  onChange={(e) => setAdjustNote(e.target.value)}
                  className='text-xs'
                />
                <div className='flex flex-wrap gap-1.5 pt-1.5'>
                  {['Qayta sanash', 'Kamomad', 'Yaroqsiz / Muddati o‘tgan'].map((preset) => (
                    <button
                      key={preset}
                      type='button'
                      onClick={() => setAdjustNote(preset)}
                      className='text-[10px] px-2 py-0.5 rounded-full border bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors'
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <DialogFooter className='pt-3 gap-2'>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => setAdjustMaterial(null)}
                >
                  Bekor qilish
                </Button>
                <Button
                  type='submit'
                  size='sm'
                  disabled={adjustMutation.isPending}
                  className='font-bold bg-amber-600 hover:bg-amber-700 text-white'
                >
                  {adjustMutation.isPending ? 'Saqlanmoqda...' : 'Tuzatishni Saqlash'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* 4. Edit Material Modal */}
        <Dialog
          open={editMaterial !== null}
          onOpenChange={(open) => !open && setEditMaterial(null)}
        >
          <DialogContent className='sm:max-w-md'>
            <DialogHeader>
              <DialogTitle className='text-base font-bold flex items-center gap-2'>
                <Pencil className='h-4 w-4 text-primary' />
                Materialni Tahrirlash
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleUpdate} className='space-y-3.5 py-2'>
              <div className='space-y-1'>
                <label className='text-xs font-semibold'>Material Nomi *</label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className='text-xs'
                  required
                />
              </div>

              <div className='grid grid-cols-2 gap-3'>
                <div className='space-y-1'>
                  <label className='text-xs font-semibold'>O'lchov birligi *</label>
                  <Select
                    value={editUnit}
                    onValueChange={(val) => setEditUnit(val as MaterialUnit)}
                  >
                    <SelectTrigger className='text-xs'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='piece'>Dona (Piece)</SelectItem>
                      <SelectItem value='gram'>Gramm (Gram)</SelectItem>
                      <SelectItem value='ml'>Millilitr (ML)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className='space-y-1'>
                  <label className='text-xs font-semibold'>Birlik narxi (so'm)</label>
                  <Input
                    type='number'
                    placeholder='25000'
                    value={editCost}
                    onChange={(e) => setEditCost(e.target.value)}
                    className='text-xs font-mono'
                  />
                </div>
              </div>

              <div className='space-y-1'>
                <label className='text-xs font-semibold'>Minimal chegara *</label>
                <Input
                  type='number'
                  step='0.001'
                  value={editThreshold}
                  onChange={(e) => setEditThreshold(e.target.value)}
                  className='text-xs font-mono'
                  required
                />
              </div>

              <div className='space-y-1'>
                <label className='text-xs font-semibold'>Izohlar</label>
                <Input
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className='text-xs'
                />
              </div>

              <DialogFooter className='pt-3 gap-2'>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => setEditMaterial(null)}
                >
                  Bekor qilish
                </Button>
                <Button
                  type='submit'
                  size='sm'
                  disabled={updateMaterialMutation.isPending}
                  className='font-bold'
                >
                  {updateMaterialMutation.isPending ? 'Saqlanmoqda...' : "O'zgarishlarni Saqlash"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </Main>
    </>
  )
}
