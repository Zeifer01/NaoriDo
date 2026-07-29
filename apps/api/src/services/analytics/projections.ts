import type { AnalyticsPeriod, AnalyticsScope } from "@restai/types";
import { loadDailySeries, loadOrderTotals } from "./sales.js";
import { parsePeriodEnd, toDateKey } from "./period.js";

export interface ProjectionResult {
  /** Simple linear projection of monthly revenue for next N months. */
  nextMonths: Array<{
    month: string;
    projectedRevenueCents: number;
    lowCents: number;
    highCents: number;
  }>;
  /** Trend from last 3 complete months (ratio). */
  monthlyTrendRatio: number | null;
  /** Average daily revenue in the lookback window. */
  avgDailyRevenueCents: number;
  lookbackDays: number;
  method: "linear_daily";
  disclaimer: string;
}

/**
 * Project next months from recent daily revenue (linear average × days in month).
 * Conservative band: ±20%.
 */
export async function getRevenueProjection(params: {
  scope: AnalyticsScope;
  /** Lookback end date (usually today / period end). */
  asOf?: string;
  lookbackDays?: number;
  monthsAhead?: number;
}): Promise<ProjectionResult> {
  const lookbackDays = params.lookbackDays ?? 90;
  const monthsAhead = params.monthsAhead ?? 3;
  const asOf = params.asOf ? parsePeriodEnd(params.asOf) : new Date();
  const start = new Date(asOf.getTime() - (lookbackDays - 1) * 24 * 60 * 60 * 1000);

  const period: AnalyticsPeriod = {
    start: toDateKey(start),
    end: toDateKey(asOf),
  };

  const [totals, series] = await Promise.all([
    loadOrderTotals(params.scope, period),
    loadDailySeries(params.scope, period),
  ]);

  const avgDaily =
    lookbackDays > 0 ? Math.round(totals.totalRevenue / lookbackDays) : 0;

  // Month-over-month trend from last 3 calendar months in series
  const byMonth = new Map<string, number>();
  for (const p of series) {
    const m = p.date.slice(0, 7);
    byMonth.set(m, (byMonth.get(m) ?? 0) + p.revenueCents);
  }
  const months = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  let monthlyTrendRatio: number | null = null;
  if (months.length >= 2) {
    const prev = months[months.length - 2][1];
    const last = months[months.length - 1][1];
    monthlyTrendRatio = prev === 0 ? null : (last - prev) / Math.abs(prev);
  }

  const growthFactor =
    monthlyTrendRatio === null
      ? 1
      : Math.min(1.25, Math.max(0.75, 1 + monthlyTrendRatio));

  const nextMonths: ProjectionResult["nextMonths"] = [];
  const cursor = new Date(asOf.getFullYear(), asOf.getMonth() + 1, 1);
  for (let i = 0; i < monthsAhead; i++) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const base = Math.round(avgDaily * daysInMonth * Math.pow(growthFactor, i));
    nextMonths.push({
      month: `${y}-${String(m + 1).padStart(2, "0")}`,
      projectedRevenueCents: base,
      lowCents: Math.round(base * 0.8),
      highCents: Math.round(base * 1.2),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return {
    nextMonths,
    monthlyTrendRatio,
    avgDailyRevenueCents: avgDaily,
    lookbackDays,
    method: "linear_daily",
    disclaimer:
      "Projeção linear com base na média diária recente e tendência mensal. Não considera sazonalidade externa, promoções ou eventos.",
  };
}
