import { createFileRoute, redirect } from '@tanstack/react-router'
import { ExpensesPage } from '@/features/expenses'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/_authenticated/expenses')({
  beforeLoad: () => {
    const user = useAuthStore.getState().user
    if (user?.role !== 'bosh_shifokor') {
      throw redirect({ to: '/' })
    }
  },
  component: ExpensesPage,
})
