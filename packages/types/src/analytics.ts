/**
 * Analytics contracts — UI-agnostic, AI/API-ready.
 *
 * These types are the public surface for the analytics engine.
 * Consumers: dashboard, reports, future public API, mobile, AI agents, alerts.
 */

/** Inclusive calendar period (ISO date strings YYYY-MM-DD or full ISO). */
export interface AnalyticsPeriod {
  start: string;
  end: string;
}

export type AnalyticsGranularity = "day" | "week" | "month";

/** Scope for queries. Branch optional = org-wide (CRM often org-scoped). */
export interface AnalyticsScope {
  organizationId: string;
  branchId?: string;
  /** IANA timezone for day/hour/weekday boundaries. Undefined = legacy UTC boundaries. */
  timezone?: string;
}

export interface AnalyticsQuery {
  scope: AnalyticsScope;
  period: AnalyticsPeriod;
  /** Optional comparison window for deltas / YoY / MoM. */
  comparePeriod?: AnalyticsPeriod;
  granularity?: AnalyticsGranularity;
  timezone?: string;
}

/** Stable metric envelope for APIs and AI agents. */
export interface AnalyticsMetric<T = number> {
  /** Machine-stable id, e.g. `revenue.total`, `crm.churn_rate`. */
  id: string;
  label: string;
  value: T;
  /** Unit hint for formatters / AI: cents | count | ratio | days | percent. */
  unit: "cents" | "count" | "ratio" | "days" | "percent" | "string";
  /** Value in the compare period, when available. */
  previousValue?: T;
  /** (current - previous) / |previous| — null if previous is 0/undefined. */
  changeRatio?: number | null;
}

export type InsightSeverity = "info" | "positive" | "warning" | "critical";
export type InsightCategory =
  | "revenue"
  | "growth"
  | "customers"
  | "retention"
  | "products"
  | "operations"
  | "payments";

/**
 * Human-readable observation derived from metrics.
 * Designed so AI agents can quote or expand on them.
 */
export interface AnalyticsInsight {
  id: string;
  category: InsightCategory;
  severity: InsightSeverity;
  title: string;
  message: string;
  /** Related metric ids for drill-down. */
  metricIds?: string[];
  /** Optional structured payload for agents. */
  data?: Record<string, unknown>;
}

export interface TimeSeriesPoint {
  date: string;
  orders: number;
  revenueCents: number;
}

export interface SalesAnalytics {
  period: AnalyticsPeriod;
  comparePeriod?: AnalyticsPeriod;
  metrics: AnalyticsMetric[];
  series: TimeSeriesPoint[];
  compareSeries?: TimeSeriesPoint[];
  paymentMethods: { method: string; amountCents: number; share: number; orders: number }[];
  byHour: { hour: number; revenueCents: number; orders: number }[];
  byWeekday: { weekday: number; label: string; revenueCents: number; orders: number }[];
}

export interface ProductAnalyticsRow {
  menuItemId: string | null;
  name: string;
  categoryName: string | null;
  quantity: number;
  revenueCents: number;
  revenueShare: number;
  costCents: number | null;
  marginCents: number | null;
  marginRatio: number | null;
}

export interface ModifierAnalyticsRow {
  modifierId: string | null;
  name: string;
  groupName: string | null;
  quantity: number;
  revenueCents: number;
  share: number;
}

export interface ProductAnalytics {
  period: AnalyticsPeriod;
  metrics: AnalyticsMetric[];
  topByRevenue: ProductAnalyticsRow[];
  topByQuantity: ProductAnalyticsRow[];
  bottomByQuantity: ProductAnalyticsRow[];
  withoutSales: { menuItemId: string; name: string; categoryName: string | null }[];
  byCategory: {
    categoryName: string;
    quantity: number;
    revenueCents: number;
    share: number;
  }[];
  /** Top complementos / modifiers escolhidos nos pedidos concluídos. */
  topModifiers: ModifierAnalyticsRow[];
  /**
   * Pedidos por canal (PDV vs. online). Omitido quando a org não tem o
   * relatório de canal habilitado (`order_channel_report`).
   */
  channelBreakdown?: {
    source: "pos" | "online" | "unknown";
    orders: number;
    revenueCents: number;
    share: number;
  }[];
}

export interface FinanceAnalytics {
  period: AnalyticsPeriod;
  comparePeriod?: AnalyticsPeriod;
  metrics: AnalyticsMetric[];
  series: TimeSeriesPoint[];
  paymentMethods: { method: string; amountCents: number; share: number; tipCents: number }[];
  byHour: { hour: number; revenueCents: number; orders: number }[];
  byWeekday: { weekday: number; label: string; revenueCents: number; orders: number }[];
}

export type RfmSegment =
  | "champions"
  | "loyal"
  | "potential"
  | "new"
  | "at_risk"
  | "hibernating"
  | "lost"
  | "other";

export type AbcClass = "A" | "B" | "C";

export interface CustomerAnalyticsRow {
  customerId: string;
  name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  neighborhood: string | null;
  orderCount: number;
  totalSpentCents: number;
  avgTicketCents: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  daysSinceLastOrder: number | null;
  avgDaysBetweenOrders: number | null;
  rfm: { r: number; f: number; m: number; segment: RfmSegment };
  abc: AbcClass;
  isVip: boolean;
  isAtRisk: boolean;
  isLost: boolean;
  isOccasional: boolean;
}

export interface CustomerAnalytics {
  period: AnalyticsPeriod;
  comparePeriod?: AnalyticsPeriod;
  metrics: AnalyticsMetric[];
  segments: { segment: RfmSegment; count: number; revenueCents: number }[];
  abc: { class: AbcClass; count: number; revenueCents: number; share: number }[];
  ranking: CustomerAnalyticsRow[];
  byCity: { city: string; customers: number; revenueCents: number }[];
  byNeighborhood: { neighborhood: string; customers: number; revenueCents: number }[];
  baseGrowth: { month: string; newCustomers: number; cumulative: number }[];
  insights: AnalyticsInsight[];
}

export interface ExecutiveHubAnalytics {
  period: AnalyticsPeriod;
  comparePeriod: AnalyticsPeriod;
  metrics: AnalyticsMetric[];
  series: TimeSeriesPoint[];
  compareSeries?: TimeSeriesPoint[];
  topProducts: ProductAnalyticsRow[];
  customerHighlights: {
    newCustomers: number;
    recurringCustomers: number;
    atRiskCount: number;
    vipCount: number;
    portfolioLtvCents: number;
  };
  operations: {
    activeOrders: number;
    completedOrders: number;
    peakHour: number | null;
    peakWeekday: string | null;
    /** Orders with at least one manually-comped item (e.g. loyalty sticker card) in the period. */
    loyaltyRedemptions: number;
  };
  insights: AnalyticsInsight[];
  projection?: {
    nextMonths: Array<{
      month: string;
      projectedRevenueCents: number;
      lowCents: number;
      highCents: number;
    }>;
    /** Próximas N semanas (média diária × 7, com tendência). */
    nextWeeks: Array<{
      weekStart: string;
      projectedRevenueCents: number;
      lowCents: number;
      highCents: number;
    }>;
    /** Projeção dos próximos 12 meses (soma anual). */
    nextYear: {
      yearLabel: string;
      projectedRevenueCents: number;
      lowCents: number;
      highCents: number;
    } | null;
    monthlyTrendRatio: number | null;
    avgDailyRevenueCents: number;
    lookbackDays: number;
    disclaimer: string;
  };
}
