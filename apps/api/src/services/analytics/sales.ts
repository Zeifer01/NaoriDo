import { and, eq, gte, lte, sql, count, sum, inArray } from "drizzle-orm";
import { db, schema } from "@restai/db";
import type {
  AnalyticsPeriod,
  AnalyticsScope,
  SalesAnalytics,
  TimeSeriesPoint,
} from "@restai/types";
import {
  metric,
  parsePeriodEnd,
  parsePeriodStart,
  weekdayLabel,
} from "./period.js";
import { tzLiteral } from "../../lib/timezone.js";

const COMPLETED = "completed" as const;

function orderScopeWhere(scope: AnalyticsScope, start: Date, end: Date) {
  const parts = [
    eq(schema.orders.organization_id, scope.organizationId),
    eq(schema.orders.status, COMPLETED),
    gte(schema.orders.created_at, start),
    lte(schema.orders.created_at, end),
  ];
  if (scope.branchId) {
    parts.push(eq(schema.orders.branch_id, scope.branchId));
  }
  return and(...parts);
}

async function loadOrderTotals(scope: AnalyticsScope, period: AnalyticsPeriod) {
  const start = parsePeriodStart(period.start, scope.timezone);
  const end = parsePeriodEnd(period.end, scope.timezone);

  const [totals] = await db
    .select({
      totalOrders: count(),
      totalRevenue: sum(schema.orders.total),
      totalTax: sum(schema.orders.tax),
      totalDiscount: sum(schema.orders.discount),
    })
    .from(schema.orders)
    .where(orderScopeWhere(scope, start, end));

  return {
    totalOrders: totals?.totalOrders ?? 0,
    totalRevenue: Number(totals?.totalRevenue ?? 0),
    totalTax: Number(totals?.totalTax ?? 0),
    totalDiscount: Number(totals?.totalDiscount ?? 0),
  };
}

async function loadDailySeries(
  scope: AnalyticsScope,
  period: AnalyticsPeriod,
): Promise<TimeSeriesPoint[]> {
  const start = parsePeriodStart(period.start, scope.timezone);
  const end = parsePeriodEnd(period.end, scope.timezone);
  const tz = tzLiteral(scope.timezone ?? "UTC");

  const rows = await db
    .select({
      date: sql<string>`to_char(${schema.orders.created_at} AT TIME ZONE ${tz}, 'YYYY-MM-DD')`,
      orders: count(),
      revenueCents: sum(schema.orders.total),
    })
    .from(schema.orders)
    .where(orderScopeWhere(scope, start, end))
    .groupBy(sql`to_char(${schema.orders.created_at} AT TIME ZONE ${tz}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${schema.orders.created_at} AT TIME ZONE ${tz}, 'YYYY-MM-DD')`);

  return rows.map((r) => ({
    date: r.date,
    orders: r.orders,
    revenueCents: Number(r.revenueCents ?? 0),
  }));
}

async function loadPaymentBreakdown(scope: AnalyticsScope, period: AnalyticsPeriod) {
  const start = parsePeriodStart(period.start, scope.timezone);
  const end = parsePeriodEnd(period.end, scope.timezone);

  const orderIds = await db
    .select({ id: schema.orders.id })
    .from(schema.orders)
    .where(orderScopeWhere(scope, start, end));

  if (orderIds.length === 0) return [];

  const ids = orderIds.map((o) => o.id);
  const rows = await db
    .select({
      method: schema.payments.method,
      amountCents: sum(schema.payments.amount),
      orders: count(),
    })
    .from(schema.payments)
    .where(
      and(
        inArray(schema.payments.order_id, ids),
        eq(schema.payments.status, "completed"),
      ),
    )
    .groupBy(schema.payments.method);

  const total = rows.reduce((acc, r) => acc + Number(r.amountCents ?? 0), 0);

  return rows.map((r) => {
    const amountCents = Number(r.amountCents ?? 0);
    return {
      method: r.method,
      amountCents,
      share: total > 0 ? amountCents / total : 0,
      orders: r.orders,
    };
  });
}

