import { createFileRoute } from '@tanstack/react-router'
import { AuditLogFeature } from '@/features/audit-log'

export const Route = createFileRoute('/_authenticated/audit-log')({
  component: AuditLogFeature,
})
