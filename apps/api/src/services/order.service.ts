import { eq, and, inArray, sql, isNull } from "drizzle-orm";
import { db, schema, type DbOrTx } from "@restai/db";
import { getDeliveryFeeCents } from "@restai/config";
import { allocateOrderNumber, resetBranchOrderSequence, archiveCurrentSession } from "../lib/order-number.js";
import { logger } from "../lib/logger.js";
import { awardPoints } from "./loyalty.service.js";
import { deductForOrder, restoreForOrder } from "./inventory.service.js";

// Estados em que um pedido AINDA pode ter seus itens editados pelo staff.
// Decisão de produto: permitir edição até "served" (antes de "completed" / "cancelled").
const EDITABLE_ORDER_STATUSES = new Set([
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "served",
]);

export function isOrderEditable(status: string): boolean {
  return EDITABLE_ORDER_STATUSES.has(status);
}

// Types for order creation input
interface OrderItemInput {
  menuItemId: string;
  quantity: number;
  notes?: string;
  modifiers?: Array<{ modifierId: string }>;
}

interface CreateOrderParams {
  organizationId: string;
  branchId: string;
  items: OrderItemInput[];
  type: string;
  customerName?: string | null;
  notes?: string | null;
  tableSessionId?: string | null;
  customerId?: string | null;
  couponCode?: string | null;
  redemptionId?: string | null;
  deliveryPhone?: string | null;
  deliveryAddress?: string | null;
  deliveryReference?: string | null;
  paymentMethod?: string | null;
  deliveryFeeOverrideCents?: number | null;
}

interface CreateOrderResult {
  order: typeof schema.orders.$inferSelect;
  items: (typeof schema.orderItems.$inferSelect)[];
}

/**
 * Validates menu items and creates an order with its items.
 * Returns the created order and items, or throws an error if validation fails.
 */
