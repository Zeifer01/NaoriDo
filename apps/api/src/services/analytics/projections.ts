import type { AnalyticsPeriod, AnalyticsScope } from "@restai/types";
import { loadDailySeries, loadOrderTotals } from "./sales.js";
import { parsePeriodEnd, toDateKey } from "./period.js";

export interface ProjectionHorizon {
  projectedRevenueCents: number;
  lowCents: number;
  highCents: number;
}

export interface ProjectionResult {
  /** Simple linear projection of monthly revenue for next N months. */
  nextMonths: Array<
    ProjectionHorizon & {
      month: string;
    }
  >;
  nextWeeks: Array<
    ProjectionHorizon & {
      weekStart: string;
    }
  >;
  nextYear: (ProjectionHorizon & { yearLabel: string }) | null;
  /** Trend from last 3 complete months (ratio). */
  monthlyTrendRatio: number | null;
  /** Average daily revenue in the lookback window. */
  avgDailyRevenueCents: number;
  lookbackDays: number;
  method: "linear_daily";
  disclaimer: string;
}

function band(base: number): ProjectionHorizon {
  return {
    projectedRevenueCents: base,
    lowCents: Math.round(base * 0.8),
    highCents: Math.round(base * 1.2),
  };
}

/**
 * Project next weeks / months / year from recent daily revenue (linear average).
 * Conservative band: ±20%.
 */
export async function getRevenueProjection(params: {
  scope: AnalyticsScope;
  /** Lookback end date (usually today / period end). */
  asOf?: string;
  lookbackDays?: number;
  monthsAhead?: number;
  weeksAhead?: number;
}): Promise<ProjectionResult> {
  const lookbackDays = params.lookbackDays ?? 90;
  const monthsAhead = params.monthsAhead ?? 3;
  const weeksAhead = params.weeksAhead ?? 4;
  const asOf = params.asOf ? parsePeriodEnd(params.asOf, params.scope.timezone) : new Date();
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
      ...band(base),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  // Next weeks: start from Monday after asOf (or next calendar week)
  const nextWeeks: ProjectionResult["nextWeeks"] = [];
  const weekCursor = new Date(asOf);
  weekCursor.setHours(0, 0, 0, 0);
  // Advance to next Monday
  const day = weekCursor.getDay(); // 0 Sun … 6 Sat
  const daysUntilMon = day === 0 ? 1 : day === 1 ? 7 : 8 - day;
  weekCursor.setDate(weekCursor.getDate() + daysUntilMon);
  for (let i = 0; i < weeksAhead; i++) {
    // Weekly growth ≈ monthly^(1/4) ≈ mild; use monthly growth diluted
    const weekGrowth = Math.pow(growthFactor, i / 4);
    const base = Math.round(avgDaily * 7 * weekGrowth);
    nextWeeks.push({
      weekStart: toDateKey(weekCursor),
      ...band(base),
    });
    weekCursor.setDate(weekCursor.getDate() + 7);
  }

  // Annual: sum of next 12 months with same growth curve
  let yearTotal = 0;
  const yearCursor = new Date(asOf.getFullYear(), asOf.getMonth() + 1, 1);
  for (let i = 0; i < 12; i++) {
    const y = yearCursor.getFullYear();
    const m = yearCursor.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    yearTotal += Math.round(avgDaily * daysInMonth * Math.pow(growthFactor, i));
    yearCursor.setMonth(yearCursor.getMonth() + 1);
  }
  const endYear = new Date(asOf.getFullYear(), asOf.getMonth() + 12, 1);
  const nextYear: ProjectionResult["nextYear"] =
    avgDaily > 0
      ? {
          yearLabel: `${toDateKey(new Date(asOf.getFullYear(), asOf.getMonth() + 1, 1)).slice(0, 7)} → ${toDateKey(new Date(endYear.getFullYear(), endYear.getMonth(), 0)).slice(0, 7)}`,
          ...band(yearTotal),
        }
      : null;

  return {
    nextMonths,
    nextWeeks,
    nextYear,
    monthlyTrendRatio,
    avgDailyRevenueCents: avgDaily,
    lookbackDays,
    method: "linear_daily",
    disclaimer:
      "Projeção linear com base na média diária recente e tendência mensal (semana / mês / 12 meses). Não considera sazonalidade externa, promoções ou eventos.",
  };
}
