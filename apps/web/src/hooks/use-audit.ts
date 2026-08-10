"use client";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/fetcher";

export interface OrderDeletionLogEntry {
  id: string;
  orderNumber: string;
  orderTotal: number;
  orderStatus: string;
  customerName: string | null;
  orderCreatedAt: string;
  deletedByName: string;
  deletedAt: string;
  branchId: string;
  branchName: string | null;
}

export function useOrderDeletionLog(branchId?: string) {
  return useQuery({
    queryKey: ["audit", "order-deletions", branchId],
    queryFn: () =>
      apiFetch<OrderDeletionLogEntry[]>(
        `/api/audit/order-deletions${branchId ? `?branchId=${branchId}` : ""}`,
        { includeBranchHeader: false },
      ),
  });
}
