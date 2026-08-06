import { createLazyFileRoute } from '@tanstack/react-router'
import { AIAssistantPage } from '@/features/ai-assistant'

export const Route = createLazyFileRoute('/_authenticated/ai-assistant/')({
  component: AIAssistantPage,
})
