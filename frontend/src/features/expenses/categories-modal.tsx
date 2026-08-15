import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useExpenseCategories, useCreateExpenseCategory, useDeleteExpenseCategory } from '@/api/hooks/use-expenses'
import { toast } from 'sonner'
import { Plus, Trash2, RefreshCw } from 'lucide-react'

export function CategoriesModal({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  const [newCategory, setNewCategory] = useState('')
  const { data: categories, isLoading } = useExpenseCategories()
  const createMutation = useCreateExpenseCategory()
  const deleteMutation = useDeleteExpenseCategory()

  const handleAdd = async () => {
    if (!newCategory.trim()) return
    try {
      await createMutation.mutateAsync({ name: newCategory.trim(), is_active: true })
      setNewCategory('')
      toast.success('Toifa qo\'shildi')
    } catch (_err) {
      // handled
    }
  }

  const handleDelete = (id: string) => {
    if (confirm('Ushbu toifani o\'chirishni istaysizmi?')) {
      deleteMutation.mutate(id)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xarajat Toifalari</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex gap-2">
            <Input 
              placeholder="Yangi toifa nomi..." 
              value={newCategory} 
              onChange={e => setNewCategory(e.target.value)} 
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
            <Button onClick={handleAdd} disabled={createMutation.isPending || !newCategory.trim()}>
              {createMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </Button>
          </div>

          <div className="border rounded-md divide-y max-h-[300px] overflow-y-auto">
            {isLoading && <div className="p-3 text-center text-muted-foreground text-sm">Yuklanmoqda...</div>}
            {!isLoading && categories?.length === 0 && (
              <div className="p-3 text-center text-muted-foreground text-sm">Toifalar yo'q.</div>
            )}
            {categories?.map((cat) => (
              <div key={cat.id} className="flex justify-between items-center p-3 text-sm">
                <span>{cat.name}</span>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(cat.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
