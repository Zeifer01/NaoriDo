"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/fetcher";
import { useAuthStore } from "@/stores/auth-store";

interface OrderFilters {
  status?: string;
  page?: number;
  limit?: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface OrdersResponse {
  orders: any[];
  pagination: Pagination;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

async function fetchOrdersWithPagination(path: string): Promise<OrdersResponse> {
  const { accessToken, selectedBranchId } = useAuthStore.getState();
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(selectedBranchId ? { "x-branch-id": selectedBranchId } : {}),
    },
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || "Erro desconhecido");
  return {
    orders: json.data ?? [],
    pagination: json.pagination ?? { page: 1, limit: 20, total: 0, totalPages: 1 },
  };
}

export function useOrders(filters?: OrderFilters) {
  const params = new URLSearchParams();
  if (filters?.status && filters.status !== "all") params.set("status", filters.status);
  if (filters?.page) params.set("page", String(filters.page));
  if (filters?.limit) params.set("limit", String(filters.limit));
  const qs = params.toString();

  return useQuery<OrdersResponse>({
    queryKey: ["orders", filters],
    queryFn: () => fetchOrdersWithPagination(`/api/orders${qs ? `?${qs}` : ""}`),
    refetchInterval: 5000,
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: ["orders", id],
    queryFn: () => apiFetch(`/api/orders/${id}`),
    enabled: !!id,
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      apiFetch("/api/orders", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] }),
  });
}

export function useUpdateOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiFetch(`/api/orders/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["kitchen"] });
    },
  });
}

export function useUpdateOrderItemStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      orderId,
      itemId,
      status,
    }: {
      orderId: string;
      itemId: string;
      status: string;
    }) =>
      apiFetch(`/api/orders/${orderId}/items/${itemId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] }),
  });
}

export function useAddOrderItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      orderId,
      menuItemId,
      quantity,
      notes,
      modifiers = [],
    }: {
      orderId: string;
      menuItemId: string;
      quantity: number;
      notes?: string;
      modifiers?: Array<{ modifierId: string }>;
    }) =>
      apiFetch(`/api/orders/${orderId}/items`, {
        method: "POST",
        body: JSON.stringify({ menuItemId, quantity, notes, modifiers }),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["orders", vars.orderId] });
      qc.invalidateQueries({ queryKey: ["kitchen"] });
    },
  });
}

export function useUpdateOrderItemDetails() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      orderId,
      itemId,
      quantity,
      notes,
    }: {
      orderId: string;
      itemId: string;
      quantity?: number;
      notes?: string | null;
    }) =>
      apiFetch(`/api/orders/${orderId}/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify({ quantity, notes }),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["orders", vars.orderId] });
      qc.invalidateQueries({ queryKey: ["kitchen"] });
    },
  });
}

export function useRemoveOrderItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, itemId }: { orderId: string; itemId: string }) =>
      apiFetch(`/api/orders/${orderId}/items/${itemId}`, { method: "DELETE" }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["orders", vars.orderId] });
      qc.invalidateQueries({ queryKey: ["kitchen"] });
    },
  });
}

export function useDeleteOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/orders/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["kitchen"] });
    },
  });
}

export function useResetOrderSequence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ deletedCount: number; nextOrderNumber: number }>("/api/orders/reset-sequence", {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["kitchen"] });
    },
  });
}