export async function createOrder(params: CreateOrderParams): Promise<CreateOrderResult> {
  const {
    organizationId,
    branchId,
    items,
    type,
    customerName,
    notes,
    tableSessionId,
    customerId,
    couponCode,
    redemptionId,
    deliveryPhone,
    deliveryAddress,
    deliveryReference,
    paymentMethod,
    deliveryFeeOverrideCents,
  } = params;

  // Get menu items for price calculation
  const menuItemIds = items.map((i) => i.menuItemId);
  const menuItemsResult = await db
    .select()
    .from(schema.menuItems)
    .where(inArray(schema.menuItems.id, menuItemIds));

  const menuItemMap = new Map(menuItemsResult.map((mi) => [mi.id, mi]));

  // Collect all modifier IDs and fetch their prices
  const allModifierIds = items.flatMap(
    (i) => i.modifiers?.map((m) => m.modifierId) || [],
  );

  let modifierMap = new Map<
    string,
    { id: string; name: string; price: number }
  >();
  if (allModifierIds.length > 0) {
    const modifierRecords = await db
      .select({
        id: schema.modifiers.id,
        name: schema.modifiers.name,
        price: schema.modifiers.price,
      })
      .from(schema.modifiers)
      .where(inArray(schema.modifiers.id, allModifierIds));
    modifierMap = new Map(modifierRecords.map((m) => [m.id, m]));
  }

  // Validate items and calculate totals
  let subtotal = 0;
  const orderItemsData: Array<{
    menu_item_id: string;
    name: string;
    unit_price: number;
    quantity: number;
    total: number;
    notes?: string;
    modifiers: Array<{ modifierId: string }>;
  }> = [];

  for (const item of items) {
    const menuItem = menuItemMap.get(item.menuItemId);
    if (!menuItem) {
      throw new OrderValidationError(`Item não encontrado: ${item.menuItemId}`);
    }
    if (!menuItem.is_available) {
      throw new OrderValidationError(`Item indisponível: ${menuItem.name}`);
    }

    let modifierPricePerUnit = 0;
    if (item.modifiers?.length) {
      for (const mod of item.modifiers) {
        const modifier = modifierMap.get(mod.modifierId);
        if (modifier) modifierPricePerUnit += modifier.price;
      }
    }

    const itemTotal = (menuItem.price + modifierPricePerUnit) * item.quantity;
    subtotal += itemTotal;

    orderItemsData.push({
      menu_item_id: menuItem.id,
      name: menuItem.name,
      unit_price: menuItem.price,
      quantity: item.quantity,
      total: itemTotal,
      notes: item.notes,
      modifiers: item.modifiers || [],
    });
  }

  // Get branch tax rate and settings
  const [branch] = await db
    .select({
      tax_rate: schema.branches.tax_rate,
      settings: schema.branches.settings,
    })
    .from(schema.branches)
    .where(eq(schema.branches.id, branchId))
    .limit(1);

  const taxRate = branch?.tax_rate ?? 1800;
  const branchSettings = (branch?.settings || {}) as Record<string, unknown>;
  const deliveryFee =
    type === "delivery"
      ? (deliveryFeeOverrideCents ?? getDeliveryFeeCents(branchSettings))
      : 0;

  // Create order + items + coupon redemption in a transaction
  // Coupon validation is INSIDE the transaction to prevent race conditions on current_uses
  return await db.transaction(async (tx) => {
    const orderNumber = await allocateOrderNumber(tx, branchId);

    // Calculate coupon discount inside tx
    let discount = 0;
    let couponId: string | null = null;

    if (couponCode) {
      const couponResult = await applyCoupon({
        couponCode,
        organizationId,
        orderItems: orderItemsData,
        subtotal,
        customerId: customerId || null,
      }, tx);
      discount = couponResult.discount;
      couponId = couponResult.couponId;
    }

    // Apply reward redemption discount (stacks with coupon)
    let redemptionDiscount = 0;
    if (redemptionId) {
      const rd = await applyRedemption({ redemptionId, customerId: customerId || null, subtotal, couponDiscount: discount }, tx);
      redemptionDiscount = rd.discount;
    }

    discount += redemptionDiscount;

    // IGV se calcula sobre la base imponible (subtotal - descuento)
    const taxableBase = subtotal - discount;
    const tax = Math.round((taxableBase * taxRate) / 10000);
    const total = taxableBase + tax + deliveryFee;

    const [order] = await tx
      .insert(schema.orders)
      .values({
        organization_id: organizationId,
        branch_id: branchId,
        table_session_id: tableSessionId || null,
        customer_id: customerId || null,
        order_number: orderNumber,
        type: type as any,
        status: "pending",
        customer_name: customerName || null,
        delivery_phone: deliveryPhone || null,
        delivery_address: deliveryAddress || null,
        delivery_reference: deliveryReference || null,
        delivery_fee: deliveryFee,
        subtotal,
        tax,
        discount,
        total,
        payment_method: paymentMethod || null,
        notes: notes || null,
      })
      .returning();

    const createdItems = await tx
      .insert(schema.orderItems)
      .values(
        orderItemsData.map(({ modifiers: _mods, ...item }) => ({
          order_id: order.id,
          ...item,
        })),
      )
      .returning();

    // Insert order item modifiers
    for (let i = 0; i < createdItems.length; i++) {
      const itemData = orderItemsData[i];
      if (itemData.modifiers.length > 0) {
        await tx.insert(schema.orderItemModifiers).values(
          itemData.modifiers.map((mod) => {
            const modifier = modifierMap.get(mod.modifierId);
            return {
              order_item_id: createdItems[i].id,
              modifier_id: mod.modifierId,
              name: modifier?.name || "Modificador",
              price: modifier?.price || 0,
            };
          }),
        );
      }
    }

    // Link reward redemption to order
    if (redemptionId && redemptionDiscount > 0) {
      await tx
        .update(schema.rewardRedemptions)
        .set({ order_id: order.id })
        .where(eq(schema.rewardRedemptions.id, redemptionId));
    }

    // Record coupon redemption
    if (couponId) {
      await tx.insert(schema.couponRedemptions).values({
        coupon_id: couponId,
        customer_id: customerId || null,
        order_id: order.id,
        discount_applied: discount,
      });
      // Increment current_uses
      await tx
        .update(schema.coupons)
        .set({ current_uses: sql`${schema.coupons.current_uses} + 1` })
        .where(eq(schema.coupons.id, couponId));

      // Update couponAssignment used_at if customer is known
      if (customerId) {
        await tx
          .update(schema.couponAssignments)
          .set({ used_at: new Date() })
          .where(
            and(
              eq(schema.couponAssignments.coupon_id, couponId),
              eq(schema.couponAssignments.customer_id, customerId),
            ),
          );
      }
    }

    return { order, items: createdItems };
  }).then(async (result) => {
    try {
      await deductForOrder({
        orderId: result.order.id,
        orderNumber: result.order.order_number,
        branchId,
      });
    } catch (err) {
      logger.error("Inventory deduction error on order creation", {
        orderId: result.order.id,
        error: (err as Error).message,
      });
    }
    return result;
  });
}

