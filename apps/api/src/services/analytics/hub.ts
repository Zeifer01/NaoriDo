import { and, eq, inArray, count } from "drizzle-orm";
import { db, schema } from "@restai/db";
import type {
  AnalyticsPeriod,
  AnalyticsScope,
  ExecutiveHubAnalytics,
} from "@restai/types";
import { metric, previousPeriodOfSameLength } from "./period.js";
import { getSalesAnalytics, getLoyaltyRedemptionCount } from "./sales.js";
import { getProductAnalytics } from "./products.js";
import { getCustomerAnalytics } from "./customers.js";
import { buildExecutiveInsights } from "./insights.js";
import { getRevenueProjection } from "./projections.js";

export async function getExecutiveHub(params: {
  scope: AnalyticsScope;
  period: AnalyticsPeriod;
  comparePeriod?: AnalyticsPeriod;
}): Promise<ExecutiveHubAnalytics> {
  const comparePeriod =
    params.comparePeriod ?? previousPeriodOfSameLength(params.period);

  const [sales, products, customers, projection, loyaltyRedemptions] = await Promise.all([
    getSalesAnalytics({
      scope: params.scope,
      period: params.period,
      comparePeriod,
    }),
    getProductAnalytics({ scope: params.scope, period: params.period, limit: 5 }),
    getCustomerAnalytics({
      scope: params.scope,
      period: params.period,
      comparePeriod,
      rankingLimit: 10,
    }),
    getRevenueProjection({
      scope: params.scope,
      asOf: params.period.end,
      lookbackDays: 90,
      monthsAhead: 3,
    }),
    getLoyaltyRedemptionCount(params.scope, params.period),
  ]);

  const revenue = sales.metrics.find((m) => m.id === "revenue.total");
  const orders = sales.metrics.find((m) => m.id === "orders.completed");
  const ticket = sales.metrics.find((m) => m.id === "ticket.average");
  const newCustomers = customers.metrics.find((m) => m.id === "crm.customers_new");
  const atRisk = customers.metrics.find((m) => m.id === "crm.customers_at_risk");
  const vip = customers.metrics.find((m) => m.id === "crm.customers_vip");
  const portfolio = customers.metrics.find((m) => m.id === "crm.portfolio_ltv");
  const recurring = customers.metrics.find((m) => m.id === "crm.customers_recurring");
  const retention = customers.metrics.find((m) => m.id === "crm.retention_rate");
  const churn = customers.metrics.find((m) => m.id === "crm.churn_estimate");

  let peakWeekday: string | null = null;
  let peakWeekdayShare = 0;
  if (sales.byWeekday.length > 0) {
    const top = [...sales.byWeekday].sort((a, b) => b.revenueCents - a.revenueCents)[0];
    const total = sales.byWeekday.reduce((a, w) => a + w.revenueCents, 0);
    peakWeekday = top.label;
    peakWeekdayShare = total > 0 ? Math.round((top.revenueCents / total) * 10000) / 100 : 0;
  }

  let peakHour: number | null = null;
  if (sales.byHour.length > 0) {
    peakHour = [...sales.byHour].sort((a, b) => b.orders - a.orders)[0].hour;
  }

  let activeOrders = 0;
  if (params.scope.branchId) {
    const [row] = await db
      .select({ count: count() })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.branch_id, params.scope.branchId),
          inArray(schema.orders.status, ["pending", "confirmed", "preparing", "ready"]),
        ),
      );
    activeOrders = row?.count ?? 0;
  }

  const metrics = [
    metric("hub.revenue", "Faturamento", revenue?.value ?? 0, "cents", revenue?.previousValue),
    metric("hub.orders", "Pedidos", orders?.value ?? 0, "count", orders?.previousValue),
    metric("hub.ticket", "Ticket médio", ticket?.value ?? 0, "cents", ticket?.previousValue),
    metric(
      "hub.new_customers",
      "Novos clientes",
      newCustomers?.value ?? 0,
      "count",
      newCustomers?.previousValue,
    ),
    metric(
      "hub.recurring_customers",
      "Recorrentes",
      recurring?.value ?? 0,
      "count",
      recurring?.previousValue,
    ),
    metric(
      "hub.retention_rate",
      "Retenção",
      retention?.value ?? 0,
      "percent",
      retention?.previousValue,
    ),
    metric(
      "hub.churn_estimate",
      "Churn estimado",
      churn?.value ?? 0,
      "percent",
      churn?.previousValue,
    ),
    metric(
      "hub.customers_at_risk",
      "Em risco",
      atRisk?.value ?? 0,
      "count",
      atRisk?.previousValue,
    ),
    metric("hub.customers_vip", "VIP", vip?.value ?? 0, "count"),
    metric("hub.portfolio_ltv", "Valor da carteira", portfolio?.value ?? 0, "cents"),
    metric("hub.peak_weekday_share", "Share do dia pico", peakWeekdayShare, "percent"),
    metric("hub.peak_hour", "Horário pico", peakHour ?? -1, "count"),
    metric("hub.active_orders", "Pedidos ativos", activeOrders, "count"),
  ];

  const insights = buildExecutiveInsights({
    metrics,
    series: sales.series,
    topProducts: products.topByRevenue,
    peakWeekday,
    peakHour,
    atRiskCount: (atRisk?.value as number) ?? 0,
    newCustomersDelta: newCustomers?.changeRatio ?? null,
  });

  if (projection.monthlyTrendRatio !== null && projection.nextMonths[0]) {
    const next = projection.nextMonths[0];
    insights.push({
      id: "hub.projection_trend",
      category: "growth",
      severity: projection.monthlyTrendRatio >= 0 ? "positive" : "warning",
      title: "Tendência e projeção",
      message: `Tendência mensal recente: ${(projection.monthlyTrendRatio * 100).toFixed(1)}%. Projeção do próximo mês: ${(
        next.projectedRevenueCents / 100
      ).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} (faixa ±20%).`,
      metricIds: ["hub.revenue"],
      data: { projection: next },
    });
  }

  return {
    period: params.period,
    comparePeriod,
    metrics,
    series: sales.series,
    compareSeries: sales.compareSeries,
    topProducts: products.topByRevenue,
    customerHighlights: {
      newCustomers: (newCustomers?.value as number) ?? 0,
      recurringCustomers: (recurring?.value as number) ?? 0,
      atRiskCount: (atRisk?.value as number) ?? 0,
      vipCount: (vip?.value as number) ?? 0,
      portfolioLtvCents: (portfolio?.value as number) ?? 0,
    },
    operations: {
      activeOrders,
      completedOrders: (orders?.value as number) ?? 0,
      peakHour,
      peakWeekday,
      loyaltyRedemptions,
    },
    insights,
    projection: {
      nextMonths: projection.nextMonths,
      nextWeeks: projection.nextWeeks,
      nextYear: projection.nextYear,
      monthlyTrendRatio: projection.monthlyTrendRatio,
      avgDailyRevenueCents: projection.avgDailyRevenueCents,
      lookbackDays: projection.lookbackDays,
      disclaimer: projection.disclaimer,
    },
  };
}
