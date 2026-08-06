import { createFileRoute } from '@tanstack/react-router'
import { PrescriptionsList } from '@/features/prescriptions'

export const Route = createFileRoute('/_authenticated/prescriptions/')({
  component: PrescriptionsList,
})
