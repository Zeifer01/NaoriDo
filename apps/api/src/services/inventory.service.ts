import { eq, sql, and, inArray, gte } from "drizzle-orm";
import { db, schema } from "@restai/db";

/**
 * Records an inventory movement and updates the item's stock accordingly.
 * Returns the created movement record.
 * Throws if the inventory item is not found.
 */
export async function recordMovement(params: {
  itemId: string;
  type: "purchase" | "consumption" | "waste" | "adjustment";
  quantity: number;
  reference?: string | null;
  notes?: string | null;
  createdBy?: string | null;
}): Promise<typeof schema.inventoryMovements.$inferSelect> {
  const { itemId, type, quantity, reference, notes, createdBy } = params;

  return await db.transaction(async (tx) => {
    // Read inside transaction with row lock
    const [item] = await tx
      .select()
      .from(schema.inventoryItems)
      .where(eq(schema.inventoryItems.id, itemId))
      .limit(1)
      .for("update");

    if (!item) {
      throw new InventoryItemNotFoundError(`Item não encontrado: ${itemId}`);
    }

    const [movement] = await tx
      .insert(schema.inventoryMovements)
      .values({
        item_id: itemId,
        type,
        quantity: String(quantity),
        reference: reference || null,
        notes: notes || null,
        created_by: createdBy || null,
      })
      .returning();

    // Atomic stock update using SQL
    if (type === "purchase" || type === "adjustment") {
      await tx.update(schema.inventoryItems).set({
        current_stock: sql`(${schema.inventoryItems.current_stock}::numeric + ${quantity})::numeric`,
      }).where(eq(schema.inventoryItems.id, itemId));
    } else {
      await tx.update(schema.inventoryItems).set({
        current_stock: sql`(${schema.inventoryItems.current_stock}::numeric - ${quantity})::numeric`,
      }).where(eq(schema.inventoryItems.id, itemId));
    }

    return movement;
  });
}

/**
 * Auto-deducts inventory for a completed order based on recipe ingredients.
 * Checks if inventory tracking is enabled for the branch.
 * Marks the order as inventory_deducted to prevent double deduction.
 */
export async function deductForOrder(params: {
  orderId: string;
  orderNumber: string;
  branchId: string;
}): Promise<void> {
  const { orderId, orderNumber, branchId } = params;

  // Check if inventory is enabled for this branch
  const [branchSettings] = await db
    .select({ settings: schema.branches.settings })
    .from(schema.branches)
    .where(eq(schema.branches.id, branchId))
    .limit(1);

  const inventoryEnabled = (branchSettings?.settings as any)?.inventory_enabled;

  if (!inventoryEnabled) {
    return;
  }

  const [order] = await db
    .select({ inventory_deducted: schema.orders.inventory_deducted })
    .from(schema.orders)
    .where(eq(schema.orders.id, orderId))
    .limit(1);

  if (order?.inventory_deducted) {
    return;
  }

  const orderItemsList = await db
    .select()
    .from(schema.orderItems)
    .where(eq(schema.orderItems.order_id, orderId));

  // Wrap all deductions + flag in a transaction
  await db.transaction(async (tx) => {
    for (const orderItem of orderItemsList) {
      const recipeIngredients = await tx
        .select()
        .from(schema.recipeIngredients)
        .where(eq(schema.recipeIngredients.menu_item_id, orderItem.menu_item_id));

      for (const ingredient of recipeIngredients) {
        const deductQty = parseFloat(ingredient.quantity_used) * orderItem.quantity;

        await tx
          .update(schema.inventoryItems)
          .set({
            current_stock: sql`(${schema.inventoryItems.current_stock}::numeric - ${deductQty})::numeric`,
          })
          .where(eq(schema.inventoryItems.id, ingredient.inventory_item_id));

        await tx
          .insert(schema.inventoryMovements)
          .values({
            item_id: ingredient.inventory_item_id,
            type: "consumption",
            quantity: String(deductQty),
            reference: orderNumber,
            notes: `Venda: ${orderItem.name} x${orderItem.quantity}`,
          });
      }
    }

    await tx
      .update(schema.orders)
      .set({ inventory_deducted: true })
      .where(eq(schema.orders.id, orderId));
  });
}

/**
 * Restores inventory when an order is cancelled after stock was deducted.
 */
