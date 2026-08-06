import { createFileRoute } from '@tanstack/react-router'
import { DoctorsList } from '@/features/doctors'

export const Route = createFileRoute('/_authenticated/doctors/')({
  component: DoctorsList,
})
