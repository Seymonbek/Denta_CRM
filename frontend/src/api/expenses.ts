import { apiClient } from './client'
import { type PaginatedResponse, type PaymentMethod } from '@/types/api'

export interface ExpenseCategory {
  id: string
  name: string
  is_active: boolean
}

export interface Expense {
  id: string
  category: string
  category_name: string
  amount: string
  description: string
  date: string
  recorded_by: string
  recorded_by_name: string
  payment_method: PaymentMethod
  cash_shift: string | null
}

export async function getExpenseCategoriesApi(): Promise<ExpenseCategory[]> {
  const response = await apiClient.get<ExpenseCategory[]>('expense-categories/')
  return response.data
}

export async function createExpenseCategoryApi(data: { name: string; is_active?: boolean }): Promise<ExpenseCategory> {
  const response = await apiClient.post<ExpenseCategory>('expense-categories/', data)
  return response.data
}

export async function updateExpenseCategoryApi(id: string, data: { name: string; is_active?: boolean }): Promise<ExpenseCategory> {
  const response = await apiClient.patch<ExpenseCategory>(`expense-categories/${id}/`, data)
  return response.data
}

export async function deleteExpenseCategoryApi(id: string): Promise<void> {
  await apiClient.delete(`expense-categories/${id}/`)
}

export async function getExpensesApi(params?: {
  category?: string
  payment_method?: string
  cash_shift?: string
  page?: number
}): Promise<PaginatedResponse<Expense>> {
  const response = await apiClient.get<PaginatedResponse<Expense>>('expenses/', { params })
  return response.data
}

export async function createExpenseApi(data: {
  category: string
  amount: string
  description?: string
  payment_method: string
}): Promise<Expense> {
  const response = await apiClient.post<Expense>('expenses/', data)
  return response.data
}

export async function updateExpenseApi(id: string, data: Partial<Expense>): Promise<Expense> {
  const response = await apiClient.patch<Expense>(`expenses/${id}/`, data)
  return response.data
}

export async function deleteExpenseApi(id: string): Promise<void> {
  await apiClient.delete(`expenses/${id}/`)
}
