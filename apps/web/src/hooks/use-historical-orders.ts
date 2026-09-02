"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/fetcher";

export interface HistoricalOrderRow {
  id: string;
  customer_name: string;
  phone: string | null;
  address: string | null;
  fulfillment: "pickup" | "delivery" | "unknown";
  items_text: string | null;
  total: number;
  payment_method: string | null;
  order_date: string;
}

export interface HistoricalOrdersSummary {
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
}

export interface HistoricalOrdersData {
  orders: HistoricalOrderRow[];
  summary: HistoricalOrdersSummary;
}

/** Reads the standalone `historical_orders` table (imported WhatsApp order history). */
export function useHistoricalOrders(year: number) {
  return useQuery({
    queryKey: ["reports", "historical", year],
    queryFn: () => apiFetch<HistoricalOrdersData>(`/api/reports/historical?year=${year}`),
  });
}
