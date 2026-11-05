import { eq, inArray, and, gte, sql } from "drizzle-orm";
import { db, schema } from "@restai/db";
import { logger } from "../lib/logger.js";
import {
  isWhatsAppConfigured,
  fetchConnectionState,
  sendWhatsAppText,
} from "../lib/whatsapp.js";
import {
  formatLowStockMessage,
  parseInventoryAlertConfig,
  worsenedLevel,
  type StockLevel,
} from "../lib/inventory-level.js";

export interface StockChange {
  before: number;
  after: number;
}

/**
 * Sends a WhatsApp alert to the branch's configured recipients when an item's
 * stock moved to a WORSE level (ok → low → critical → out) after a sale.
 *
 * Opt-in: does nothing unless `branch.settings.inventory_alert` is configured,
 * so other branches/orgs are unaffected. Never throws — it must not interfere
 * with order creation.
 */
export async function notifyInventoryLevelChanges(params: {
  branchId: string;
  branchName: string;
  branchSettings: unknown;
  /** inventory_item_id → stock before/after the deduction */
  changes: Map<string, StockChange>;
}): Promise<void> {
  try {
    const config = parseInventoryAlertConfig(params.branchSettings);
    if (!config || params.changes.size === 0 || !isWhatsAppConfigured()) return;

    const itemIds = [...params.changes.keys()];
    const items = await db
      .select({
        id: schema.inventoryItems.id,
        name: schema.inventoryItems.name,
        unit: schema.inventoryItems.unit,
        min_stock: schema.inventoryItems.min_stock,
      })
      .from(schema.inventoryItems)
      .where(inArray(schema.inventoryItems.id, itemIds));

    const alerts: { item: (typeof items)[number]; level: Exclude<StockLevel, "ok">; stock: number }[] = [];
    for (const item of items) {
      const change = params.changes.get(item.id);
      if (!change) continue;
      const level = worsenedLevel(change.before, change.after, parseFloat(item.min_stock));
      if (level) alerts.push({ item, level: level as Exclude<StockLevel, "ok">, stock: change.after });
    }
    if (alerts.length === 0) return;

    const { connected } = await fetchConnectionState(config.instance);
    if (!connected) {
      logger.warn("Inventory alert skipped: WhatsApp instance disconnected", {
        branchId: params.branchId,
        instance: config.instance,
      });
      return;
    }

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    for (const { item, level, stock } of alerts) {
      const [sales] = await db
        .select({
          total: sql<string>`COALESCE(SUM((${schema.recipeIngredients.quantity_used}::numeric * ${schema.orderItems.quantity})), 0)`,
        })
        .from(schema.orderItems)
        .innerJoin(schema.orders, eq(schema.orderItems.order_id, schema.orders.id))
        .innerJoin(
          schema.recipeIngredients,
          eq(schema.recipeIngredients.menu_item_id, schema.orderItems.menu_item_id),
        )
        .where(
          and(
            eq(schema.recipeIngredients.inventory_item_id, item.id),
            eq(schema.orders.branch_id, params.branchId),
            sql`${schema.orders.status} <> 'cancelled'`,
            gte(schema.orders.created_at, since),
          ),
        );

      const message = formatLowStockMessage({
        level,
        branchName: params.branchName,
        itemName: item.name,
        unit: item.unit,
        stock,
        minStock: parseFloat(item.min_stock),
        consumption7d: parseFloat(sales?.total ?? "0"),
      });

      const results = await Promise.allSettled(
        config.phones.map((phone) =>
          sendWhatsAppText(config.instance, phone, message, { countryCode: config.countryCode }),
        ),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      logger.info("Inventory low-stock alert sent", {
        branchId: params.branchId,
        item: item.name,
        level,
        recipients: config.phones.length,
        failed,
      });
    }
  } catch (err) {
    logger.error("Inventory alert error", {
      branchId: params.branchId,
      error: (err as Error).message,
    });
  }
}