// ---------------------------------------------------------------------------
// Coupon discount calculation
// ---------------------------------------------------------------------------

interface ApplyCouponParams {
  couponCode: string;
  organizationId: string;
  orderItems: Array<{ menu_item_id: string; unit_price: number; quantity: number; total: number }>;
  subtotal: number;
  customerId: string | null;
}

type TxOrDb = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function applyCoupon(params: ApplyCouponParams, tx: TxOrDb): Promise<{ discount: number; couponId: string }> {
  const { couponCode, organizationId, orderItems, subtotal, customerId } = params;

  const [coupon] = await tx
    .select()
    .from(schema.coupons)
    .where(
      and(
        eq(schema.coupons.organization_id, organizationId),
        eq(schema.coupons.code, couponCode.toUpperCase()),
        eq(schema.coupons.status, "active"),
      ),
    )
    .limit(1);

  if (!coupon) {
    throw new OrderValidationError("Cupom não encontrado ou inativo");
  }

  // Validate usage limits
  if (coupon.max_uses_total && coupon.current_uses >= coupon.max_uses_total) {
    throw new OrderValidationError("O cupom atingiu o limite de usos");
  }

  // Validate per-customer usage limit
  if (coupon.max_uses_per_customer && customerId) {
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.couponRedemptions)
      .where(
        and(
          eq(schema.couponRedemptions.coupon_id, coupon.id),
          eq(schema.couponRedemptions.customer_id, customerId),
        ),
      );
    if (count >= coupon.max_uses_per_customer) {
      throw new OrderValidationError("Você já usou este cupom o máximo de vezes permitido");
    }
  }

  // Validate date range
  const now = new Date();
  if (coupon.starts_at && now < coupon.starts_at) {
    throw new OrderValidationError("O cupom ainda não está vigente");
  }
  if (coupon.expires_at && now > coupon.expires_at) {
    throw new OrderValidationError("O cupom expirou");
  }

  // Validate min order amount
  if (coupon.min_order_amount && subtotal < coupon.min_order_amount) {
    throw new OrderValidationError(
      `O pedido mínimo para este cupom é S/ ${(coupon.min_order_amount / 100).toFixed(2)}`,
    );
  }

  let discount = 0;

  switch (coupon.type) {
    case "percentage": {
      discount = Math.round(subtotal * ((coupon.discount_value || 0) / 100));
      break;
    }
    case "fixed": {
      discount = Math.min(coupon.discount_value || 0, subtotal);
      break;
    }
    case "item_free": {
      // Make one unit of a qualifying item free
      if (coupon.menu_item_id) {
        // Specific item must be free
        const match = orderItems.find((i) => i.menu_item_id === coupon.menu_item_id);
        if (match) {
          discount = match.unit_price; // 1 unit free
        }
      } else {
        // No specific item — cheapest item is free
        const cheapest = orderItems.reduce(
          (min, i) => (i.unit_price < min.unit_price ? i : min),
          orderItems[0],
        );
        if (cheapest) {
          discount = cheapest.unit_price;
        }
      }
      break;
    }
    case "item_discount": {
      // Discount on a specific item
      if (coupon.menu_item_id) {
        const match = orderItems.find((i) => i.menu_item_id === coupon.menu_item_id);
        if (match) {
          discount = Math.round(match.total * ((coupon.discount_value || 0) / 100));
        }
      }
      break;
    }
    case "category_discount": {
      // Discount on items in a category — need to check category
      if (coupon.category_id) {
        const categoryItemIds = await tx
          .select({ id: schema.menuItems.id })
          .from(schema.menuItems)
          .where(eq(schema.menuItems.category_id, coupon.category_id));
        const catIds = new Set(categoryItemIds.map((c) => c.id));
        const matchingTotal = orderItems
          .filter((i) => catIds.has(i.menu_item_id))
          .reduce((sum, i) => sum + i.total, 0);
        discount = Math.round(matchingTotal * ((coupon.discount_value || 0) / 100));
      }
      break;
    }
    case "buy_x_get_y": {
      // Buy X items, get Y free (cheapest ones)
      const totalQty = orderItems.reduce((sum, i) => sum + i.quantity, 0);
      const buyQty = coupon.buy_quantity || 0;
      const getQty = coupon.get_quantity || 0;
      if (totalQty >= buyQty + getQty) {
        // Sort items by unit price ascending, make the cheapest getQty items free
        const expanded = orderItems.flatMap((i) =>
          Array.from({ length: i.quantity }, () => i.unit_price),
        );
        expanded.sort((a, b) => a - b);
        discount = expanded.slice(0, getQty).reduce((sum, p) => sum + p, 0);
      }
      break;
    }
  }

  // Apply max discount cap
  if (coupon.max_discount_amount && discount > coupon.max_discount_amount) {
    discount = coupon.max_discount_amount;
  }

  // Ensure discount doesn't exceed subtotal
  discount = Math.min(discount, subtotal);

  return { discount, couponId: coupon.id };
}

