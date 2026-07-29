"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/fetcher";
import type {
  CustomerAnalytics,
  ExecutiveHubAnalytics,
  FinanceAnalytics,
  ProductAnalytics,
} from "@restai/types";

export interface AnalyticsDateParams {
  startDate: string;
  endDate: string;
  compareStartDate?: string;
  compareEndDate?: string;
  orgWide?: boolean;
}

function toQs(params: AnalyticsDateParams): string {
  const q = new URLSearchParams();
  q.set("startDate", params.startDate);
  q.set("endDate", params.endDate);
  if (params.compareStartDate) q.set("compareStartDate", params.compareStartDate);
  if (params.compareEndDate) q.set("compareEndDate", params.compareEndDate);
  if (params.orgWide) q.set("orgWide", "true");
  return q.toString();
}

export function useExecutiveHub(params: AnalyticsDateParams | null) {
  return useQuery({
    queryKey: ["analytics", "hub", params],
    queryFn: () =>
      apiFetch<ExecutiveHubAnalytics>(`/api/analytics/hub?${toQs(params!)}`),
    enabled: !!params?.startDate && !!params?.endDate,
  });
}

export function useCustomerAnalytics(params: AnalyticsDateParams | null) {
  return useQuery({
    queryKey: ["analytics", "customers", params],
    queryFn: () =>
      apiFetch<CustomerAnalytics>(
        `/api/analytics/customers?${toQs({ ...params!, orgWide: params?.orgWide ?? true })}`,
      ),
    enabled: !!params?.startDate && !!params?.endDate,
  });
}

export function useFinanceAnalytics(params: AnalyticsDateParams | null) {
  return useQuery({
    queryKey: ["analytics", "finance", params],
    queryFn: () =>
      apiFetch<FinanceAnalytics>(`/api/analytics/finance?${toQs(params!)}`),
    enabled: !!params?.startDate && !!params?.endDate,
  });
}

export function useProductAnalytics(params: AnalyticsDateParams | null) {
  return useQuery({
    queryKey: ["analytics", "products", params],
    queryFn: () =>
      apiFetch<ProductAnalytics>(`/api/analytics/products?${toQs(params!)}`),
    enabled: !!params?.startDate && !!params?.endDate,
  });
}
