import { createFileRoute } from '@tanstack/react-router'
import { RatingsList } from '@/features/ratings'

export const Route = createFileRoute('/_authenticated/ratings/')({
  component: RatingsList,
})
