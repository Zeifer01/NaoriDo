import { and, eq, sum, inArray } from "drizzle-orm";
import { db, schema } from "@restai/db";
import type {
  AnalyticsPeriod,
  AnalyticsScope,
  FinanceAnalytics,
} from "@restai/types";
import { metric } from "./period.js";
import {
  getSalesAnalytics,
  getCompletedOrderIds,
  loadOrderTotals,
} from "./sales.js";

export async function getFinanceAnalytics(params: {
  scope: AnalyticsScope;
  period: AnalyticsPeriod;
  comparePeriod?: AnalyticsPeriod;
}): Promise<FinanceAnalytics> {
  const sales = await getSalesAnalytics(params);
  const orderIds = await getCompletedOrderIds(params.scope, params.period);

  let tipCents = 0;
  let paidCents = 0;

  if (orderIds.length > 0) {
    const [pay] = await db
      .select({
        amount: sum(schema.payments.amount),
        tip: sum(schema.payments.tip),
      })
      .from(schema.payments)
      .where(
        and(
          inArray(schema.payments.order_id, orderIds),
          eq(schema.payments.status, "completed"),
        ),
      );
    tipCents = Number(pay?.tip ?? 0);
    paidCents = Number(pay?.amount ?? 0);
  }

  const totals = await loadOrderTotals(params.scope, params.period);
  const prev = params.comparePeriod
    ? await loadOrderTotals(params.scope, params.comparePeriod)
    : null;

  const avgTicket =
    totals.totalOrders > 0 ? Math.round(totals.totalRevenue / totals.totalOrders) : 0;
  const prevAvg =
    prev && prev.totalOrders > 0
      ? Math.round(prev.totalRevenue / prev.totalOrders)
      : undefined;

  // Days in period (inclusive calendar days)
  const start = new Date(params.period.start);
  const end = new Date(params.period.end);
  const dayCount = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1,
  );
  const dailyAvgRevenue = Math.round(totals.totalRevenue / dayCount);

  const paymentMethods = await Promise.all(
    sales.paymentMethods.map(async (m) => {
      // tip per method
      if (orderIds.length === 0) {
        return { ...m, tipCents: 0 };
      }
      const [row] = await db
        .select({ tip: sum(schema.payments.tip) })
        .from(schema.payments)
        .where(
          and(
            inArray(schema.payments.order_id, orderIds),
            eq(schema.payments.status, "completed"),
            eq(schema.payments.method, m.method as any),
          ),
        );
      return { method: m.method, amountCents: m.amountCents, share: m.share, tipCents: Number(row?.tip ?? 0) };
    }),
  );

  const metrics = [
    metric("finance.revenue", "Faturamento", totals.totalRevenue, "cents", prev?.totalRevenue),
    metric("finance.orders", "Pedidos", totals.totalOrders, "count", prev?.totalOrders),
    metric("finance.ticket_avg", "Ticket médio", avgTicket, "cents", prevAvg),
    metric("finance.revenue_per_day", "Faturamento médio/dia", dailyAvgRevenue, "cents"),
    metric("finance.tips", "Gorjetas", tipCents, "cents"),
    metric("finance.collected", "Valor recebido", paidCents, "cents"),
    metric("finance.discounts", "Descontos", totals.totalDiscount, "cents", prev?.totalDiscount),
    metric("finance.tax", "Impostos", totals.totalTax, "cents", prev?.totalTax),
  ];

  return {
    period: params.period,
    comparePeriod: params.comparePeriod,
    metrics,
    series: sales.series,
    paymentMethods,
    byHour: sales.byHour,
    byWeekday: sales.byWeekday,
  };
}
