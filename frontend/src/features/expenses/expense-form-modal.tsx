import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useExpenseCategories, useCreateExpense } from '@/api/hooks/use-expenses'
import { toast } from 'sonner'
import { RefreshCw } from 'lucide-react'

export function ExpenseFormModal({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')

  const { data: categories } = useExpenseCategories()
  const createMutation = useCreateExpense()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!category || !amount) {
      toast.error('Toifa va summani kiriting!')
      return
    }

    try {
      await createMutation.mutateAsync({
        category,
        amount,
        description,
        payment_method: paymentMethod,
      })
      toast.success('Xarajat kiritildi!')
      onOpenChange(false)
    } catch (_err) {
      // error handled in hook
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Yangi Xarajat</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">Toifa *</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Toifani tanlang" />
              </SelectTrigger>
              <SelectContent>
                {categories?.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-1">
            <label className="text-sm font-medium">Summa *</label>
            <Input 
              type="number" 
              placeholder="Masalan: 500000" 
              value={amount} 
              onChange={e => setAmount(e.target.value)} 
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">To'lov Usuli *</label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger>
                <SelectValue placeholder="To'lov usuli" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Naqd</SelectItem>
                <SelectItem value="card">Karta / Plastik</SelectItem>
                <SelectItem value="payme">Payme</SelectItem>
                <SelectItem value="click">Click</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Izoh</label>
            <Input 
              placeholder="Qisqacha ma'lumot (ixtiyoriy)" 
              value={description} 
              onChange={e => setDescription(e.target.value)} 
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Bekor qilish</Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
              Saqlash
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
