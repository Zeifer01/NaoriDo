import { and, eq, sum, count, notInArray, inArray } from "drizzle-orm";
import { db, schema } from "@restai/db";
import { hasOrderChannelReport } from "@restai/config";
import type {
  AnalyticsPeriod,
  AnalyticsScope,
  ModifierAnalyticsRow,
  ProductAnalytics,
  ProductAnalyticsRow,
} from "@restai/types";
import { metric } from "./period.js";
import { getCompletedOrderIds, getOrderChannelBreakdown } from "./sales.js";

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

async function loadTopModifiers(
  scope: AnalyticsScope,
  period: AnalyticsPeriod,
  limit: number,
): Promise<ModifierAnalyticsRow[]> {
  const orderIds = await getCompletedOrderIds(scope, period);
  if (orderIds.length === 0) return [];

  const raw = await db
    .select({
      modifierId: schema.orderItemModifiers.modifier_id,
      name: schema.orderItemModifiers.name,
      groupName: schema.modifierGroups.name,
      quantity: count(),
      revenueCents: sum(schema.orderItemModifiers.price),
    })
    .from(schema.orderItemModifiers)
    .innerJoin(
      schema.orderItems,
      eq(schema.orderItemModifiers.order_item_id, schema.orderItems.id),
    )
    .leftJoin(schema.modifiers, eq(schema.orderItemModifiers.modifier_id, schema.modifiers.id))
    .leftJoin(
      schema.modifierGroups,
      eq(schema.modifiers.group_id, schema.modifierGroups.id),
    )
    .where(inArray(schema.orderItems.order_id, orderIds))
    .groupBy(
      schema.orderItemModifiers.modifier_id,
      schema.orderItemModifiers.name,
      schema.modifierGroups.name,
    );

  const totalQty = raw.reduce((a, r) => a + Number(r.quantity ?? 0), 0);
  return raw
    .map((r) => {
      const quantity = Number(r.quantity ?? 0);
      return {
        modifierId: r.modifierId,
        name: r.name,
        groupName: r.groupName,
        quantity,
        revenueCents: Number(r.revenueCents ?? 0),
        share: totalQty > 0 ? quantity / totalQty : 0,
      };
    })
    .sort((a, b) => b.quantity - a.quantity || b.revenueCents - a.revenueCents)
    .slice(0, limit);
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
  const [soldRaw, topModifiers, org] = await Promise.all([
    loadSoldRows(scope, period),
    loadTopModifiers(scope, period, limit),
    db
      .select({ settings: schema.organizations.settings })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, scope.organizationId))
      .limit(1)
      .then((r) => r[0]),
  ]);
  const rows = toRows(soldRaw);

  let channelBreakdown: ProductAnalytics["channelBreakdown"];
  if (hasOrderChannelReport(org?.settings)) {
    const channelRows = await getOrderChannelBreakdown(scope, period);
    const channelTotal = channelRows.reduce((a, r) => a + r.orders, 0);
    channelBreakdown = channelRows
      .map((r) => ({ ...r, share: channelTotal > 0 ? r.orders / channelTotal : 0 }))
      .sort((a, b) => b.orders - a.orders);
  }

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
    topModifiers,
    channelBreakdown,
  };
}
