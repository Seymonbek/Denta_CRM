import { createFileRoute } from '@tanstack/react-router'
import { NotificationsList } from '@/features/notifications'

export const Route = createFileRoute('/_authenticated/notifications/')({
  component: NotificationsList,
})
