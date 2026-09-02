import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { zValidator } from "@hono/zod-validator";
import { eq, and, ne, gte, lte, lt, sql, desc, inArray, count, sum } from "drizzle-orm";
import { db, schema } from "@restai/db";
import { hasReportsPlacedOrdersToggle, hasHistoricalOrdersReport } from "@restai/config";
import { reportQuerySchema, historicalOrdersQuerySchema } from "@restai/validators";
import { authMiddleware } from "../middleware/auth.js";
import { tenantMiddleware, requireBranch } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/rbac.js";
import { requireFeature } from "../middleware/feature.js";
import { requireActivePlan } from "../middleware/active-plan.js";
import { startOfDayInTimezone, resolveTenantTimezone, tzLiteral } from "../lib/timezone.js";
import { rankItemMentions } from "../lib/historical-item-mentions.js";

const reports = new Hono<AppEnv>();

reports.use("*", authMiddleware);
reports.use("*", tenantMiddleware);
reports.use("*", requireBranch);
reports.use("*", requireActivePlan);
reports.use("*", requireFeature("reports"));

/**
 * Resolves the order-status condition for /sales and /top-items.
 * 'placed' scope (every non-cancelled order) is only honored when the org
 * has reports_placed_orders_toggle — otherwise always falls back to the
 * legacy 'completed'-only behavior, unchanged for every other org.
 */
async function resolveReportStatusCondition(organizationId: string, scope: "completed" | "placed" | undefined) {
  if (scope === "placed") {
    const [org] = await db
      .select({ settings: schema.organizations.settings })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, organizationId))
      .limit(1);
    if (hasReportsPlacedOrdersToggle(org?.settings)) {
      return ne(schema.orders.status, "cancelled");
    }
  }
  return eq(schema.orders.status, "completed");
}

// GET /dashboard - Dashboard stats
reports.get("/dashboard", requirePermission("reports:read"), async (c) => {
  const tenant = c.get("tenant") as any;

  const tz = await resolveTenantTimezone(tenant.organizationId, tenant.branchId);
  const today = startOfDayInTimezone(tz);

  // Today's orders
  const [orderStats] = await db
    .select({
      totalOrders: count(),
      totalRevenue: sum(schema.orders.total),
    })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.branch_id, tenant.branchId),
        gte(schema.orders.created_at, today),
      ),
    );

  // Active orders
  const [activeStats] = await db
    .select({ count: count() })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.branch_id, tenant.branchId),
        inArray(schema.orders.status, ["pending", "confirmed", "preparing", "ready"]),
      ),
    );

  // Table stats
  const allTables = await db
    .select({ status: schema.tables.status })
    .from(schema.tables)
    .where(eq(schema.tables.branch_id, tenant.branchId));

  const totalTables = allTables.length;
  const occupiedTables = allTables.filter((t) => t.status === "occupied").length;

  const avgOrderValue =
    orderStats.totalOrders > 0
      ? Math.round(Number(orderStats.totalRevenue || 0) / orderStats.totalOrders)
      : 0;

  return c.json({
    success: true,
    data: {
      totalOrders: orderStats.totalOrders,
      totalRevenue: Number(orderStats.totalRevenue || 0),
      averageOrderValue: avgOrderValue,
      activeOrders: activeStats.count,
      occupiedTables,
      totalTables,
    },
  });
});

