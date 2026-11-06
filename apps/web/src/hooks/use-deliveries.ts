"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/fetcher";

export type DeliveryStopReason = "overdue" | "late_risk" | "route" | "unlocated";

export interface DeliveryStop {
  orderId: string;
  orderNumber: string;
  status: string;
  customerName: string | null;
  phone: string | null;
  address: string | null;
  reference: string | null;
  city: string | null;
  notes: string | null;
  paymentMethod: string | null;
  totalCents: number;
  /** Cash the driver must collect (0 = already paid or unknown). */
  collectCents: number;
  createdAt: string;
  waitMinutes: number;
}

export interface MyDeliveryStop extends DeliveryStop {
  position: number;
  located: boolean;
  etaMinutes: number | null;
  waitAtArrival: number;
  reason: DeliveryStopReason;
  reasonText: string;
}

export interface OtherDeliveryStop {
  orderId: string;
  orderNumber: string;
  city: string | null;
  address: string | null;
  waitMinutes: number;
  driverId: string;
  driverName: string;
  position: number;
}

export interface DeliveryDayRow {
  driverId: string;
  driverName: string;
  deliveries: number;
  cashCollectedCents: number;
  tips: Record<string, number>;
  tipsTotalCents: number;
}

export interface DeliveryBoard {
  settings: { waitLimitMinutes: number };
  me: { id: string; canDrive: boolean; canManage: boolean };
  queue: DeliveryStop[];
  waiting: DeliveryStop[];
  mine: MyDeliveryStop[];
  suggestionDiffers: boolean;
  others: OtherDeliveryStop[];
  today: DeliveryDayRow[];
  hasOrigin: boolean;
}

export interface DeliveryDriver {
  id: string;
  name: string;
  role: string;
}

export type TipMethod = "cash" | "card" | "zelle" | "venmo" | "cashapp";

const KEY = ["deliveries"] as const;

export function useDeliveryBoard() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => apiFetch<DeliveryBoard>("/api/deliveries"),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
}

export function useDeliveryDrivers(enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, "drivers"],
    queryFn: () => apiFetch<DeliveryDriver[]>("/api/deliveries/drivers"),
    enabled,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: KEY });
    qc.invalidateQueries({ queryKey: ["orders"] });
    qc.invalidateQueries({ queryKey: ["kitchen"] });
  };
}

export function useClaimDeliveries() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { orderIds: string[]; driverUserId?: string; lat?: number; lng?: number }) =>
      apiFetch<{ claimed: number; unavailable: number }>("/api/deliveries/claim", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

export function useReorderDeliveries() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (orderIds: string[]) =>
      apiFetch("/api/deliveries/reorder", { method: "POST", body: JSON.stringify({ orderIds }) }),
    onSuccess: invalidate,
  });
}

export function useReplanDeliveries() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (pos?: { lat: number; lng: number }) =>
      apiFetch("/api/deliveries/replan", { method: "POST", body: JSON.stringify(pos ?? {}) }),
    onSuccess: invalidate,
  });
}

export function useReleaseDelivery() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (orderId: string) => apiFetch(`/api/deliveries/${orderId}/release`, { method: "POST" }),
    onSuccess: invalidate,
  });
}

export function useMarkDelivered() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { orderId: string; cashCollected: boolean; tipCents: number; tipMethod?: TipMethod }) =>
      apiFetch(`/api/deliveries/${input.orderId}/delivered`, {
        method: "POST",
        body: JSON.stringify({
          cashCollected: input.cashCollected,
          tipCents: input.tipCents,
          ...(input.tipCents > 0 ? { tipMethod: input.tipMethod ?? "cash" } : {}),
        }),
      }),
    onSuccess: invalidate,
  });
}

/** "Saiu / Pronto" — same status change the kitchen board uses (order → ready). */
export function useMarkOrderReady() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (orderId: string) =>
      apiFetch(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "ready" }),
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateDeliverySettings() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (waitLimitMinutes: number) =>
      apiFetch("/api/deliveries/settings", { method: "PATCH", body: JSON.stringify({ waitLimitMinutes }) }),
    onSuccess: invalidate,
  });
}

// ── Relatórios > Entregadores ─────────────────────────────────────

export interface DeliverySummary {
  deliveries: number;
  valueCents: number;
  feeCents: number;
  avgTicketCents: number;
  avgTotalMinutes: number | null;
  medianTotalMinutes: number | null;
  avgToPickupMinutes: number | null;
  avgOnRoadMinutes: number | null;
  withinLimitPct: number | null;
  timeExcluded: number;
  cashCollectedCents: number;
  tipsCents: number;
  tippedPct: number;
  avgTipCents: number;
}

export interface DriverReportStats extends DeliverySummary {
  driverId: string;
  driverName: string;
  tipsByMethod: Record<string, number>;
}

export interface DeliveryReport {
  period: { start: string; end: string };
  limitMinutes: number;
  summary: DeliverySummary;
  previous: DeliverySummary | null;
  drivers: DriverReportStats[];
  daily: Array<{ date: string; total: number } & Record<string, number | string>>;
  byHour: Array<{ hour: string; deliveries: number }>;
  byWeekday: Array<{ label: string; deliveries: number }>;
  byCity: Array<{ city: string; deliveries: number; valueCents: number; avgMinutes: number | null }>;
  tipsByMethod: Record<string, number>;
  slowest: Array<{
    orderNumber: string;
    driverName: string;
    address: string | null;
    city: string | null;
    totalMinutes: number;
    date: string;
  }>;
}

export function useDeliveryReport(params: { startDate: string; endDate: string; orgWide?: boolean } | null) {
  return useQuery({
    queryKey: ["deliveries", "report", params],
    queryFn: () => {
      const q = new URLSearchParams({ startDate: params!.startDate, endDate: params!.endDate });
      if (params!.orgWide) q.set("orgWide", "true");
      return apiFetch<DeliveryReport>(`/api/deliveries/report?${q.toString()}`);
    },
    enabled: !!params?.startDate && !!params?.endDate,
  });
}
