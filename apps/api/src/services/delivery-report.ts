/**
 * "Entregadores" report (Relatórios, org flag `delivery_dispatch`): what each driver delivered,
 * how long customers waited, cash collected and tips. Built only from deliveries marked
 * "Entregue" on the Entregas screen (`delivery_assignments.delivered_at`).
 *
 * Pure functions (no DB) so the maths can be unit-tested; the route fetches the rows.
 */

export interface DeliveryReportRow {
  driverId: string;
  driverName: string;
  orderId: string;
  orderNumber: string;
  orderCreatedAt: Date;
  claimedAt: Date;
  deliveredAt: Date;
  totalCents: number;
  deliveryFeeCents: number;
  city: string | null;
  address: string | null;
  paymentMethod: string | null;
  cashCollectedCents: number;
  tipCents: number;
  tipMethod: string | null;
}

/** Deliveries taking longer than this are almost surely marked "Entregue" late → left out of time averages. */
export const MAX_PLAUSIBLE_DELIVERY_MINUTES = 300;

export interface DeliverySummary {
  deliveries: number;
  valueCents: number;
  feeCents: number;
  avgTicketCents: number;
  /** Order placed → delivered (what the customer lived). */
  avgTotalMinutes: number | null;
  medianTotalMinutes: number | null;
  /** Order placed → driver left with it (kitchen + waiting for pickup). */
  avgToPickupMinutes: number | null;
  /** Driver left → delivered. */
  avgOnRoadMinutes: number | null;
  /** % of deliveries done within the wait limit. */
  withinLimitPct: number | null;
  /** Deliveries left out of the time averages (marked delivered hours late). */
  timeExcluded: number;
  cashCollectedCents: number;
  tipsCents: number;
  /** % of deliveries that got a tip. */
  tippedPct: number;
  avgTipCents: number;
}

export interface DriverStats extends DeliverySummary {
  driverId: string;
  driverName: string;
  tipsByMethod: Record<string, number>;
}

export interface DeliveryReport {
  period: { start: string; end: string };
  limitMinutes: number;
  summary: DeliverySummary;
  previous: DeliverySummary | null;
  drivers: DriverStats[];
  /** One entry per day with a count for each driver (keys = driver ids). */
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

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const minutesBetween = (from: Date, to: Date) => Math.max(0, (to.getTime() - from.getTime()) / 60000);

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

const round1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);

export function summarize(rows: DeliveryReportRow[], limitMinutes: number): DeliverySummary {
  const total: number[] = [];
  const toPickup: number[] = [];
  const onRoad: number[] = [];
  let excluded = 0;
  let within = 0;

  for (const r of rows) {
    const t = minutesBetween(r.orderCreatedAt, r.deliveredAt);
    if (t > MAX_PLAUSIBLE_DELIVERY_MINUTES) {
      excluded += 1;
      continue;
    }
    total.push(t);
    toPickup.push(Math.min(minutesBetween(r.orderCreatedAt, r.claimedAt), t));
    onRoad.push(minutesBetween(r.claimedAt, r.deliveredAt));
    if (t <= limitMinutes) within += 1;
  }

  const deliveries = rows.length;
  const valueCents = rows.reduce((a, r) => a + r.totalCents, 0);
  const tipsCents = rows.reduce((a, r) => a + r.tipCents, 0);
  const tipped = rows.filter((r) => r.tipCents > 0).length;

  return {
    deliveries,
    valueCents,
    feeCents: rows.reduce((a, r) => a + r.deliveryFeeCents, 0),
    avgTicketCents: deliveries ? Math.round(valueCents / deliveries) : 0,
    avgTotalMinutes: round1(mean(total)),
    medianTotalMinutes: round1(median(total)),
    avgToPickupMinutes: round1(mean(toPickup)),
    avgOnRoadMinutes: round1(mean(onRoad)),
    withinLimitPct: total.length ? Math.round((within / total.length) * 100) : null,
    timeExcluded: excluded,
    cashCollectedCents: rows.reduce((a, r) => a + r.cashCollectedCents, 0),
    tipsCents,
    tippedPct: deliveries ? Math.round((tipped / deliveries) * 100) : 0,
    avgTipCents: tipped ? Math.round(tipsCents / tipped) : 0,
  };
}

function tipMethodOf(r: DeliveryReportRow): string {
  return r.tipMethod || "cash";
}

function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekdayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return {
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")) % 24,
    weekday: weekdayIndex < 0 ? 0 : weekdayIndex,
  };
}