// GET /sales - Sales summary with daily breakdown and payment methods
reports.get(
  "/sales",
  requirePermission("reports:read"),
  zValidator("query", reportQuerySchema),
  async (c) => {
    const { startDate, endDate, scope } = c.req.valid("query");
    const tenant = c.get("tenant") as any;

    const start = new Date(startDate);
    const end = new Date(endDate);
    // Set end to end of day
    end.setHours(23, 59, 59, 999);

    // Legacy default matches the previous unqualified to_char() behavior,
    // which used the Postgres session timezone (UTC in production).
    const tz = tzLiteral(
      (await resolveTenantTimezone(tenant.organizationId, tenant.branchId)) ?? "UTC",
    );

    const statusCondition = await resolveReportStatusCondition(tenant.organizationId, scope);

    // Totals for the range
    const [totals] = await db
      .select({
        totalOrders: count(),
        totalRevenue: sum(schema.orders.total),
        totalTax: sum(schema.orders.tax),
        totalDiscount: sum(schema.orders.discount),
      })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.branch_id, tenant.branchId),
          gte(schema.orders.created_at, start),
          lte(schema.orders.created_at, end),
          statusCondition,
        ),
      );

    // Daily breakdown
    const dailyData = await db
      .select({
        date: sql<string>`to_char(${schema.orders.created_at} AT TIME ZONE ${tz}, 'YYYY-MM-DD')`,
        orders: count(),
        revenue: sum(schema.orders.total),
      })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.branch_id, tenant.branchId),
          gte(schema.orders.created_at, start),
          lte(schema.orders.created_at, end),
          statusCondition,
        ),
      )
      .groupBy(sql`to_char(${schema.orders.created_at} AT TIME ZONE ${tz}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${schema.orders.created_at} AT TIME ZONE ${tz}, 'YYYY-MM-DD')`);

    // Payment method breakdown - join in-scope orders with payments
    const completedOrders = await db
      .select({ id: schema.orders.id })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.branch_id, tenant.branchId),
          gte(schema.orders.created_at, start),
          lte(schema.orders.created_at, end),
          statusCondition,
        ),
      );

    let paymentMethods: { name: string; value: number }[] = [];
    if (completedOrders.length > 0) {
      const orderIds = completedOrders.map((o) => o.id);
      const pmData = await db
        .select({
          method: schema.payments.method,
          total: sum(schema.payments.amount),
        })
        .from(schema.payments)
        .where(
          and(
            inArray(schema.payments.order_id, orderIds),
            eq(schema.payments.status, "completed"),
          ),
        )
        .groupBy(schema.payments.method);

      const grandTotal = pmData.reduce((s, p) => s + Number(p.total || 0), 0);
      paymentMethods = pmData.map((p) => ({
        name: p.method,
        value: grandTotal > 0 ? Math.round((Number(p.total || 0) / grandTotal) * 100) : 0,
      }));
    }

    return c.json({
      success: true,
      data: {
        totalOrders: totals.totalOrders,
        totalRevenue: Number(totals.totalRevenue || 0),
        totalTax: Number(totals.totalTax || 0),
        totalDiscount: Number(totals.totalDiscount || 0),
        days: dailyData.map((d) => ({
          date: d.date,
          orders: d.orders,
          revenue: Number(d.revenue || 0),
        })),
        paymentMethods,
      },
    });
  },
);

// GET /top-items - Top selling items
reports.get(
  "/top-items",
  requirePermission("reports:read"),
  zValidator("query", reportQuerySchema),
  async (c) => {
    const { startDate, endDate, scope } = c.req.valid("query");
    const tenant = c.get("tenant") as any;

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const limitParam = c.req.query("limit");
    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 10, 50) : 10;

    const statusCondition = await resolveReportStatusCondition(tenant.organizationId, scope);

    // Get in-scope orders in range
    const completedOrders = await db
      .select({ id: schema.orders.id })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.branch_id, tenant.branchId),
          gte(schema.orders.created_at, start),
          lte(schema.orders.created_at, end),
          statusCondition,
        ),
      );

    if (completedOrders.length === 0) {
      return c.json({ success: true, data: [] });
    }

    const orderIds = completedOrders.map((o) => o.id);

    const topItems = await db
      .select({
        name: schema.orderItems.name,
        totalQuantity: sum(schema.orderItems.quantity),
        totalRevenue: sum(schema.orderItems.total),
      })
      .from(schema.orderItems)
      .where(inArray(schema.orderItems.order_id, orderIds))
      .groupBy(schema.orderItems.name)
      .orderBy(desc(sum(schema.orderItems.quantity)))
      .limit(limit);

    return c.json({
      success: true,
      data: topItems.map((item) => ({
        name: item.name,
        totalQuantity: Number(item.totalQuantity || 0),
        totalRevenue: Number(item.totalRevenue || 0),
      })),
    });
  },
);

