"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/fetcher";

export function useInventoryItems() {
  return useQuery({
    queryKey: ["inventory", "items"],
    queryFn: () => apiFetch("/api/inventory/items"),
  });
}

export function useCreateInventoryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      apiFetch("/api/inventory/items", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory"] }),
  });
}

export function useUpdateInventoryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiFetch(`/api/inventory/items/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory"] }),
  });
}

export function useDeleteInventoryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/inventory/items/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory"] }),
  });
}

export function useCreateMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      apiFetch("/api/inventory/movements", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory"] }),
  });
}

export function useInventoryMovements(itemId?: string) {
  return useQuery({
    queryKey: ["inventory", "movements", itemId],
    queryFn: () =>
      apiFetch(`/api/inventory/movements${itemId ? `?itemId=${itemId}` : ""}`),
  });
}

export function useInventoryAlerts() {
  return useQuery({
    queryKey: ["inventory", "alerts"],
    queryFn: () => apiFetch("/api/inventory/alerts"),
  });
}

export function useInventoryProjection() {
  return useQuery({
    queryKey: ["inventory", "projection"],
    queryFn: () => apiFetch("/api/inventory/projection"),
  });
}

export function useProductLinks() {
  return useQuery({
    queryKey: ["inventory", "product-links"],
    queryFn: () => apiFetch("/api/inventory/product-links"),
  });
}

export function useSaveProductLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      menuItemId: string;
      inventoryItemId: string;
      quantityPerUnit: number;
    }) =>
      apiFetch("/api/inventory/product-links", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory"] }),
  });
}

export function useDeleteProductLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (menuItemId: string) =>
      apiFetch(`/api/inventory/product-links/${menuItemId}`, {
        method: "DELETE",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory"] }),
  });
}
