import type { AnalyticsMetric, AnalyticsPeriod } from "@restai/types";

const WEEKDAY_LABELS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

export function weekdayLabel(weekday: number): string {
  return WEEKDAY_LABELS[weekday] ?? String(weekday);
}

/** Parse YYYY-MM-DD (or ISO) into start-of-day UTC Date for range filters. */
export function parsePeriodStart(isoDate: string): Date {
  const d = new Date(isoDate.includes("T") ? isoDate : `${isoDate}T00:00:00.000Z`);
  return d;
}

/** End of day inclusive (23:59:59.999 UTC of the given calendar day). */
export function parsePeriodEnd(isoDate: string): Date {
  const d = new Date(isoDate.includes("T") ? isoDate : `${isoDate}T23:59:59.999Z`);
  return d;
}

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Previous period of the same length immediately before `period`. */
export function previousPeriodOfSameLength(period: AnalyticsPeriod): AnalyticsPeriod {
  const start = parsePeriodStart(period.start);
  const end = parsePeriodEnd(period.end);
  const lengthMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - lengthMs);
  return {
    start: toDateKey(prevStart),
    end: toDateKey(prevEnd),
  };
}

export function changeRatio(current: number, previous: number | undefined | null): number | null {
  if (previous === undefined || previous === null) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / Math.abs(previous);
}

export function metric(
  id: string,
  label: string,
  value: number,
  unit: AnalyticsMetric["unit"],
  previousValue?: number,
): AnalyticsMetric {
  return {
    id,
    label,
    value,
    unit,
    previousValue,
    changeRatio: changeRatio(value, previousValue),
  };
}

export function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000)));
}

/** Quintile score 1–5 (5 = best). Higher raw is better unless `invert`. */
export function quintileScore(values: number[], value: number, invert = false): number {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = sorted.findIndex((v) => v >= value);
  const idx = rank === -1 ? sorted.length - 1 : rank;
  const pct = sorted.length === 1 ? 1 : idx / (sorted.length - 1);
  const score = Math.min(5, Math.max(1, Math.ceil(pct * 5)));
  return invert ? 6 - score : score;
}

export function formatRatioPercent(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined) return "—";
  const pct = ratio * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}