export async function restoreForOrder(params: {
  orderId: string;
  orderNumber: string;
  branchId: string;
}): Promise<void> {
  const { orderId, orderNumber, branchId } = params;

  const [branchSettings] = await db
    .select({ settings: schema.branches.settings })
    .from(schema.branches)
    .where(eq(schema.branches.id, branchId))
    .limit(1);

  const inventoryEnabled = (branchSettings?.settings as any)?.inventory_enabled;
  if (!inventoryEnabled) {
    return;
  }

  const [order] = await db
    .select({ inventory_deducted: schema.orders.inventory_deducted })
    .from(schema.orders)
    .where(eq(schema.orders.id, orderId))
    .limit(1);

  if (!order?.inventory_deducted) {
    return;
  }

  const orderItemsList = await db
    .select()
    .from(schema.orderItems)
    .where(eq(schema.orderItems.order_id, orderId));

  await db.transaction(async (tx) => {
    for (const orderItem of orderItemsList) {
      const recipeIngredients = await tx
        .select()
        .from(schema.recipeIngredients)
        .where(eq(schema.recipeIngredients.menu_item_id, orderItem.menu_item_id));

      for (const ingredient of recipeIngredients) {
        const restoreQty = parseFloat(ingredient.quantity_used) * orderItem.quantity;

        await tx
          .update(schema.inventoryItems)
          .set({
            current_stock: sql`(${schema.inventoryItems.current_stock}::numeric + ${restoreQty})::numeric`,
          })
          .where(eq(schema.inventoryItems.id, ingredient.inventory_item_id));

        await tx
          .insert(schema.inventoryMovements)
          .values({
            item_id: ingredient.inventory_item_id,
            type: "adjustment",
            quantity: String(restoreQty),
            reference: orderNumber,
            notes: `Estorno cancelamento: ${orderItem.name} x${orderItem.quantity}`,
          });
      }
    }

    await tx
      .update(schema.orders)
      .set({ inventory_deducted: false })
      .where(eq(schema.orders.id, orderId));
  });
}

/**
 * Custom error for when an inventory item is not found.
 */
export class InventoryItemNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryItemNotFoundError";
  }
}

export type PurchaseProjectionRow = {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
  min_stock: number;
  consumption_7d: number;
  deficit: number;
  suggested_purchase: number;
  linked_to_menu: boolean;
};

/**
 * Purchase projection per stock item: current levels, 7-day usage from sales
 * (via menu links) and movements, and suggested reorder quantity.
 */
export async function getPurchaseProjection(params: {
  branchId: string;
  organizationId: string;
}): Promise<PurchaseProjectionRow[]> {
  const { branchId, organizationId } = params;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const items = await db
    .select({
      id: schema.inventoryItems.id,
      name: schema.inventoryItems.name,
      unit: schema.inventoryItems.unit,
      current_stock: schema.inventoryItems.current_stock,
      min_stock: schema.inventoryItems.min_stock,
    })
    .from(schema.inventoryItems)
    .where(
      and(
        eq(schema.inventoryItems.branch_id, branchId),
        eq(schema.inventoryItems.organization_id, organizationId),
      ),
    );

  if (items.length === 0) {
    return [];
  }

  const itemIds = items.map((item) => item.id);

  const movementConsumption = await db
    .select({
      item_id: schema.inventoryMovements.item_id,
      total: sql<string>`COALESCE(SUM(${schema.inventoryMovements.quantity}::numeric), 0)`,
    })
    .from(schema.inventoryMovements)
    .where(
      and(
        inArray(schema.inventoryMovements.item_id, itemIds),
        eq(schema.inventoryMovements.type, "consumption"),
        gte(schema.inventoryMovements.created_at, sevenDaysAgo),
      ),
    )
    .groupBy(schema.inventoryMovements.item_id);

  const salesConsumption = await db
    .select({
      inventory_item_id: schema.recipeIngredients.inventory_item_id,
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
        eq(schema.orders.branch_id, branchId),
        eq(schema.orders.organization_id, organizationId),
        sql`${schema.orders.status} <> 'cancelled'`,
        gte(schema.orders.created_at, sevenDaysAgo),
      ),
    )
    .groupBy(schema.recipeIngredients.inventory_item_id);

  const linkedRows = await db
    .select({ inventory_item_id: schema.recipeIngredients.inventory_item_id })
    .from(schema.recipeIngredients)
    .innerJoin(
      schema.inventoryItems,
      eq(schema.recipeIngredients.inventory_item_id, schema.inventoryItems.id),
    )
    .where(
      and(
        eq(schema.inventoryItems.branch_id, branchId),
        eq(schema.inventoryItems.organization_id, organizationId),
      ),
    );

  const consumptionByItem = new Map<string, number>();
  for (const row of salesConsumption) {
    consumptionByItem.set(row.inventory_item_id, parseFloat(row.total));
  }
  for (const row of movementConsumption) {
    const fromMovements = parseFloat(row.total);
    const current = consumptionByItem.get(row.item_id) ?? 0;
    consumptionByItem.set(row.item_id, Math.max(current, fromMovements));
  }

  const linkedItemIds = new Set(linkedRows.map((row) => row.inventory_item_id));

  return items
    .map((item) => {
      const currentStock = parseFloat(item.current_stock);
      const minStock = parseFloat(item.min_stock);
      const consumption7d = consumptionByItem.get(item.id) ?? 0;
      const deficit = Math.max(0, minStock - currentStock);
      const suggestedPurchase = Math.max(deficit, consumption7d);

      return {
        id: item.id,
        name: item.name,
        unit: item.unit,
        current_stock: currentStock,
        min_stock: minStock,
        consumption_7d: consumption7d,
        deficit,
        suggested_purchase: suggestedPurchase,
        linked_to_menu: linkedItemIds.has(item.id),
      };
    })
    .sort((a, b) => {
      const aNeeds = a.suggested_purchase > 0 || a.deficit > 0;
      const bNeeds = b.suggested_purchase > 0 || b.deficit > 0;
      if (aNeeds !== bNeeds) return aNeeds ? -1 : 1;
      return a.name.localeCompare(b.name, "pt-BR");
    });
}
