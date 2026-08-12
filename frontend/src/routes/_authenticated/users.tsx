import { createFileRoute } from '@tanstack/react-router'
import { UsersFeature } from '@/features/users'

export const Route = createFileRoute('/_authenticated/users')({
  component: UsersFeature,
})
