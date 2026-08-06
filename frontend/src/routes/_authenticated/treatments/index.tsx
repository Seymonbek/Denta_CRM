import { createFileRoute } from '@tanstack/react-router'
import { TreatmentsList } from '@/features/treatments'

export const Route = createFileRoute('/_authenticated/treatments/')({
  component: TreatmentsList,
})
