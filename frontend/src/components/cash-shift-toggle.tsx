import { useState } from 'react'
import { api } from '@/api/client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Briefcase, Play, Square } from 'lucide-react'

// Basic fetcher for open shift
export const useOpenCashShift = () => {
  return useQuery({
    queryKey: ['cash-shifts', 'open'],
    queryFn: async () => {
      const res = await api.get('/api/v1/payments/cash-shifts/?status=open')
      // return the first open shift for the current user
      return res.data.results?.[0] || null
    },
  })
}

export function CashShiftToggle() {
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()
  const { data: openShift, isLoading } = useOpenCashShift()

  const isCashier = user?.role === 'bosh_shifokor' || user?.role === 'administrator'

  const openShiftMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/api/v1/payments/cash-shifts/', {})
      return res.data
    },
    onSuccess: () => {
      toast.success("Kassa smenasi ochildi!")
      queryClient.invalidateQueries({ queryKey: ['cash-shifts', 'open'] })
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || "Smena ochishda xatolik yuz berdi")
    }
  })

  const closeShiftMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/api/v1/payments/cash-shifts/${id}/close/`)
      return res.data
    },
    onSuccess: () => {
      toast.success("Kassa smenasi yopildi!")
      queryClient.invalidateQueries({ queryKey: ['cash-shifts', 'open'] })
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || "Smena yopishda xatolik yuz berdi")
    }
  })

  if (!isCashier) return null
  if (isLoading) return <div className="text-xs text-muted-foreground">Kassa yuklanmoqda...</div>

  if (openShift) {
    return (
      <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 px-3 py-1.5 rounded-md border border-emerald-200 dark:border-emerald-900/50">
        <Briefcase className="h-4 w-4" />
        <span className="text-xs font-semibold whitespace-nowrap">Smena: Ochiq</span>
        <Button 
          variant="outline" 
          size="sm" 
          className="h-6 text-[10px] ml-2 bg-white dark:bg-black hover:bg-emerald-100 dark:hover:bg-emerald-900"
          disabled={closeShiftMutation.isPending}
          onClick={() => closeShiftMutation.mutate(openShift.id)}
        >
          {closeShiftMutation.isPending ? "Yopilmoqda..." : "Yopish"}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 bg-destructive/10 text-destructive px-3 py-1.5 rounded-md border border-destructive/20">
      <Briefcase className="h-4 w-4" />
      <span className="text-xs font-semibold whitespace-nowrap">Smena: Yopiq</span>
      <Button 
        variant="default" 
        size="sm" 
        className="h-6 text-[10px] ml-2 shadow-sm"
        disabled={openShiftMutation.isPending}
        onClick={() => openShiftMutation.mutate()}
      >
        {openShiftMutation.isPending ? "Ochilmoqda..." : "Ochish"}
      </Button>
    </div>
  )
}