async function loadByHour(scope: AnalyticsScope, period: AnalyticsPeriod) {
  const start = parsePeriodStart(period.start, scope.timezone);
  const end = parsePeriodEnd(period.end, scope.timezone);
  const tz = tzLiteral(scope.timezone ?? "UTC");

  const rows = await db
    .select({
      hour: sql<number>`extract(hour from ${schema.orders.created_at} AT TIME ZONE ${tz})::int`,
      orders: count(),
      revenueCents: sum(schema.orders.total),
    })
    .from(schema.orders)
    .where(orderScopeWhere(scope, start, end))
    .groupBy(sql`extract(hour from ${schema.orders.created_at} AT TIME ZONE ${tz})`)
    .orderBy(sql`extract(hour from ${schema.orders.created_at} AT TIME ZONE ${tz})`);

  return rows.map((r) => ({
    hour: Number(r.hour),
    orders: r.orders,
    revenueCents: Number(r.revenueCents ?? 0),
  }));
}

async function loadByWeekday(scope: AnalyticsScope, period: AnalyticsPeriod) {
  const start = parsePeriodStart(period.start, scope.timezone);
  const end = parsePeriodEnd(period.end, scope.timezone);
  const tz = tzLiteral(scope.timezone ?? "UTC");

  const rows = await db
    .select({
      weekday: sql<number>`extract(dow from ${schema.orders.created_at} AT TIME ZONE ${tz})::int`,
      orders: count(),
      revenueCents: sum(schema.orders.total),
    })
    .from(schema.orders)
    .where(orderScopeWhere(scope, start, end))
    .groupBy(sql`extract(dow from ${schema.orders.created_at} AT TIME ZONE ${tz})`)
    .orderBy(sql`extract(dow from ${schema.orders.created_at} AT TIME ZONE ${tz})`);

  return rows.map((r) => {
    const weekday = Number(r.weekday);
    return {
      weekday,
      label: weekdayLabel(weekday),
      orders: r.orders,
      revenueCents: Number(r.revenueCents ?? 0),
    };
  });
}

export async function getSalesAnalytics(params: {
  scope: AnalyticsScope;
  period: AnalyticsPeriod;
  comparePeriod?: AnalyticsPeriod;
}): Promise<SalesAnalytics> {
  const { scope, period, comparePeriod } = params;

  const [totals, series, paymentMethods, byHour, byWeekday, prev] = await Promise.all([
    loadOrderTotals(scope, period),
    loadDailySeries(scope, period),
    loadPaymentBreakdown(scope, period),
    loadByHour(scope, period),
    loadByWeekday(scope, period),
    comparePeriod ? loadOrderTotals(scope, comparePeriod) : Promise.resolve(null),
  ]);

  const avgTicket =
    totals.totalOrders > 0 ? Math.round(totals.totalRevenue / totals.totalOrders) : 0;
  const prevAvg =
    prev && prev.totalOrders > 0
      ? Math.round(prev.totalRevenue / prev.totalOrders)
      : undefined;

  const metrics = [
    metric("revenue.total", "Faturamento", totals.totalRevenue, "cents", prev?.totalRevenue),
    metric("orders.completed", "Pedidos concluídos", totals.totalOrders, "count", prev?.totalOrders),
    metric("ticket.average", "Ticket médio", avgTicket, "cents", prevAvg),
    metric("revenue.tax", "Impostos", totals.totalTax, "cents", prev?.totalTax),
    metric("revenue.discount", "Descontos", totals.totalDiscount, "cents", prev?.totalDiscount),
  ];

  const compareSeries = comparePeriod
    ? await loadDailySeries(scope, comparePeriod)
    : undefined;

  return {
    period,
    comparePeriod,
    metrics,
    series,
    compareSeries,
    paymentMethods,
    byHour,
    byWeekday,
  };
}

/** Shared helper: completed order ids in scope/period (avoids N+1 duplication). */
export async function getCompletedOrderIds(
  scope: AnalyticsScope,
  period: AnalyticsPeriod,
): Promise<string[]> {
  const start = parsePeriodStart(period.start, scope.timezone);
  const end = parsePeriodEnd(period.end, scope.timezone);
  const rows = await db
    .select({ id: schema.orders.id })
    .from(schema.orders)
    .where(orderScopeWhere(scope, start, end));
  return rows.map((r) => r.id);
}

export { orderScopeWhere, loadOrderTotals, loadDailySeries };
