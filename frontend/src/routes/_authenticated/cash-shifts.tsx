import { createFileRoute } from '@tanstack/react-router'
import { CashShiftsFeature } from '@/features/cash-shifts'

export const Route = createFileRoute('/_authenticated/cash-shifts')({
  component: CashShiftsFeature,
})
