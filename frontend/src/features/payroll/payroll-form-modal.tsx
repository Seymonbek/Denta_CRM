import React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePaySalary } from '@/api/hooks/use-payroll'
import { useOpenCashShift } from '@/api/hooks/use-cash-shifts'

const salarySchema = z.object({
  amount: z.coerce.number().min(1, "Summa musbat bo'lishi kerak"),
  method: z.string().min(1, 'To`lov usulini tanlang'),
  shift_id: z.coerce.number().min(1, 'Kassa smenasini tanlang'),
  notes: z.string().optional(),
})

type SalaryFormValues = z.infer<typeof salarySchema>

interface PayrollFormModalProps {
  isOpen: boolean
  onClose: () => void
  doctor: { id: string; firstName: string; lastName: string; balance: number } | null
}

export function PayrollFormModal({
  isOpen,
  onClose,
  doctor,
}: PayrollFormModalProps) {
  const { mutate: paySalary, isPending } = usePaySalary()
  const { data: openShift } = useOpenCashShift()

  const form = useForm<SalaryFormValues>({
    resolver: zodResolver(salarySchema) as any,
    defaultValues: {
      amount: 0,
      method: 'cash',
      shift_id: openShift ? parseInt(openShift.id) : 0,
      notes: '',
    },
  })

  // Reset form when doctor changes or modal opens
  React.useEffect(() => {
    if (isOpen && doctor) {
      form.reset({
        amount: Math.max(0, doctor.balance), // Suggest paying the full balance
        method: 'cash',
        shift_id: openShift ? parseInt(openShift.id) : 0,
        notes: '',
      })
    }
  }, [isOpen, doctor, form, openShift])

  const onSubmit = (data: SalaryFormValues) => {
    if (!doctor) return

    paySalary(
      {
        doctorId: doctor.id,
        ...data,
      },
      {
        onSuccess: () => {
          onClose()
        },
      }
    )
  }

  if (!doctor) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Maosh to'lash: {doctor.firstName} {doctor.lastName}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Summa (so'm)</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="method"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>To'lov usuli</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Usulni tanlang" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="cash">Naqd</SelectItem>
                      <SelectItem value="card">Karta</SelectItem>
                      <SelectItem value="transfer">O'tkazma</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="shift_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Kassa Smenasi</FormLabel>
                  <Select
                    onValueChange={(val) => field.onChange(parseInt(val))}
                    value={field.value ? field.value.toString() : ''}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Smenani tanlang" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {openShift && (
                        <SelectItem value={openShift.id.toString()}>
                          ID: {openShift.id} ({openShift.admin_name})
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Izoh</FormLabel>
                  <FormControl>
                    <Input placeholder="Masalan: Avgust oyi uchun" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end space-x-2 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Bekor qilish
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saqlanmoqda..." : "To'lash"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
