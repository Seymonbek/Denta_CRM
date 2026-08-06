import { createFileRoute } from '@tanstack/react-router'
import { ReportsList } from '@/features/reports'

export const Route = createFileRoute('/_authenticated/reports/')({
  component: ReportsList,
})
