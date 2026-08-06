import { createFileRoute } from '@tanstack/react-router'
import { PaymentsList } from '@/features/payments'

export const Route = createFileRoute('/_authenticated/payments/')({
  component: PaymentsList,
})
