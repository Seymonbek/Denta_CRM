import { createFileRoute } from '@tanstack/react-router'
import { AppointmentsList } from '@/features/appointments'

export const Route = createFileRoute('/_authenticated/appointments/')({
  component: AppointmentsList,
})
