import { createFileRoute } from '@tanstack/react-router'
import { ApprovalsFeature } from '@/features/approvals'

export const Route = createFileRoute('/_authenticated/approvals')({
  component: ApprovalsFeature,
})
