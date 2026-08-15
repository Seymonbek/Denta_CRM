import { createFileRoute } from '@tanstack/react-router'
import { PayrollFeature } from '@/features/payroll'

export const Route = createFileRoute('/_authenticated/payroll')({
  component: PayrollFeature,
})