// ---------------------------------------------------------------------------
// Reward redemption discount calculation
// ---------------------------------------------------------------------------

interface ApplyRedemptionParams {
  redemptionId: string;
  customerId: string | null;
  subtotal: number;
  couponDiscount: number;
}

async function applyRedemption(params: ApplyRedemptionParams, tx: TxOrDb): Promise<{ discount: number }> {
  const { redemptionId, customerId, subtotal, couponDiscount } = params;

  // Fetch the pending redemption (order_id IS NULL = not yet used)
  const [redemption] = await tx
    .select({
      id: schema.rewardRedemptions.id,
      customer_loyalty_id: schema.rewardRedemptions.customer_loyalty_id,
      discount_type: schema.rewards.discount_type,
      discount_value: schema.rewards.discount_value,
    })
    .from(schema.rewardRedemptions)
    .innerJoin(schema.rewards, eq(schema.rewardRedemptions.reward_id, schema.rewards.id))
    .where(
      and(
        eq(schema.rewardRedemptions.id, redemptionId),
        isNull(schema.rewardRedemptions.order_id),
      ),
    )
    .limit(1);

  if (!redemption) {
    throw new OrderValidationError("Resgate não encontrado ou já foi utilizado");
  }

  // Validate ownership: redemption must belong to this customer
  if (customerId) {
    const [enrollment] = await tx
      .select({ customer_id: schema.customerLoyalty.customer_id })
      .from(schema.customerLoyalty)
      .where(eq(schema.customerLoyalty.id, redemption.customer_loyalty_id))
      .limit(1);

    if (!enrollment || enrollment.customer_id !== customerId) {
      throw new OrderValidationError("Este resgate não pertence a você");
    }
  }

  // Calculate discount on the remaining amount after coupon
  const remainingSubtotal = subtotal - couponDiscount;
  let discount = 0;

  if (redemption.discount_type === "percentage") {
    discount = Math.round(remainingSubtotal * (redemption.discount_value / 100));
  } else {
    // fixed amount
    discount = Math.min(redemption.discount_value, remainingSubtotal);
  }

  discount = Math.max(0, Math.min(discount, remainingSubtotal));

  return { discount };
}

/**
 * Handles side effects when an order transitions to "completed":
 * - Awards loyalty points (if customer has enrollment)
 * - Deducts inventory (if enabled and not already deducted)
 */
