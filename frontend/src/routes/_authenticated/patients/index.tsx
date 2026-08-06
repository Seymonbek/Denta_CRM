import { createFileRoute } from '@tanstack/react-router'
import { PatientsList } from '@/features/patients'

export const Route = createFileRoute('/_authenticated/patients/')({
  component: PatientsList,
})
