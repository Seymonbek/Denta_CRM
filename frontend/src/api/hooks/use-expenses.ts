import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
 getExpenseCategoriesApi,
 createExpenseCategoryApi,
 updateExpenseCategoryApi,
 deleteExpenseCategoryApi,
 getExpensesApi,
 createExpenseApi,
 updateExpenseApi,
 deleteExpenseApi,
 type Expense
} from '../expenses'
import { toast } from 'sonner'

export function useExpenseCategories() {
 return useQuery({
  queryKey: ['expense-categories'],
  queryFn: getExpenseCategoriesApi,
 })
}

export function useCreateExpenseCategory() {
 const queryClient = useQueryClient()
 return useMutation({
  mutationFn: createExpenseCategoryApi,
  onSuccess: () => {
   queryClient.invalidateQueries({ queryKey: ['expense-categories'] })
  },
  onError: (error: any) => {
   toast.error('Toifani yaratishda xatolik: ' + (error.response?.data?.detail || error.message))
  },
 })
}

export function useUpdateExpenseCategory() {
 const queryClient = useQueryClient()
 return useMutation({
  mutationFn: ({ id, data }: { id: string; data: { name: string; is_active?: boolean } }) =>
   updateExpenseCategoryApi(id, data),
  onSuccess: () => {
   queryClient.invalidateQueries({ queryKey: ['expense-categories'] })
  },
  onError: (error: any) => {
   toast.error('Toifani yangilashda xatolik: ' + (error.response?.data?.detail || error.message))
  },
 })
}

export function useDeleteExpenseCategory() {
 const queryClient = useQueryClient()
 return useMutation({
  mutationFn: deleteExpenseCategoryApi,
  onSuccess: () => {
   queryClient.invalidateQueries({ queryKey: ['expense-categories'] })
  },
  onError: (error: any) => {
   toast.error('Toifani o\'chirishda xatolik: ' + (error.response?.data?.detail || error.message))
  },
 })
}

export function useExpenses(params?: { category?: string; payment_method?: string; cash_shift?: string; page?: number }) {
 return useQuery({
  queryKey: ['expenses', params],
  queryFn: () => getExpensesApi(params),
 })
}

export function useCreateExpense() {
 const queryClient = useQueryClient()
 return useMutation({
  mutationFn: createExpenseApi,
  onSuccess: () => {
   queryClient.invalidateQueries({ queryKey: ['expenses'] })
   queryClient.invalidateQueries({ queryKey: ['cash-shifts'] })
  },
  onError: (error: any) => {
   toast.error('Xarajatni kiritishda xatolik: ' + (error?.response?.data?.detail || error?.message || ''))
  },
 })
}

export function useUpdateExpense() {
 const queryClient = useQueryClient()
 return useMutation({
  mutationFn: ({ id, data }: { id: string; data: Partial<Expense> }) => updateExpenseApi(id, data),
  onSuccess: () => {
   queryClient.invalidateQueries({ queryKey: ['expenses'] })
   queryClient.invalidateQueries({ queryKey: ['cash-shifts'] })
  },
  onError: (error: any) => {
   toast.error('Xarajatni yangilashda xatolik: ' + (error?.response?.data?.detail || error?.message || ''))
  },
 })
}

export function useDeleteExpense() {
 const queryClient = useQueryClient()
 return useMutation({
  mutationFn: deleteExpenseApi,
  onSuccess: () => {
   queryClient.invalidateQueries({ queryKey: ['expenses'] })
   queryClient.invalidateQueries({ queryKey: ['cash-shifts'] })
  },
  onError: (error: any) => {
   toast.error('Xarajatni o\'chirishda xatolik: ' + (error?.response?.data?.detail || error?.message || ''))
  },
 })
}