export async function handleOrderCompletion(params: {
  orderId: string;
  orderNumber: string;
  orderTotal: number;
  customerId: string | null;
  organizationId: string;
  branchId: string;
  inventoryDeducted: boolean;
}): Promise<void> {
  const {
    orderId,
    orderNumber,
    orderTotal,
    customerId,
    organizationId,
    branchId,
    inventoryDeducted,
  } = params;

  // Award loyalty points
  if (customerId) {
    try {
      await awardPoints({
        customerId,
        orderId,
        orderTotal,
        orderNumber,
        organizationId,
      });
    } catch (err) {
      logger.error("Error awarding loyalty points", { orderId, error: (err as Error).message });
    }
  }

  // Deduct inventory
  if (!inventoryDeducted) {
    try {
      await deductForOrder({
        orderId,
        orderNumber,
        branchId,
      });
    } catch (err) {
      logger.error("Inventory deduction error", { orderId, error: (err as Error).message });
    }
  }
}

async function cleanupOrderReferences(tx: DbOrTx, orderIds: string[]) {
  if (orderIds.length === 0) return;

  await tx
    .delete(schema.couponRedemptions)
    .where(inArray(schema.couponRedemptions.order_id, orderIds));
  await tx
    .delete(schema.loyaltyTransactions)
    .where(inArray(schema.loyaltyTransactions.order_id, orderIds));
  await tx
    .delete(schema.rewardRedemptions)
    .where(inArray(schema.rewardRedemptions.order_id, orderIds));
}

export async function deleteOrder(params: {
  orderId: string;
  branchId: string;
  organizationId: string;
}): Promise<void> {
  const { orderId, branchId, organizationId } = params;

  const [order] = await db
    .select()
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.id, orderId),
        eq(schema.orders.branch_id, branchId),
        eq(schema.orders.organization_id, organizationId),
      ),
    )
    .limit(1);

  if (!order) {
    throw new OrderNotFoundError("Pedido não encontrado");
  }

  if (order.inventory_deducted) {
    try {
      await restoreForOrder({
        orderId: order.id,
        orderNumber: order.order_number,
        branchId,
      });
    } catch (err) {
      logger.error("Inventory restore error on delete", {
        orderId: order.id,
        error: (err as Error).message,
      });
    }
  }

  await db.transaction(async (tx) => {
    await cleanupOrderReferences(tx, [orderId]);
    await tx.delete(schema.orders).where(eq(schema.orders.id, orderId));
  });
}

export async function resetBranchOrders(params: {
  branchId: string;
  organizationId: string;
}): Promise<{ deletedCount: number }> {
  const { branchId, organizationId } = params;

  const orders = await db
    .select({
      id: schema.orders.id,
      order_number: schema.orders.order_number,
      inventory_deducted: schema.orders.inventory_deducted,
    })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.branch_id, branchId),
        eq(schema.orders.organization_id, organizationId),
      ),
    );

  for (const order of orders) {
    if (!order.inventory_deducted) continue;
    try {
      await restoreForOrder({
        orderId: order.id,
        orderNumber: order.order_number,
        branchId,
      });
    } catch (err) {
      logger.error("Inventory restore error on reset", {
        orderId: order.id,
        error: (err as Error).message,
      });
    }
  }

  const orderIds = orders.map((order) => order.id);

  await db.transaction(async (tx) => {
    await cleanupOrderReferences(tx, orderIds);
    if (orderIds.length > 0) {
      await tx.delete(schema.orders).where(inArray(schema.orders.id, orderIds));
    }
    await resetBranchOrderSequence(tx, branchId);
  });

  return { deletedCount: orderIds.length };
}

export async function archiveBranchOrderSession(params: {
  branchId: string;
}): Promise<{ archivedCount: number; sessionName: string; nextSessionName: string }> {
  const { branchId } = params;
  return await db.transaction(async (tx) => {
    return await archiveCurrentSession(tx, branchId);
  });
}

/**
 * Custom error class for order validation failures.
 * Route handlers catch this to return 400 responses.
 */
