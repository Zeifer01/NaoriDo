"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/fetcher";

export interface MaterialExpense {
  id: string;
  category: string;
  description: string;
  amount: number;
  vendor: string | null;
  notes: string | null;
  receipt_url: string | null;
  expense_date: string;
  created_at: string;
}

export interface ExpensesData {
  expenses: MaterialExpense[];
  summary: { totalExpenses: number; totalAmount: number };
  categoryBreakdown: { category: string; amount: number }[];
}

export interface ExpenseFilters {
  startDate?: string;
  endDate?: string;
  category?: string;
}

function toQs(filters: ExpenseFilters): string {
  const q = new URLSearchParams();
  if (filters.startDate) q.set("startDate", filters.startDate);
  if (filters.endDate) q.set("endDate", filters.endDate);
  if (filters.category) q.set("category", filters.category);
  return q.toString();
}

export function useExpenses(filters: ExpenseFilters = {}) {
  const qs = toQs(filters);
  return useQuery({
    queryKey: ["expenses", filters],
    queryFn: () => apiFetch<ExpensesData>(`/api/expenses${qs ? `?${qs}` : ""}`),
  });
}

export interface ExpenseInput {
  category: string;
  description: string;
  amount: number;
  vendor?: string;
  notes?: string;
  receiptUrl?: string;
  expenseDate?: string;
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ExpenseInput) =>
      apiFetch("/api/expenses", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
  });
}

export function useUpdateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ExpenseInput> }) =>
      apiFetch(`/api/expenses/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/expenses/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
  });
}
