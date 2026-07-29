import { and, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@restai/db";
import type {
  AbcClass,
  AnalyticsInsight,
  AnalyticsPeriod,
  AnalyticsScope,
  CustomerAnalytics,
  CustomerAnalyticsRow,
  RfmSegment,
} from "@restai/types";
import {
  daysBetween,
  metric,
  parsePeriodEnd,
  parsePeriodStart,
  quintileScore,
} from "./period.js";
import { buildCustomerInsights } from "./insights.js";

const AT_RISK_DAYS = 60;
const LOST_DAYS = 90;
const OCCASIONAL_MAX_ORDERS = 2;
const VIP_TOP_PERCENT = 0.1; // top 10% by spend = VIP

interface OrderAgg {
  customerId: string;
  orderCount: number;
  totalSpentCents: number;
  firstOrderAt: Date;
  lastOrderAt: Date;
  orderDates: Date[];
}

function segmentFromRfm(r: number, f: number, m: number, daysSince: number | null): RfmSegment {
  if (daysSince !== null && daysSince > LOST_DAYS) return "lost";
  if (r >= 4 && f >= 4 && m >= 4) return "champions";
  if (r >= 3 && f >= 3) return "loyal";
  if (r >= 4 && f <= 2) return "new";
  if (r <= 2 && f >= 3) return "at_risk";
  if (r <= 2 && f <= 2) return "hibernating";
  if (m >= 4) return "potential";
  return "other";
}

function assignAbc(rows: { totalSpentCents: number }[]): AbcClass[] {
  const sortedIdx = rows
    .map((r, i) => ({ i, spend: r.totalSpentCents }))
    .sort((a, b) => b.spend - a.spend);
  const total = sortedIdx.reduce((a, x) => a + x.spend, 0);
  const result: AbcClass[] = Array(rows.length).fill("C");
  let acc = 0;
  for (const { i, spend } of sortedIdx) {
    acc += spend;
    const share = total > 0 ? acc / total : 1;
    if (share <= 0.8) result[i] = "A";
    else if (share <= 0.95) result[i] = "B";
    else result[i] = "C";
  }
  return result;
}

export async function getCustomerAnalytics(params: {
  scope: AnalyticsScope;
  period: AnalyticsPeriod;
  comparePeriod?: AnalyticsPeriod;
  rankingLimit?: number;
  /** Days without purchase to consider at-risk / lost. */
  atRiskDays?: number;
  lostDays?: number;
}): Promise<CustomerAnalytics> {
  const {
    scope,
    period,
    comparePeriod,
    rankingLimit = 50,
    atRiskDays = AT_RISK_DAYS,
    lostDays = LOST_DAYS,
  } = params;

  const periodStart = parsePeriodStart(period.start);
  const periodEnd = parsePeriodEnd(period.end);
  const now = periodEnd;

  // All customers in org
  const customers = await db
    .select({
      id: schema.customers.id,
      name: schema.customers.name,
      email: schema.customers.email,
      phone: schema.customers.phone,
      city: schema.customers.city,
      neighborhood: schema.customers.neighborhood,
      createdAt: schema.customers.created_at,
    })
    .from(schema.customers)
    .where(eq(schema.customers.organization_id, scope.organizationId));

  // Completed orders with customer (org-wide or branch)
  const orderWhere = [
    eq(schema.orders.organization_id, scope.organizationId),
    eq(schema.orders.status, "completed"),
    isNotNull(schema.orders.customer_id),
  ];
  if (scope.branchId) {
    orderWhere.push(eq(schema.orders.branch_id, scope.branchId));
  }

  const orders = await db
    .select({
      customerId: schema.orders.customer_id,
      total: schema.orders.total,
      createdAt: schema.orders.created_at,
    })
    .from(schema.orders)
    .where(and(...orderWhere));

  const byCustomer = new Map<string, OrderAgg>();
  for (const o of orders) {
    if (!o.customerId) continue;
    const cur = byCustomer.get(o.customerId);
    if (!cur) {
      byCustomer.set(o.customerId, {
        customerId: o.customerId,
        orderCount: 1,
        totalSpentCents: o.total,
        firstOrderAt: o.createdAt,
        lastOrderAt: o.createdAt,
        orderDates: [o.createdAt],
      });
    } else {
      cur.orderCount += 1;
      cur.totalSpentCents += o.total;
      if (o.createdAt < cur.firstOrderAt) cur.firstOrderAt = o.createdAt;
      if (o.createdAt > cur.lastOrderAt) cur.lastOrderAt = o.createdAt;
      cur.orderDates.push(o.createdAt);
    }
  }

  // Period-scoped order counts for "served in period" / new / recovered
  let servedInPeriod = 0;
  let newInPeriod = 0;
  let recoveredInPeriod = 0;
  let recurringInPeriod = 0;

  const recencyValues: number[] = [];
  const frequencyValues: number[] = [];
  const monetaryValues: number[] = [];

  for (const agg of byCustomer.values()) {
    const daysSince = daysBetween(agg.lastOrderAt, now);
    recencyValues.push(daysSince);
    frequencyValues.push(agg.orderCount);
    monetaryValues.push(agg.totalSpentCents);

    const ordersInPeriod = agg.orderDates.filter(
      (d) => d >= periodStart && d <= periodEnd,
    ).length;
    if (ordersInPeriod > 0) {
      servedInPeriod += 1;
      if (agg.firstOrderAt >= periodStart && agg.firstOrderAt <= periodEnd) {
        newInPeriod += 1;
      } else if (ordersInPeriod >= 1 && agg.orderCount > ordersInPeriod) {
        recurringInPeriod += 1;
      }
      // Recovered: had a gap > lostDays before a purchase in this period
      const sorted = [...agg.orderDates].sort((a, b) => a.getTime() - b.getTime());
      for (let i = 1; i < sorted.length; i++) {
        if (
          sorted[i] >= periodStart &&
          sorted[i] <= periodEnd &&
          daysBetween(sorted[i - 1], sorted[i]) >= lostDays
        ) {
          recoveredInPeriod += 1;
          break;
        }
      }
    }
  }

  // Compare period new customers
  let prevNew = 0;
  if (comparePeriod) {
    const cStart = parsePeriodStart(comparePeriod.start);
    const cEnd = parsePeriodEnd(comparePeriod.end);
    for (const agg of byCustomer.values()) {
      if (agg.firstOrderAt >= cStart && agg.firstOrderAt <= cEnd) prevNew += 1;
    }
  }

  const spendSorted = [...byCustomer.values()].sort(
    (a, b) => b.totalSpentCents - a.totalSpentCents,
  );
  const vipCutoff = Math.max(1, Math.ceil(spendSorted.length * VIP_TOP_PERCENT));
  const vipIds = new Set(spendSorted.slice(0, vipCutoff).map((s) => s.customerId));

  const abcForSpend = assignAbc(spendSorted);
  const abcByCustomer = new Map<string, AbcClass>();
  spendSorted.forEach((s, i) => abcByCustomer.set(s.customerId, abcForSpend[i]));

  const rows: CustomerAnalyticsRow[] = [];

  for (const c of customers) {
    const agg = byCustomer.get(c.id);
    const orderCount = agg?.orderCount ?? 0;
    const totalSpentCents = agg?.totalSpentCents ?? 0;
    const lastOrderAt = agg?.lastOrderAt ?? null;
    const firstOrderAt = agg?.firstOrderAt ?? null;
    const daysSince = lastOrderAt ? daysBetween(lastOrderAt, now) : null;

    let avgDaysBetween: number | null = null;
    let daysToSecond: number | null = null;
    if (agg && agg.orderDates.length >= 2) {
      const sorted = [...agg.orderDates].sort((a, b) => a.getTime() - b.getTime());
      const gaps: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        gaps.push(daysBetween(sorted[i - 1], sorted[i]));
      }
      avgDaysBetween = Math.round(gaps.reduce((a, g) => a + g, 0) / gaps.length);
      daysToSecond = gaps[0] ?? null;
    }

    const r = daysSince === null ? 1 : quintileScore(recencyValues, daysSince, true);
    const f = orderCount === 0 ? 1 : quintileScore(frequencyValues, orderCount);
    const m = totalSpentCents === 0 ? 1 : quintileScore(monetaryValues, totalSpentCents);
    const segment = segmentFromRfm(r, f, m, daysSince);

    const isLost = daysSince !== null && daysSince >= lostDays;
    const isAtRisk =
      !isLost && daysSince !== null && daysSince >= atRiskDays && orderCount >= 2;
    const isOccasional = orderCount > 0 && orderCount <= OCCASIONAL_MAX_ORDERS;
    const isVip = vipIds.has(c.id);

    rows.push({
      customerId: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      city: c.city,
      neighborhood: c.neighborhood,
      orderCount,
      totalSpentCents,
      avgTicketCents: orderCount > 0 ? Math.round(totalSpentCents / orderCount) : 0,
      firstOrderAt: firstOrderAt?.toISOString() ?? null,
      lastOrderAt: lastOrderAt?.toISOString() ?? null,
      daysSinceLastOrder: daysSince,
      avgDaysBetweenOrders: avgDaysBetween,
      rfm: { r, f, m, segment },
      abc: abcByCustomer.get(c.id) ?? "C",
      isVip,
      isAtRisk,
      isLost,
      isOccasional,
      // stash daysToSecond via unused — we'll compute metric from gaps below
    });

    // attach daysToSecond on data for metric via closure — compute globally
    void daysToSecond;
  }

  // Time to second purchase average
  let secondPurchaseSum = 0;
  let secondPurchaseN = 0;
  for (const agg of byCustomer.values()) {
    if (agg.orderDates.length < 2) continue;
    const sorted = [...agg.orderDates].sort((a, b) => a.getTime() - b.getTime());
    secondPurchaseSum += daysBetween(sorted[0], sorted[1]);
    secondPurchaseN += 1;
  }
  const avgDaysToSecond =
    secondPurchaseN > 0 ? Math.round(secondPurchaseSum / secondPurchaseN) : 0;

  const buyers = rows.filter((r) => r.orderCount > 0);
  const portfolioLtv = buyers.reduce((a, r) => a + r.totalSpentCents, 0);
  const avgLtv =
    buyers.length > 0 ? Math.round(portfolioLtv / buyers.length) : 0;
  const avgFreq =
    buyers.length > 0
      ? buyers.reduce((a, r) => a + r.orderCount, 0) / buyers.length
      : 0;
  const avgTicketCustomer =
    buyers.length > 0
      ? Math.round(buyers.reduce((a, r) => a + r.avgTicketCents, 0) / buyers.length)
      : 0;
  const avgDaysBetweenAll =
    buyers.filter((r) => r.avgDaysBetweenOrders !== null).length > 0
      ? Math.round(
          buyers
            .filter((r) => r.avgDaysBetweenOrders !== null)
            .reduce((a, r) => a + (r.avgDaysBetweenOrders ?? 0), 0) /
            buyers.filter((r) => r.avgDaysBetweenOrders !== null).length,
        )
      : 0;

  const lostCount = rows.filter((r) => r.isLost).length;
  const atRiskCount = rows.filter((r) => r.isAtRisk).length;
  const vipCount = rows.filter((r) => r.isVip).length;
  const activeInPeriod = servedInPeriod;
  // Retention approx: recurring / (served - new) among those who could return
  const eligibleReturn = Math.max(1, servedInPeriod - newInPeriod);
  const retentionRate = recurringInPeriod / eligibleReturn;
  // Repurchase rate: customers with 2+ orders / customers with 1+
  const repurchaseRate =
    buyers.length > 0
      ? buyers.filter((r) => r.orderCount >= 2).length / buyers.length
      : 0;
  const churnEstimate =
    buyers.length > 0 ? lostCount / buyers.length : 0;

  // New customers registered in period (by created_at)
  const registeredInPeriod = customers.filter(
    (c) => c.createdAt >= periodStart && c.createdAt <= periodEnd,
  ).length;

  const metrics = [
    metric("crm.customers_total", "Clientes cadastrados", customers.length, "count"),
    metric("crm.customers_with_orders", "Clientes que já compraram", buyers.length, "count"),
    metric("crm.customers_served_period", "Atendidos no período", activeInPeriod, "count"),
    metric("crm.customers_new", "Novos clientes (1ª compra)", newInPeriod, "count", prevNew || undefined),
    metric("crm.customers_registered", "Novos cadastros", registeredInPeriod, "count"),
    metric("crm.customers_recurring", "Recorrentes no período", recurringInPeriod, "count"),
    metric("crm.customers_recovered", "Clientes recuperados", recoveredInPeriod, "count"),
    metric("crm.customers_at_risk", "Em risco", atRiskCount, "count"),
    metric("crm.customers_lost", "Perdidos / inativos", lostCount, "count"),
    metric("crm.customers_vip", "VIP", vipCount, "count"),
    metric("crm.portfolio_ltv", "Valor da carteira (LTV total)", portfolioLtv, "cents"),
    metric("crm.avg_ltv", "LTV médio", avgLtv, "cents"),
    metric("crm.avg_ticket", "Ticket médio por cliente", avgTicketCustomer, "cents"),
    metric("crm.avg_frequency", "Frequência média de compra", Math.round(avgFreq * 100) / 100, "count"),
    metric("crm.avg_days_between", "Tempo médio entre compras", avgDaysBetweenAll, "days"),
    metric("crm.avg_days_to_second", "Tempo médio até 2ª compra", avgDaysToSecond, "days"),
    metric("crm.retention_rate", "Taxa de retenção", Math.round(retentionRate * 10000) / 100, "percent"),
    metric("crm.repurchase_rate", "Taxa de recompra", Math.round(repurchaseRate * 10000) / 100, "percent"),
    metric("crm.churn_estimate", "Churn estimado", Math.round(churnEstimate * 10000) / 100, "percent"),
  ];

  // Segments
  const segmentMap = new Map<RfmSegment, { count: number; revenueCents: number }>();
  for (const r of rows) {
    if (r.orderCount === 0) continue;
    const cur = segmentMap.get(r.rfm.segment) ?? { count: 0, revenueCents: 0 };
    cur.count += 1;
    cur.revenueCents += r.totalSpentCents;
    segmentMap.set(r.rfm.segment, cur);
  }
  const segments = [...segmentMap.entries()].map(([segment, v]) => ({
    segment,
    count: v.count,
    revenueCents: v.revenueCents,
  }));

  // ABC summary
  const abcMap = new Map<AbcClass, { count: number; revenueCents: number }>();
  for (const r of buyers) {
    const cur = abcMap.get(r.abc) ?? { count: 0, revenueCents: 0 };
    cur.count += 1;
    cur.revenueCents += r.totalSpentCents;
    abcMap.set(r.abc, cur);
  }
  const abcTotal = portfolioLtv || 1;
  const abc = (["A", "B", "C"] as AbcClass[]).map((cls) => {
    const v = abcMap.get(cls) ?? { count: 0, revenueCents: 0 };
    return {
      class: cls,
      count: v.count,
      revenueCents: v.revenueCents,
      share: v.revenueCents / abcTotal,
    };
  });

  // Geo
  const cityMap = new Map<string, { customers: number; revenueCents: number }>();
  const hoodMap = new Map<string, { customers: number; revenueCents: number }>();
  for (const r of buyers) {
    if (r.city) {
      const cur = cityMap.get(r.city) ?? { customers: 0, revenueCents: 0 };
      cur.customers += 1;
      cur.revenueCents += r.totalSpentCents;
      cityMap.set(r.city, cur);
    }
    if (r.neighborhood) {
      const cur = hoodMap.get(r.neighborhood) ?? { customers: 0, revenueCents: 0 };
      cur.customers += 1;
      cur.revenueCents += r.totalSpentCents;
      hoodMap.set(r.neighborhood, cur);
    }
  }

  // Base growth by month (first order month)
  const growthMap = new Map<string, number>();
  for (const agg of byCustomer.values()) {
    const month = agg.firstOrderAt.toISOString().slice(0, 7);
    growthMap.set(month, (growthMap.get(month) ?? 0) + 1);
  }
  const growthMonths = [...growthMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  let cumulative = 0;
  const baseGrowth = growthMonths.map(([month, newCustomers]) => {
    cumulative += newCustomers;
    return { month, newCustomers, cumulative };
  });

  const ranking = [...rows]
    .filter((r) => r.orderCount > 0)
    .sort((a, b) => b.totalSpentCents - a.totalSpentCents)
    .slice(0, rankingLimit);

  const insights: AnalyticsInsight[] = buildCustomerInsights({
    metrics,
    atRiskCount,
    lostCount,
    lostDays,
    newInPeriod,
    prevNew,
    retentionRate,
    vipIdle: ranking.filter((r) => r.isVip && (r.daysSinceLastOrder ?? 0) >= atRiskDays),
  });

  return {
    period,
    comparePeriod,
    metrics,
    segments,
    abc,
    ranking,
    byCity: [...cityMap.entries()]
      .map(([city, v]) => ({ city, ...v }))
      .sort((a, b) => b.revenueCents - a.revenueCents),
    byNeighborhood: [...hoodMap.entries()]
      .map(([neighborhood, v]) => ({ neighborhood, ...v }))
      .sort((a, b) => b.revenueCents - a.revenueCents),
    baseGrowth,
    insights,
  };
}