export class OrderValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderValidationError";
  }
}

export class OrderNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderNotFoundError";
  }
}

// ---------------------------------------------------------------------------
// EDIÇÃO DE PEDIDOS EXISTENTES (Fase B)
// ---------------------------------------------------------------------------

interface OrderWithMeta {
  order: typeof schema.orders.$inferSelect;
  items: (typeof schema.orderItems.$inferSelect)[];
  paymentStatus: "paid" | "partial" | "unpaid";
  totalPaid: number;
}

async function loadOrderWithMeta(orderId: string, branchId: string): Promise<OrderWithMeta> {
  const [order] = await db
    .select()
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.id, orderId),
        eq(schema.orders.branch_id, branchId),
      ),
    )
    .limit(1);

  if (!order) {
    throw new OrderNotFoundError("Pedido não encontrado");
  }

  const items = await db
    .select()
    .from(schema.orderItems)
    .where(eq(schema.orderItems.order_id, order.id));

  const [paidAgg] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${schema.payments.amount})::int, 0)`,
    })
    .from(schema.payments)
    .where(
      and(
        eq(schema.payments.order_id, order.id),
        eq(schema.payments.status, "completed"),
      ),
    );

  const totalPaid = paidAgg?.total ?? 0;
  const paymentStatus: OrderWithMeta["paymentStatus"] =
    totalPaid >= order.total && order.total > 0
      ? "paid"
      : totalPaid > 0
        ? "partial"
        : "unpaid";

  return { order, items, paymentStatus, totalPaid };
}

function assertEditable(order: typeof schema.orders.$inferSelect): void {
  if (!isOrderEditable(order.status)) {
    throw new OrderValidationError(
      `Este pedido não pode mais ser editado (estado atual: ${order.status})`,
    );
  }
}

/**
 * Recalcula subtotal/tax/total a partir dos itens atuais de um pedido.
 * Preserva discount e delivery_fee. Atualiza a tabela orders.
 */
async function recalculateOrderTotals(
  tx: DbOrTx,
  orderId: string,
): Promise<typeof schema.orders.$inferSelect> {
  const [order] = await tx
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.id, orderId))
    .limit(1);

  if (!order) throw new OrderNotFoundError("Pedido não encontrado");

  const items = await tx
    .select({ total: schema.orderItems.total })
    .from(schema.orderItems)
    .where(eq(schema.orderItems.order_id, orderId));

  const subtotal = items.reduce((s, it) => s + it.total, 0);

  const [branch] = await tx
    .select({ tax_rate: schema.branches.tax_rate })
    .from(schema.branches)
    .where(eq(schema.branches.id, order.branch_id))
    .limit(1);

  const taxRate = branch?.tax_rate ?? 0;
  const taxableBase = Math.max(0, subtotal - order.discount);
  const tax = Math.round((taxableBase * taxRate) / 10000);
  const total = taxableBase + tax + order.delivery_fee;

  const [updated] = await tx
    .update(schema.orders)
    .set({ subtotal, tax, total, updated_at: new Date() })
    .where(eq(schema.orders.id, orderId))
    .returning();

  return updated;
}

/**
 * Ajusta estoque incrementalmente para uma variação de quantidade de um item.
 * delta > 0 = mais unidades vendidas (deduz estoque)
 * delta < 0 = menos unidades vendidas (devolve estoque)
 * Só faz efeito se o branch tem inventory_enabled. Não depende de
 * inventory_deducted — edições em pedidos históricos (feira, pedidos
 * criados com inventário desativado) também atualizam o estoque corretamente.
 */
async function adjustInventoryForItem(params: {
  branchId: string;
  orderId: string;
  orderNumber: string;
  menuItemId: string;
  itemSnapshotName: string;
  delta: number;
}): Promise<void> {
  const { branchId, orderId: _orderId, orderNumber, menuItemId, itemSnapshotName, delta } = params;
  if (delta === 0) return;

  const [branch] = await db
    .select({ settings: schema.branches.settings })
    .from(schema.branches)
    .where(eq(schema.branches.id, branchId))
    .limit(1);

  const inventoryEnabled = (branch?.settings as Record<string, unknown> | undefined)?.[
    "inventory_enabled"
  ];
  if (!inventoryEnabled) return;

  const recipeIngredients = await db
    .select()
    .from(schema.recipeIngredients)
    .where(eq(schema.recipeIngredients.menu_item_id, menuItemId));

  await db.transaction(async (tx) => {
    for (const ing of recipeIngredients) {
      const qty = parseFloat(ing.quantity_used) * Math.abs(delta);
      if (delta > 0) {
        // Vender mais → deduzir
        await tx
          .update(schema.inventoryItems)
          .set({
            current_stock: sql`(${schema.inventoryItems.current_stock}::numeric - ${qty})::numeric`,
          })
          .where(eq(schema.inventoryItems.id, ing.inventory_item_id));
        await tx.insert(schema.inventoryMovements).values({
          item_id: ing.inventory_item_id,
          type: "consumption",
          quantity: String(qty),
          reference: orderNumber,
          notes: `Edição: +${delta}x ${itemSnapshotName}`,
        });
      } else {
        // Vender menos → devolver
        await tx
          .update(schema.inventoryItems)
          .set({
            current_stock: sql`(${schema.inventoryItems.current_stock}::numeric + ${qty})::numeric`,
          })
          .where(eq(schema.inventoryItems.id, ing.inventory_item_id));
        await tx.insert(schema.inventoryMovements).values({
          item_id: ing.inventory_item_id,
          type: "adjustment",
          quantity: String(qty),
          reference: orderNumber,
          notes: `Edição: ${delta}x ${itemSnapshotName} (devolução)`,
        });
      }
    }
  });
}

interface AddItemParams {
  orderId: string;
  branchId: string;
  menuItemId: string;
  quantity: number;
  notes?: string | null;
  modifiers?: Array<{ modifierId: string }>;
}

/**
 * Adiciona um novo item a um pedido existente.
 * Retorna o pedido completo (com items) atualizado.
 */
export async function addItemToOrder(params: AddItemParams): Promise<OrderWithMeta> {
  const { orderId, branchId, menuItemId, quantity, notes, modifiers } = params;
  const { order } = await loadOrderWithMeta(orderId, branchId);

  assertEditable(order);

  if (quantity < 1) {
    throw new OrderValidationError("Quantidade deve ser pelo menos 1");
  }

  const [menuItem] = await db
    .select()
    .from(schema.menuItems)
    .where(eq(schema.menuItems.id, menuItemId))
    .limit(1);

  if (!menuItem) {
    throw new OrderValidationError(`Produto não encontrado: ${menuItemId}`);
  }
  if (!menuItem.is_available) {
    throw new OrderValidationError(`Produto indisponível: ${menuItem.name}`);
  }
  if (menuItem.branch_id !== branchId) {
    throw new OrderValidationError("Produto pertence a outra filial");
  }

  let modifierMap = new Map<string, { id: string; name: string; price: number }>();
  if (modifiers?.length) {
    const ids = modifiers.map((m) => m.modifierId);
    const rows = await db
      .select({
        id: schema.modifiers.id,
        name: schema.modifiers.name,
        price: schema.modifiers.price,
      })
      .from(schema.modifiers)
      .where(inArray(schema.modifiers.id, ids));
    modifierMap = new Map(rows.map((r) => [r.id, r]));
  }

  const modifierPricePerUnit = (modifiers || []).reduce(
    (sum, m) => sum + (modifierMap.get(m.modifierId)?.price ?? 0),
    0,
  );
  const lineTotal = (menuItem.price + modifierPricePerUnit) * quantity;

  await db.transaction(async (tx) => {
    const [item] = await tx
      .insert(schema.orderItems)
      .values({
        order_id: orderId,
        menu_item_id: menuItem.id,
        name: menuItem.name,
        unit_price: menuItem.price,
        quantity,
        total: lineTotal,
        notes: notes || null,
        status: "pending",
      })
      .returning();

    if (modifiers?.length) {
      await tx.insert(schema.orderItemModifiers).values(
        modifiers.map((m) => ({
          order_item_id: item.id,
          modifier_id: m.modifierId,
          name: modifierMap.get(m.modifierId)?.name || "Modificador",
          price: modifierMap.get(m.modifierId)?.price ?? 0,
        })),
      );
    }

    await recalculateOrderTotals(tx, orderId);
  });

  await adjustInventoryForItem({
    branchId,
    orderId,
    orderNumber: order.order_number,
    menuItemId: menuItem.id,
    itemSnapshotName: menuItem.name,
    delta: quantity,
  });

  return loadOrderWithMeta(orderId, branchId);
}

interface UpdateItemParams {
  orderId: string;
  branchId: string;
  itemId: string;
  quantity?: number;
  notes?: string | null;
}

/**
 * Atualiza quantidade e/ou notas de um item já existente.
 * Recalcula o total do item e do pedido. Ajusta estoque pelo delta.
 */
export async function updateOrderItem(params: UpdateItemParams): Promise<OrderWithMeta> {
  const { orderId, branchId, itemId, quantity, notes } = params;
  const { order } = await loadOrderWithMeta(orderId, branchId);

  assertEditable(order);

  if (quantity !== undefined && quantity < 1) {
    throw new OrderValidationError("Quantidade deve ser pelo menos 1");
  }

  const [item] = await db
    .select()
    .from(schema.orderItems)
    .where(
      and(
        eq(schema.orderItems.id, itemId),
        eq(schema.orderItems.order_id, orderId),
      ),
    )
    .limit(1);

  if (!item) {
    throw new OrderValidationError("Item do pedido não encontrado");
  }

  let delta = 0;

  await db.transaction(async (tx) => {
    const modPriceTotal = await tx
      .select({
        total: sql<number>`COALESCE(SUM(${schema.orderItemModifiers.price})::int, 0)`,
      })
      .from(schema.orderItemModifiers)
      .where(eq(schema.orderItemModifiers.order_item_id, itemId));
    const modifierPricePerUnit = modPriceTotal[0]?.total ?? 0;

    const newQty = quantity ?? item.quantity;
    const newTotal = (item.unit_price + modifierPricePerUnit) * newQty;
    delta = newQty - item.quantity;

    await tx
      .update(schema.orderItems)
      .set({
        quantity: newQty,
        total: newTotal,
        notes: notes !== undefined ? (notes || null) : item.notes,
      })
      .where(eq(schema.orderItems.id, itemId));

    await recalculateOrderTotals(tx, orderId);
  });

  if (delta !== 0) {
    await adjustInventoryForItem({
      branchId,
      orderId,
      orderNumber: order.order_number,
      menuItemId: item.menu_item_id,
      itemSnapshotName: item.name,
      delta,
    });
  }

  return loadOrderWithMeta(orderId, branchId);
}

interface RemoveItemParams {
  orderId: string;
  branchId: string;
  itemId: string;
}

/**
 * Remove um item do pedido. Não permite remover o último item
 * (use deleteOrder ou cancelle o pedido em vez disso).
 */
export async function removeOrderItem(params: RemoveItemParams): Promise<OrderWithMeta> {
  const { orderId, branchId, itemId } = params;
  const { order, items } = await loadOrderWithMeta(orderId, branchId);

  assertEditable(order);

  if (items.length <= 1) {
    throw new OrderValidationError(
      "Não é possível remover o único item do pedido. Cancele o pedido em vez disso.",
    );
  }

  const item = items.find((i) => i.id === itemId);
  if (!item) {
    throw new OrderValidationError("Item do pedido não encontrado");
  }

  await db.transaction(async (tx) => {
    await tx.delete(schema.orderItems).where(eq(schema.orderItems.id, itemId));
    await recalculateOrderTotals(tx, orderId);
  });

  await adjustInventoryForItem({
    branchId,
    orderId,
    orderNumber: order.order_number,
    menuItemId: item.menu_item_id,
    itemSnapshotName: item.name,
    delta: -item.quantity,
  });

  return loadOrderWithMeta(orderId, branchId);
}
