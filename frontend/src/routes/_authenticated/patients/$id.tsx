import { createFileRoute } from '@tanstack/react-router'
import { PatientDetail } from '@/features/patients/patient-detail'

export const Route = createFileRoute('/_authenticated/patients/$id')({
  component: PatientDetail,
})
