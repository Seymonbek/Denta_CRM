import { createFileRoute } from '@tanstack/react-router'
import { PublicReviewPage } from '@/features/ratings/public-review'

export const Route = createFileRoute('/feedback')({
  component: PublicReviewPage,
})
