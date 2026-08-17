import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
import { useMaterials, useProcedureBOMs, useCreateProcedureBOM, useDeleteProcedureBOM } from '@/api/hooks/use-inventory'
import { useProcedureTypes } from '@/api/hooks/use-procedure-types'

export function ProcedureBOMsTab() {
  const [selectedProcedure, setSelectedProcedure] = useState<string>('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  
  // Form state
  const [selectedMaterial, setSelectedMaterial] = useState<string>('')
  const [quantity, setQuantity] = useState('')

  const { data: proceduresData = [] } = useProcedureTypes()
  const procedures = Array.isArray(proceduresData) ? proceduresData : []

  const { data: boms = [], isLoading } = useProcedureBOMs(selectedProcedure ? { procedure_type: selectedProcedure } : undefined)
  const { data: materialsData = [] } = useMaterials()
  const materials = Array.isArray(materialsData) ? materialsData : []

  const createBOM = useCreateProcedureBOM()
  const deleteBOM = useDeleteProcedureBOM()

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedProcedure || !selectedMaterial || !quantity) return
    
    createBOM.mutate({
      procedureType: selectedProcedure,
      material: selectedMaterial,
      defaultQuantity: quantity,
    }, {
      onSuccess: () => {
        setIsModalOpen(false)
        setSelectedMaterial('')
        setQuantity('')
      }
    })
  }

  const handleDelete = (id: string) => {
    if (confirm("Rostdan ham ushbu materialni texkartadan o'chirmoqchimisiz?")) {
      deleteBOM.mutate(id)
    }
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center gap-4">
        <div className="w-[300px]">
          <Select value={selectedProcedure} onValueChange={setSelectedProcedure}>
            <SelectTrigger>
              <SelectValue placeholder="Muolaja turini tanlang..." />
            </SelectTrigger>
            <SelectContent>
              {procedures.map((p: any) => (
                <SelectItem key={String(p.id)} value={String(p.id)}>
                  {String(p.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <Button 
          disabled={!selectedProcedure} 
          onClick={() => setIsModalOpen(true)}
          className="ml-auto"
        >
          <Plus className="mr-2 h-4 w-4" /> Material qo'shish
        </Button>
      </div>

      <div className="rounded-md border bg-card text-card-foreground overflow-x-auto w-full">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Muolaja</TableHead>
              <TableHead>Material</TableHead>
              <TableHead>Standart Sarf (Texkarta)</TableHead>
              <TableHead className="w-[100px] text-right">Amallar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!selectedProcedure ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  Texkartani ko'rish uchun yuqoridan muolaja turini tanlang.
                </TableCell>
              </TableRow>
            ) : isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 animate-pulse">Yuklanmoqda...</TableCell>
              </TableRow>
            ) : boms.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  Bu muolajaga hali texkarta (materiallar) biriktirilmagan.
                </TableCell>
              </TableRow>
            ) : (
              boms.map((bom: any) => {
                const proc = procedures.find((p: any) => String(p.id) === String(bom.procedureType))
                return (
                  <TableRow key={String(bom.id)}>
                    <TableCell className="font-medium">{proc?.name || 'Muolaja'}</TableCell>
                    <TableCell>{bom.materialName || 'Material'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-sm">
                        {Number(bom.defaultQuantity || 0).toLocaleString()} {bom.materialUnit === 'piece' ? 'dona' : bom.materialUnit === 'gram' ? 'g' : 'ml'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(String(bom.id))} disabled={deleteBOM.isPending}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create BOM Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Texkartaga material qo'shish</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Material *</label>
              <Select value={selectedMaterial} onValueChange={setSelectedMaterial}>
                <SelectTrigger>
                  <SelectValue placeholder="Materialni tanlang" />
                </SelectTrigger>
                <SelectContent>
                  {materials.map((m: any) => (
                    <SelectItem key={String(m.id)} value={String(m.id)}>
                      {String(m.name)} ({Number(m.quantityInStock || 0)} qolgan)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Standart miqdor (qancha ketadi?) *</label>
              <Input
                type="number"
                step="0.01"
                placeholder="1.5"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                Bekor qilish
              </Button>
              <Button type="submit" disabled={createBOM.isPending}>
                {createBOM.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
