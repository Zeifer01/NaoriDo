import { and, eq, gte, lte, desc, sum, inArray } from "drizzle-orm";
import { db, schema } from "@restai/db";
import { hasMaterialExpenses } from "@restai/config";
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

async function getExpensesForPeriod(
  scope: AnalyticsScope,
  period: AnalyticsPeriod,
  revenueCents: number,
): Promise<FinanceAnalytics["expenses"]> {
  const [org] = await db
    .select({ settings: schema.organizations.settings })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, scope.organizationId))
    .limit(1);
  if (!hasMaterialExpenses(org?.settings)) return undefined;

  const start = new Date(period.start);
  const end = new Date(period.end);
  end.setHours(23, 59, 59, 999);

  const conditions = [
    eq(schema.materialExpenses.organization_id, scope.organizationId),
    gte(schema.materialExpenses.expense_date, start),
    lte(schema.materialExpenses.expense_date, end),
  ];
  if (scope.branchId) conditions.push(eq(schema.materialExpenses.branch_id, scope.branchId));

  const rows = await db
    .select()
    .from(schema.materialExpenses)
    .where(and(...conditions))
    .orderBy(desc(schema.materialExpenses.amount));

  const totalCents = rows.reduce((s, r) => s + r.amount, 0);

  const byCategoryMap = new Map<string, number>();
  for (const r of rows) byCategoryMap.set(r.category, (byCategoryMap.get(r.category) ?? 0) + r.amount);
  const byCategory = [...byCategoryMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([category, amountCents]) => ({
      category,
      amountCents,
      share: totalCents > 0 ? Math.round((amountCents / totalCents) * 1000) / 10 : 0,
    }));

  const topExpenses = rows.slice(0, 10).map((r) => ({
    description: r.description,
    category: r.category,
    amountCents: r.amount,
    date: r.expense_date.toISOString(),
  }));

  return {
    totalCents,
    profitCents: revenueCents - totalCents,
    byCategory,
    topExpenses,
  };
}

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

  const expenses = await getExpensesForPeriod(params.scope, params.period, totals.totalRevenue);
  if (expenses) {
    metrics.push(
      metric("finance.expenses", "Gastos com materiais", expenses.totalCents, "cents"),
      metric("finance.profit", "Lucro estimado", expenses.profitCents, "cents"),
    );
  }

  return {
    period: params.period,
    comparePeriod: params.comparePeriod,
    metrics,
    series: sales.series,
    paymentMethods,
    byHour: sales.byHour,
    byWeekday: sales.byWeekday,
    expenses,
  };
}