// GET /inventory-consumption - Cross-report: menu items sold vs inventory consumed/purchased
reports.get(
  "/inventory-consumption",
  requirePermission("reports:read"),
  zValidator("query", reportQuerySchema),
  async (c) => {
    const { startDate, endDate } = c.req.valid("query");
    const tenant = c.get("tenant") as any;

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // All inventory items for this branch
    const allInventoryItems = await db
      .select()
      .from(schema.inventoryItems)
      .where(eq(schema.inventoryItems.branch_id, tenant.branchId))
      .orderBy(schema.inventoryItems.name);

    // Purchases (type = 'purchase') in this period
    const purchaseRows =
      allInventoryItems.length > 0
        ? await db
            .select({
              itemId: schema.inventoryMovements.item_id,
              purchased: sum(schema.inventoryMovements.quantity),
            })
            .from(schema.inventoryMovements)
            .where(
              and(
                inArray(
                  schema.inventoryMovements.item_id,
                  allInventoryItems.map((i) => i.id),
                ),
                eq(schema.inventoryMovements.type, "purchase"),
                gte(schema.inventoryMovements.created_at, start),
                lte(schema.inventoryMovements.created_at, end),
              ),
            )
            .groupBy(schema.inventoryMovements.item_id)
        : [];

    const purchaseMap = new Map(
      purchaseRows.map((r) => [r.itemId, Number(r.purchased || 0)]),
    );

    // All non-cancelled orders in range
    const ordersInRange = await db
      .select({ id: schema.orders.id })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.branch_id, tenant.branchId),
          gte(schema.orders.created_at, start),
          lte(schema.orders.created_at, end),
          sql`${schema.orders.status} != 'cancelled'`,
        ),
      );

    let menuItemsSold: {
      name: string;
      quantitySold: number;
      revenue: number;
    }[] = [];
    const consumedMap = new Map<string, number>();

    if (ordersInRange.length > 0) {
      const orderIds = ordersInRange.map((o) => o.id);

      // Menu items sold (aggregated by name snapshot)
      const soldRows = await db
        .select({
          name: schema.orderItems.name,
          quantitySold: sum(schema.orderItems.quantity),
          revenue: sum(schema.orderItems.total),
        })
        .from(schema.orderItems)
        .where(inArray(schema.orderItems.order_id, orderIds))
        .groupBy(schema.orderItems.name)
        .orderBy(desc(sum(schema.orderItems.quantity)));

      menuItemsSold = soldRows.map((r) => ({
        name: r.name,
        quantitySold: Number(r.quantitySold || 0),
        revenue: Number(r.revenue || 0),
      }));

      // Ingredient consumption = SUM(order_item.quantity * recipe.quantity_used)
      const consumedRows = await db
        .select({
          inventoryItemId: schema.recipeIngredients.inventory_item_id,
          consumed: sql<string>`SUM(${schema.orderItems.quantity}::numeric * ${schema.recipeIngredients.quantity_used}::numeric)`,
        })
        .from(schema.orderItems)
        .innerJoin(
          schema.recipeIngredients,
          eq(schema.orderItems.menu_item_id, schema.recipeIngredients.menu_item_id),
        )
        .where(inArray(schema.orderItems.order_id, orderIds))
        .groupBy(schema.recipeIngredients.inventory_item_id);

      for (const row of consumedRows) {
        consumedMap.set(row.inventoryItemId, Number(row.consumed || 0));
      }
    }

    const inventoryReport = allInventoryItems.map((item) => ({
      id: item.id,
      name: item.name,
      unit: item.unit,
      consumed: consumedMap.get(item.id) ?? 0,
      purchased: purchaseMap.get(item.id) ?? 0,
      currentStock: Number(item.current_stock),
      minStock: Number(item.min_stock),
      costPerUnit: item.cost_per_unit,
    }));

    return c.json({
      success: true,
      data: { menuItemsSold, inventoryReport },
    });
  },
);

// GET /historical - "Pedidos Retroativos": pre-launch orders imported from a manual WhatsApp
// export (Açaí House). Reads the standalone `historical_orders` table only — never touches the
// live `orders`/`customers` tables, so it can't affect current data. Flag-gated per org.
reports.get(
  "/historical",
  requirePermission("reports:read"),
  zValidator("query", historicalOrdersQuerySchema),
  async (c) => {
    const { year } = c.req.valid("query");
    const tenant = c.get("tenant") as any;

    const [org] = await db
      .select({ settings: schema.organizations.settings })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, tenant.organizationId))
      .limit(1);
    if (!hasHistoricalOrdersReport(org?.settings)) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Recurso não habilitado" } },
        404,
      );
    }

    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));

    const orders = await db
      .select()
      .from(schema.historicalOrders)
      .where(
        and(
          eq(schema.historicalOrders.branch_id, tenant.branchId),
          gte(schema.historicalOrders.order_date, start),
          lt(schema.historicalOrders.order_date, end),
        ),
      )
      .orderBy(desc(schema.historicalOrders.order_date));

    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((s, o) => s + o.total, 0);
    const averageOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

    // Monthly evolution (Jan-Dec of the selected year).
    const monthly = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, orders: 0, revenue: 0 }));
    for (const o of orders) {
      const m = monthly[new Date(o.order_date).getUTCMonth()];
      m.orders += 1;
      m.revenue += o.total;
    }

    // Payment method share (percent, for the donut chart).
    const paymentCounts = new Map<string, number>();
    for (const o of orders) {
      const key = o.payment_method ?? "não informado";
      paymentCounts.set(key, (paymentCounts.get(key) ?? 0) + 1);
    }
    const paymentMethods = [...paymentCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({
        name,
        value: totalOrders > 0 ? Math.round((count / totalOrders) * 1000) / 10 : 0,
      }));

    // Fulfillment breakdown (pickup vs delivery vs unknown).
    const fulfillmentCounts = new Map<string, number>();
    for (const o of orders) {
      fulfillmentCounts.set(o.fulfillment, (fulfillmentCounts.get(o.fulfillment) ?? 0) + 1);
    }
    const fulfillment = [...fulfillmentCounts.entries()].map(([name, count]) => ({
      name,
      count,
    }));

    // Best-effort item/complemento frequency, parsed from the raw ticket text (see caveat in
    // historical-item-mentions.ts) — no structured order_items table exists for this data.
    const topItems = rankItemMentions(orders, 20);

    return c.json({
      success: true,
      data: {
        orders,
        summary: { totalOrders, totalRevenue, averageOrderValue },
        monthly,
        paymentMethods,
        fulfillment,
        topItems,
      },
    });
  },
);

export { reports };
