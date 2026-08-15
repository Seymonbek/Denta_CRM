import { useState } from 'react'
import { Package, AlertTriangle, Plus, RefreshCw, Search } from 'lucide-react'
import {
  useMaterials,
  useCreateMaterial,
  useRestockMaterial,
} from '@/api/hooks/use-inventory'
import { type Material, type MaterialUnit } from '@/types/api'
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
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [restockMaterial, setRestockMaterial] = useState<Material | null>(null)
  const [restockAmount, setRestockAmount] = useState('')

  const [searchTerm, setSearchTerm] = useState('')
  const [stockFilter, setStockFilter] = useState<'all' | 'low'>('all')

  // Form State
  const [name, setName] = useState('')
  const [unit, setUnit] = useState<MaterialUnit>('piece')
  const [quantityInStock, setQuantityInStock] = useState('')
  const [minimumThreshold, setMinimumThreshold] = useState('')
  const [unitCost, setUnitCost] = useState('')

  const { data: materialsData = [], isLoading } = useMaterials()
  const materialsList = Array.isArray(materialsData?.results)
    ? materialsData.results
    : Array.isArray(materialsData)
    ? materialsData
    : []

  const filteredMaterials = materialsList.filter((m: Record<string, unknown>) => {
    const nameMatch = (m?.name || '').toLowerCase().includes(searchTerm.toLowerCase())
    const stockNum = parseFloat(m?.quantityInStock || m?.quantity_in_stock || '0')
    const thresholdNum = parseFloat(m?.minimumThreshold || m?.minimum_threshold || '0')
    const isLow = stockNum <= thresholdNum

    if (stockFilter === 'low' && !isLow) return false
    return nameMatch
  })

  const createMaterialMutation = useCreateMaterial()
  const restockMutation = useRestockMaterial()

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
      })
      toast.success('Yangi material qo’shildi!')
      setIsCreateModalOpen(false)
      setName('')
      setQuantityInStock('')
      setMinimumThreshold('')
      setUnitCost('')
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Material yaratishda xatolik.'))
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
      toast.success('Zaxira to’ldirildi!')
      setRestockMaterial(null)
      setRestockAmount('')
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Zaxira to’ldirishda xatolik.'))
    }
  }

  return (
    <>
      <Header>
        <div className='flex items-center gap-2 me-auto font-bold text-lg tracking-tight'>
          <Package className='h-5 w-5 text-primary' />
          <span>Sklad (Materiallar Monitoringi)</span>
        </div>
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main>
        <Tabs defaultValue="materials" className="w-full">
          <div className="flex justify-between items-center mb-6 border-b pb-2">
            <TabsList>
              <TabsTrigger value="materials">Ombor (Sklad)</TabsTrigger>
              <TabsTrigger value="boms">Muolaja Texkartalari</TabsTrigger>
            </TabsList>
            <Button onClick={() => setIsCreateModalOpen(true)} className='shadow text-xs font-bold gap-1.5'>
              <Plus className='h-4 w-4' /> Yangi Material
            </Button>
          </div>

          <TabsContent value="materials" className="space-y-4 m-0">
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
          <Select value={stockFilter} onValueChange={(val: Record<string, unknown>) => setStockFilter(val)}>
            <SelectTrigger className='w-full sm:w-48 text-xs h-9'>
              <SelectValue placeholder='Zaxira Holati' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>Barcha Materiallar</SelectItem>
              <SelectItem value='low'>Kam Qolganlar (Low Stock)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Materials Table with Mobile Responsive Horizontal Scroll */}
        <div className='rounded-xl border bg-card shadow-sm overflow-x-auto w-full'>
          <Table className='min-w-[650px] sm:min-w-full'>
            <TableHeader>
              <TableRow className='bg-muted/30'>
                <TableHead className='text-xs font-semibold'>Material Nomi</TableHead>
                <TableHead className='text-xs font-semibold'>O'lchov Birligi</TableHead>
                <TableHead className='text-xs font-semibold'>Mavjud Zaxira</TableHead>
                <TableHead className='text-xs font-semibold'>Minimal Chegara</TableHead>
                <TableHead className='text-xs font-semibold'>Birlik Narxi (so'm)</TableHead>
                <TableHead className='text-xs font-semibold'>Zaxira Holati</TableHead>
                <TableHead className='text-xs font-semibold text-end'>Amallar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className='text-center py-8 text-xs text-muted-foreground animate-pulse'>
                    Materiallar yuklanmoqda...
                  </TableCell>
                </TableRow>
              ) : filteredMaterials.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className='text-center py-8 text-xs text-muted-foreground'>
                    Hech qanday material topilmadi.
                  </TableCell>
                </TableRow>
              ) : (
                filteredMaterials.map((m: Record<string, unknown>) => {
                  const stockNum = parseFloat(m?.quantityInStock || m?.quantity_in_stock || '0')
                  const thresholdNum = parseFloat(m?.minimumThreshold || m?.minimum_threshold || '0')
                  const costNum = m?.unitCost || m?.unit_cost
                  const unitVal = m?.unit || 'piece'
                  const isLowStock = stockNum <= thresholdNum

                  return (
                    <TableRow key={m?.id} className='hover:bg-muted/20'>
                      <TableCell className='font-semibold text-xs'>
                        <div className='flex items-center gap-2'>
                          <Package className='h-4 w-4 text-primary' />
                          <span>{m?.name || 'Material'}</span>
                        </div>
                      </TableCell>
                      <TableCell className='text-xs font-mono uppercase'>
                        {unitVal === 'gram' ? 'Gramm' : unitVal === 'piece' ? 'Dona' : 'ML'}
                      </TableCell>
                      <TableCell className='text-xs font-bold font-mono'>
                        {stockNum.toLocaleString()}
                      </TableCell>
                      <TableCell className='text-xs font-mono text-muted-foreground'>
                        {thresholdNum.toLocaleString()}
                      </TableCell>
                      <TableCell className='text-xs font-mono'>
                        {costNum ? `${Number(costNum).toLocaleString()} so'm` : '—'}
                      </TableCell>
                      <TableCell className='text-xs'>
                        {isLowStock ? (
                          <Badge variant='destructive' className='text-[10px] animate-pulse'>
                            <AlertTriangle className='me-1 h-3 w-3' /> Kam Qolgan (Low Stock)
                          </Badge>
                        ) : (
                          <Badge variant='outline' className='text-[10px] text-emerald-600 border-emerald-500'>
                            Yetarli (OK)
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className='text-end'>
                        <Button
                          size='sm'
                          variant='outline'
                          className='h-8 text-xs'
                          onClick={() => setRestockMaterial(m)}
                        >
                          <RefreshCw className='me-1.5 h-3.5 w-3.5' /> To'ldirish (Restock)
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
          </TabsContent>

          <TabsContent value="boms" className="m-0">
            <ProcedureBOMsTab />
          </TabsContent>
        </Tabs>

        {/* Create Material Modal */}
        <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
          <DialogContent className='sm:max-w-md'>
            <DialogHeader>
              <DialogTitle>Yangi Material Qo'shish</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleCreate} className='space-y-3 py-2'>
              <div className='space-y-1'>
                <label className='text-xs font-medium'>Material Nomi *</label>
                <Input
                  placeholder='Masalan: Stomatologik Plomba kompozit'
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className='grid grid-cols-2 gap-3'>
                <div className='space-y-1'>
                  <label className='text-xs font-medium'>O'lchov birligi *</label>
                  <Select value={unit} onValueChange={(val) => setUnit(val as MaterialUnit)}>
                    <SelectTrigger>
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
                  <label className='text-xs font-medium'>Birlik narxi (so'm)</label>
                  <Input
                    type='number'
                    placeholder='25000'
                    value={unitCost}
                    onChange={(e) => setUnitCost(e.target.value)}
                  />
                </div>
              </div>

              <div className='grid grid-cols-2 gap-3'>
                <div className='space-y-1'>
                  <label className='text-xs font-medium'>Mavjud zaxira madori *</label>
                  <Input
                    type='number'
                    placeholder='100'
                    value={quantityInStock}
                    onChange={(e) => setQuantityInStock(e.target.value)}
                    required
                  />
                </div>

                <div className='space-y-1'>
                  <label className='text-xs font-medium'>Minimal chegara (Low threshold) *</label>
                  <Input
                    type='number'
                    placeholder='15'
                    value={minimumThreshold}
                    onChange={(e) => setMinimumThreshold(e.target.value)}
                    required
                  />
                </div>
              </div>

              <DialogFooter className='pt-2'>
                <Button type='button' variant='outline' onClick={() => setIsCreateModalOpen(false)}>
                  Bekor qilish
                </Button>
                <Button type='submit' disabled={createMaterialMutation.isPending}>
                  {createMaterialMutation.isPending ? 'Saqlanmoqda...' : 'Qo’shish'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Restock Modal */}
        <Dialog open={restockMaterial !== null} onOpenChange={(open) => !open && setRestockMaterial(null)}>
          <DialogContent className='sm:max-w-md'>
            <DialogHeader>
              <DialogTitle>Zaxirani To'ldirish ({restockMaterial?.name})</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleRestock} className='space-y-3 py-2'>
              <div className='space-y-1'>
                <label className='text-xs font-medium'>Qo'shilayotgan miqdor ({restockMaterial?.unit}) *</label>
                <Input
                  type='number'
                  placeholder='50'
                  value={restockAmount}
                  onChange={(e) => setRestockAmount(e.target.value)}
                  required
                />
              </div>

              <DialogFooter className='pt-2'>
                <Button type='button' variant='outline' onClick={() => setRestockMaterial(null)}>
                  Bekor qilish
                </Button>
                <Button type='submit' disabled={restockMutation.isPending}>
                  {restockMutation.isPending ? 'Saqlanmoqda...' : 'Zaxiraga Qo’shish'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </Main>
    </>
  )
}
