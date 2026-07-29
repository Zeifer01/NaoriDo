import { and, eq, sum, notInArray, inArray } from "drizzle-orm";
import { db, schema } from "@restai/db";
import type {
  AnalyticsPeriod,
  AnalyticsScope,
  ProductAnalytics,
  ProductAnalyticsRow,
} from "@restai/types";
import { metric, parsePeriodEnd, parsePeriodStart } from "./period.js";
import { getCompletedOrderIds } from "./sales.js";

async function loadSoldRows(scope: AnalyticsScope, period: AnalyticsPeriod) {
  const orderIds = await getCompletedOrderIds(scope, period);
  if (orderIds.length === 0) return [];

  return db
    .select({
      menuItemId: schema.orderItems.menu_item_id,
      name: schema.orderItems.name,
      categoryName: schema.menuCategories.name,
      costCents: schema.menuItems.cost_cents,
      quantity: sum(schema.orderItems.quantity),
      revenueCents: sum(schema.orderItems.total),
    })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orderItems.order_id, schema.orders.id))
    .leftJoin(schema.menuItems, eq(schema.orderItems.menu_item_id, schema.menuItems.id))
    .leftJoin(
      schema.menuCategories,
      eq(schema.menuItems.category_id, schema.menuCategories.id),
    )
    .where(inArray(schema.orderItems.order_id, orderIds))
    .groupBy(
      schema.orderItems.menu_item_id,
      schema.orderItems.name,
      schema.menuCategories.name,
      schema.menuItems.cost_cents,
    );
}

function toRows(
  raw: Awaited<ReturnType<typeof loadSoldRows>>,
): ProductAnalyticsRow[] {
  const totalRevenue = raw.reduce((acc, r) => acc + Number(r.revenueCents ?? 0), 0);

  return raw.map((r) => {
    const quantity = Number(r.quantity ?? 0);
    const revenueCents = Number(r.revenueCents ?? 0);
    const unitCost = r.costCents ?? null;
    const costCents =
      unitCost !== null ? unitCost * quantity : null;
    const marginCents =
      costCents !== null ? revenueCents - costCents : null;
    const marginRatio =
      marginCents !== null && revenueCents > 0 ? marginCents / revenueCents : null;

    return {
      menuItemId: r.menuItemId,
      name: r.name,
      categoryName: r.categoryName,
      quantity,
      revenueCents,
      revenueShare: totalRevenue > 0 ? revenueCents / totalRevenue : 0,
      costCents,
      marginCents,
      marginRatio,
    };
  });
}

export async function getProductAnalytics(params: {
  scope: AnalyticsScope;
  period: AnalyticsPeriod;
  limit?: number;
}): Promise<ProductAnalytics> {
  const { scope, period, limit = 20 } = params;
  const rows = toRows(await loadSoldRows(scope, period));

  const byRevenue = [...rows].sort((a, b) => b.revenueCents - a.revenueCents);
  const byQty = [...rows].sort((a, b) => b.quantity - a.quantity);
  const bottom = [...byQty].reverse().slice(0, limit);

  const soldIds = rows
    .map((r) => r.menuItemId)
    .filter((id): id is string => Boolean(id));

  const menuWhere = [
    eq(schema.menuItems.organization_id, scope.organizationId),
    eq(schema.menuItems.is_available, true),
  ];
  if (scope.branchId) {
    menuWhere.push(eq(schema.menuItems.branch_id, scope.branchId));
  }

  const withoutSalesQuery = db
    .select({
      menuItemId: schema.menuItems.id,
      name: schema.menuItems.name,
      categoryName: schema.menuCategories.name,
    })
    .from(schema.menuItems)
    .leftJoin(
      schema.menuCategories,
      eq(schema.menuItems.category_id, schema.menuCategories.id),
    )
    .where(
      soldIds.length > 0
        ? and(...menuWhere, notInArray(schema.menuItems.id, soldIds))
        : and(...menuWhere),
    )
    .limit(50);

  const withoutSales = await withoutSalesQuery;

  const categoryMap = new Map<
    string,
    { categoryName: string; quantity: number; revenueCents: number }
  >();
  for (const r of rows) {
    const key = r.categoryName ?? "Sem categoria";
    const cur = categoryMap.get(key) ?? {
      categoryName: key,
      quantity: 0,
      revenueCents: 0,
    };
    cur.quantity += r.quantity;
    cur.revenueCents += r.revenueCents;
    categoryMap.set(key, cur);
  }
  const catTotal = [...categoryMap.values()].reduce((a, c) => a + c.revenueCents, 0);
  const byCategory = [...categoryMap.values()]
    .map((c) => ({
      ...c,
      share: catTotal > 0 ? c.revenueCents / catTotal : 0,
    }))
    .sort((a, b) => b.revenueCents - a.revenueCents);

  const totalQty = rows.reduce((a, r) => a + r.quantity, 0);
  const totalRev = rows.reduce((a, r) => a + r.revenueCents, 0);
  const withMargin = rows.filter((r) => r.marginCents !== null);
  const avgMargin =
    withMargin.length > 0
      ? withMargin.reduce((a, r) => a + (r.marginRatio ?? 0), 0) / withMargin.length
      : null;

  const metrics = [
    metric("products.skus_sold", "SKUs vendidos", rows.length, "count"),
    metric("products.units_sold", "Unidades vendidas", totalQty, "count"),
    metric("products.revenue", "Receita de produtos", totalRev, "cents"),
    metric(
      "products.avg_margin_ratio",
      "Margem média (quando há custo)",
      avgMargin !== null ? Math.round(avgMargin * 10000) / 100 : 0,
      "percent",
    ),
    metric("products.without_sales", "Produtos sem venda", withoutSales.length, "count"),
  ];

  return {
    period,
    metrics,
    topByRevenue: byRevenue.slice(0, limit),
    topByQuantity: byQty.slice(0, limit),
    bottomByQuantity: bottom,
    withoutSales: withoutSales.map((r) => ({
      menuItemId: r.menuItemId,
      name: r.name,
      categoryName: r.categoryName,
    })),
    byCategory,
  };
}
