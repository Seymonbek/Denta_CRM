import { createFileRoute } from '@tanstack/react-router'
import { DepartmentsList } from '@/features/departments'

export const Route = createFileRoute('/_authenticated/departments/')({
  component: DepartmentsList,
})