/** Every calendar day from `start` to `end` (YYYY-MM-DD, inclusive). */
function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cur <= last && out.length < 400) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export function buildDeliveryReport(params: {
  rows: DeliveryReportRow[];
  previousRows: DeliveryReportRow[] | null;
  start: string;
  end: string;
  limitMinutes: number;
  timeZone: string;
}): DeliveryReport {
  const { rows, previousRows, start, end, limitMinutes, timeZone } = params;

  // ── per driver
  const byDriver = new Map<string, DeliveryReportRow[]>();
  for (const r of rows) {
    const list = byDriver.get(r.driverId) ?? [];
    list.push(r);
    byDriver.set(r.driverId, list);
  }
  const drivers: DriverStats[] = [...byDriver.entries()]
    .map(([driverId, list]) => {
      const tipsByMethod: Record<string, number> = {};
      for (const r of list) {
        if (r.tipCents > 0) tipsByMethod[tipMethodOf(r)] = (tipsByMethod[tipMethodOf(r)] ?? 0) + r.tipCents;
      }
      return {
        driverId,
        driverName: list[0]!.driverName,
        ...summarize(list, limitMinutes),
        tipsByMethod,
      };
    })
    .sort((a, b) => b.deliveries - a.deliveries || a.driverName.localeCompare(b.driverName));

  // ── per day (zero-filled) / hour / weekday
  const dailyMap = new Map<string, { date: string; total: number } & Record<string, number | string>>();
  for (const day of eachDay(start, end)) dailyMap.set(day, { date: day, total: 0 });
  const hours = new Array<number>(24).fill(0);
  const weekdays = new Array<number>(7).fill(0);

  for (const r of rows) {
    const p = localParts(r.deliveredAt, timeZone);
    const day = dailyMap.get(p.dateKey) ?? { date: p.dateKey, total: 0 };
    day.total += 1;
    day[r.driverId] = ((day[r.driverId] as number | undefined) ?? 0) + 1;
    dailyMap.set(p.dateKey, day);
    hours[p.hour]! += 1;
    weekdays[p.weekday]! += 1;
  }
  const daily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  // only show the hours around activity (plus one empty neighbour) to keep the chart readable
  const activeHours = hours.map((n, h) => (n > 0 ? h : -1)).filter((h) => h >= 0);
  const fromHour = activeHours.length ? Math.max(0, Math.min(...activeHours) - 1) : 10;
  const toHour = activeHours.length ? Math.min(23, Math.max(...activeHours) + 1) : 22;
  const byHour = hours
    .map((deliveries, h) => ({ hour: `${String(h).padStart(2, "0")}h`, deliveries, h }))
    .filter((x) => x.h >= fromHour && x.h <= toHour)
    .map(({ hour, deliveries }) => ({ hour, deliveries }));

  // ── per city
  const cityMap = new Map<string, DeliveryReportRow[]>();
  for (const r of rows) {
    const key = (r.city || "Sem cidade").trim();
    const list = cityMap.get(key) ?? [];
    list.push(r);
    cityMap.set(key, list);
  }
  const byCity = [...cityMap.entries()]
    .map(([city, list]) => {
      const s = summarize(list, limitMinutes);
      return { city, deliveries: list.length, valueCents: s.valueCents, avgMinutes: s.avgTotalMinutes };
    })
    .sort((a, b) => b.deliveries - a.deliveries);

  // ── tips by method (overall)
  const tipsByMethod: Record<string, number> = {};
  for (const r of rows) {
    if (r.tipCents > 0) tipsByMethod[tipMethodOf(r)] = (tipsByMethod[tipMethodOf(r)] ?? 0) + r.tipCents;
  }

  // ── slowest deliveries (audit: who/what took long)
  const slowest = rows
    .map((r) => ({ r, minutes: minutesBetween(r.orderCreatedAt, r.deliveredAt) }))
    .filter((x) => x.minutes <= MAX_PLAUSIBLE_DELIVERY_MINUTES)
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 5)
    .map(({ r, minutes }) => ({
      orderNumber: r.orderNumber,
      driverName: r.driverName,
      address: r.address,
      city: r.city,
      totalMinutes: Math.round(minutes),
      date: localParts(r.deliveredAt, timeZone).dateKey,
    }));

  return {
    period: { start, end },
    limitMinutes,
    summary: summarize(rows, limitMinutes),
    previous: previousRows ? summarize(previousRows, limitMinutes) : null,
    drivers,
    daily,
    byHour,
    byWeekday: WEEKDAYS.map((label, i) => ({ label, deliveries: weekdays[i]! })),
    byCity,
    tipsByMethod,
    slowest,
  };
}
