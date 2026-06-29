import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, inArray, or, isNotNull, sql, ne } from "drizzle-orm";
import { db, schema } from "@restai/db";
import { getDeliveryFeeCents } from "@restai/config";
import {
  createDeliveryOrderSchema,
  deliveryOrderStatusQuerySchema,
} from "@restai/validators";
import { createOrder, OrderValidationError } from "../services/order.service.js";
import {
  notifyDeliveryOrderCreated,
} from "../services/whatsapp.service.js";
import { wsManager } from "../ws/manager.js";
import { orgHasFeature } from "../lib/features.js";

const delivery = new Hono<AppEnv>();

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

async function getActiveBranch(branchSlug: string) {
  const [branch] = await db
    .select()
    .from(schema.branches)
    .where(eq(schema.branches.slug, branchSlug))
    .limit(1);

  if (!branch || !branch.is_active) return null;

  const settings = (branch.settings || {}) as Record<string, unknown>;
  const deliveryEnabled = settings.delivery_enabled !== false;
  if (!deliveryEnabled) return null;

  // Plan must include the delivery feature.
  const planAllows = await orgHasFeature(branch.organization_id, "delivery");
  if (!planAllows) return null;

  return branch;
}

delivery.get("/:branchSlug/menu", async (c) => {
  const branchSlug = c.req.param("branchSlug");
  const branch = await getActiveBranch(branchSlug);

  if (!branch) {
    return c.json(
      { success: false, error: { code: "NOT_FOUND", message: "Filial não encontrada ou delivery indisponível" } },
      404,
    );
  }

  const settings = (branch.settings || {}) as Record<string, unknown>;

  const [org] = await db
    .select({
      name: schema.organizations.name,
      logo_url: schema.organizations.logo_url,
    })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, branch.organization_id))
    .limit(1);

  const categories = await db
    .select()
    .from(schema.menuCategories)
    .where(
      and(
        eq(schema.menuCategories.branch_id, branch.id),
        eq(schema.menuCategories.is_active, true),
      ),
    );

  const [items, salesRows] = await Promise.all([
    db
      .select()
      .from(schema.menuItems)
      .where(
        and(
          eq(schema.menuItems.branch_id, branch.id),
          eq(schema.menuItems.is_available, true),
        ),
      ),
    db
      .select({
        menu_item_id: schema.orderItems.menu_item_id,
        total_sold: sql<number>`COALESCE(SUM(${schema.orderItems.quantity}), 0)::int`,
      })
      .from(schema.orderItems)
      .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.order_id))
      .where(
        and(
          eq(schema.orders.branch_id, branch.id),
          ne(schema.orders.status, "cancelled"),
        ),
      )
      .groupBy(schema.orderItems.menu_item_id),
  ]);

  const salesMap = new Map(salesRows.map((r) => [r.menu_item_id, r.total_sold]));
  const itemsWithSales = items.map((item) => ({
    ...item,
    total_sold: salesMap.get(item.id) ?? 0,
  }));

  return c.json({
    success: true,
    data: {
      branch: {
        id: branch.id,
        name: branch.name,
        slug: branch.slug,
        currency: branch.currency,
        tax_rate: branch.tax_rate,
        delivery_fee: getDeliveryFeeCents(settings),
        logo_url: org?.logo_url ?? null,
        org_name: org?.name ?? branch.name,
        menu_display_name: (settings.menu_display_name as string) || null,
        menu_subtitle: (settings.menu_subtitle as string) || null,
        menu_delivery_text: (settings.menu_delivery_text as string) || null,
      },
      landing: {
        enabled: settings.landing_enabled === true,
        title: (settings.landing_title as string) || null,
        description: (settings.landing_description as string) || null,
        button_text: (settings.landing_button_text as string) || null,
        button_url: (settings.landing_button_url as string) || null,
      },
      categories,
      items: itemsWithSales,
    },
  });
});

delivery.get("/:branchSlug/menu/items/:itemId/modifiers", async (c) => {
  const branchSlug = c.req.param("branchSlug");
  const itemId = c.req.param("itemId");
  const branch = await getActiveBranch(branchSlug);

  if (!branch) {
    return c.json(
      { success: false, error: { code: "NOT_FOUND", message: "Filial não encontrada" } },
      404,
    );
  }

  const [item] = await db
    .select({ id: schema.menuItems.id })
    .from(schema.menuItems)
    .where(
      and(
        eq(schema.menuItems.id, itemId),
        eq(schema.menuItems.branch_id, branch.id),
      ),
    )
    .limit(1);

  if (!item) {
    return c.json(
      { success: false, error: { code: "NOT_FOUND", message: "Item não encontrado" } },
      404,
    );
  }

  const links = await db
    .select()
    .from(schema.menuItemModifierGroups)
    .where(eq(schema.menuItemModifierGroups.item_id, itemId));

  if (links.length === 0) {
    return c.json({ success: true, data: [] });
  }

  const groupIds = links.map((l) => l.group_id);
  const groups = await db
    .select()
    .from(schema.modifierGroups)
    .where(
      groupIds.length === 1
        ? eq(schema.modifierGroups.id, groupIds[0])
        : inArray(schema.modifierGroups.id, groupIds),
    );

  const allModifiers = await db
    .select()
    .from(schema.modifiers)
    .where(
      groupIds.length === 1
        ? eq(schema.modifiers.group_id, groupIds[0])
        : inArray(schema.modifiers.group_id, groupIds),
    );

  const result = groups.map((g) => ({
    ...g,
    modifiers: allModifiers.filter((m) => m.group_id === g.id && m.is_available),
  }));

  return c.json({ success: true, data: result });
});

delivery.post(
  "/:branchSlug/orders",
  zValidator("json", createDeliveryOrderSchema),
  async (c) => {
    const branchSlug = c.req.param("branchSlug");
    const body = c.req.valid("json");
    const branch = await getActiveBranch(branchSlug);

    if (!branch) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Filial não encontrada ou delivery indisponível" } },
        404,
      );
    }

    const orderType = body.fulfillment === "pickup" ? "takeout" : "delivery";
    let result;
    try {
      result = await createOrder({
        organizationId: branch.organization_id,
        branchId: branch.id,
        items: body.items,
        type: orderType,
        customerName: body.customerName,
        notes: body.notes,
        deliveryPhone: body.deliveryPhone,
        deliveryAddress: orderType === "delivery" ? body.deliveryAddress : null,
        deliveryReference: orderType === "delivery" ? body.deliveryReference : null,
        couponCode: body.couponCode || null,
        redemptionId: body.redemptionId || null,
        paymentMethod: body.paymentMethod || null,
      });
    } catch (err) {
      if (err instanceof OrderValidationError) {
        return c.json(
          { success: false, error: { code: "BAD_REQUEST", message: err.message } },
          400,
        );
      }
      throw err;
    }

    const { order, items: createdItems } = result;

    await wsManager.publish(`branch:${branch.id}`, {
      type: "order:created",
      payload: {
        orderId: order.id,
        orderNumber: order.order_number,
        status: order.status,
        type: order.type,
      },
      timestamp: Date.now(),
    });
    await wsManager.publish(`branch:${branch.id}:kitchen`, {
      type: "order:created",
      payload: {
        orderId: order.id,
        orderNumber: order.order_number,
        status: order.status,
      },
      timestamp: Date.now(),
    });

    void notifyDeliveryOrderCreated(branch, order);

    return c.json({ success: true, data: { order, items: createdItems } }, 201);
  },
);

delivery.get(
  "/:branchSlug/orders/:id/status",
  zValidator("query", deliveryOrderStatusQuerySchema),
  async (c) => {
    const branchSlug = c.req.param("branchSlug");
    const orderId = c.req.param("id");
    const { phone } = c.req.valid("query");
    const branch = await getActiveBranch(branchSlug);

    if (!branch) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Filial não encontrada" } },
        404,
      );
    }

    const normalizedQueryPhone = normalizePhone(phone);

    const [order] = await db
      .select({
        id: schema.orders.id,
        order_number: schema.orders.order_number,
        status: schema.orders.status,
        type: schema.orders.type,
        subtotal: schema.orders.subtotal,
        tax: schema.orders.tax,
        discount: schema.orders.discount,
        total: schema.orders.total,
        delivery_phone: schema.orders.delivery_phone,
        delivery_fee: schema.orders.delivery_fee,
        delivery_address: schema.orders.delivery_address,
        delivery_reference: schema.orders.delivery_reference,
        customer_name: schema.orders.customer_name,
        created_at: schema.orders.created_at,
      })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.id, orderId),
          eq(schema.orders.branch_id, branch.id),
          or(
            eq(schema.orders.type, "delivery"),
            eq(schema.orders.type, "takeout"),
          ),
        ),
      )
      .limit(1);

    if (!order) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Pedido não encontrado" } },
        404,
      );
    }

    if (!order.delivery_phone || normalizePhone(order.delivery_phone) !== normalizedQueryPhone) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Pedido não encontrado" } },
        404,
      );
    }

    const items = await db
      .select({
        id: schema.orderItems.id,
        name: schema.orderItems.name,
        quantity: schema.orderItems.quantity,
        total: schema.orderItems.total,
      })
      .from(schema.orderItems)
      .where(eq(schema.orderItems.order_id, orderId));

    return c.json({ success: true, data: { ...order, items } });
  },
);

delivery.delete(
  "/:branchSlug/orders/:orderId/items/:itemId",
  zValidator("query", deliveryOrderStatusQuerySchema),
  async (c) => {
    const branchSlug = c.req.param("branchSlug");
    const orderId = c.req.param("orderId");
    const itemId = c.req.param("itemId");
    const { phone } = c.req.valid("query");
    const branch = await getActiveBranch(branchSlug);

    if (!branch) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Filial não encontrada" } },
        404,
      );
    }

    const [order] = await db
      .select()
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.id, orderId),
          eq(schema.orders.branch_id, branch.id),
          or(eq(schema.orders.type, "delivery"), eq(schema.orders.type, "takeout")),
        ),
      )
      .limit(1);

    if (!order) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Pedido não encontrado" } },
        404,
      );
    }

    if (!order.delivery_phone || normalizePhone(order.delivery_phone) !== normalizePhone(phone)) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Pedido não encontrado" } },
        404,
      );
    }

    if (!["pending", "confirmed"].includes(order.status)) {
      return c.json(
        { success: false, error: { code: "ORDER_NOT_EDITABLE", message: "Este pedido não pode mais ser editado" } },
        422,
      );
    }

    const allItems = await db
      .select({ id: schema.orderItems.id, total: schema.orderItems.total })
      .from(schema.orderItems)
      .where(eq(schema.orderItems.order_id, orderId));

    if (allItems.length <= 1) {
      return c.json(
        { success: false, error: { code: "CANNOT_REMOVE_LAST_ITEM", message: "Não é possível remover o único item do pedido" } },
        422,
      );
    }

    const target = allItems.find((i) => i.id === itemId);
    if (!target) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Item não encontrado" } },
        404,
      );
    }

    await db.delete(schema.orderItems).where(eq(schema.orderItems.id, itemId));

    const newSubtotal = Math.max(0, order.subtotal - target.total);
    const newTax = order.subtotal > 0 ? Math.round((newSubtotal / order.subtotal) * order.tax) : 0;
    const newTotal = Math.max(0, newSubtotal + order.delivery_fee - order.discount + newTax);

    const [updatedOrder] = await db
      .update(schema.orders)
      .set({ subtotal: newSubtotal, tax: newTax, total: newTotal, updated_at: new Date() })
      .where(eq(schema.orders.id, orderId))
      .returning();

    const remaining = await db
      .select({ id: schema.orderItems.id, name: schema.orderItems.name, quantity: schema.orderItems.quantity, total: schema.orderItems.total })
      .from(schema.orderItems)
      .where(eq(schema.orderItems.order_id, orderId));

    return c.json({ success: true, data: { ...updatedOrder, items: remaining } });
  },
);

const addItemsToOrderSchema = z.object({
  items: z
    .array(
      z.object({
        menuItemId: z.string().uuid(),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1),
});

delivery.post(
  "/:branchSlug/orders/:orderId/items",
  zValidator("query", deliveryOrderStatusQuerySchema),
  zValidator("json", addItemsToOrderSchema),
  async (c) => {
    const branchSlug = c.req.param("branchSlug");
    const orderId = c.req.param("orderId");
    const { phone } = c.req.valid("query");
    const { items: newItems } = c.req.valid("json");
    const branch = await getActiveBranch(branchSlug);

    if (!branch) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Filial não encontrada" } },
        404,
      );
    }

    const [order] = await db
      .select()
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.id, orderId),
          eq(schema.orders.branch_id, branch.id),
          or(eq(schema.orders.type, "delivery"), eq(schema.orders.type, "takeout")),
        ),
      )
      .limit(1);

    if (!order || !order.delivery_phone || normalizePhone(order.delivery_phone) !== normalizePhone(phone)) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Pedido não encontrado" } },
        404,
      );
    }

    if (!["pending", "confirmed"].includes(order.status)) {
      return c.json(
        { success: false, error: { code: "ORDER_NOT_EDITABLE", message: "Este pedido não pode mais ser editado" } },
        422,
      );
    }

    const menuItemIds = newItems.map((i) => i.menuItemId);
    const menuItems = await db
      .select()
      .from(schema.menuItems)
      .where(
        and(
          menuItemIds.length === 1
            ? eq(schema.menuItems.id, menuItemIds[0])
            : inArray(schema.menuItems.id, menuItemIds),
          eq(schema.menuItems.branch_id, branch.id),
          eq(schema.menuItems.is_available, true),
        ),
      );

    for (const requested of newItems) {
      if (!menuItems.find((m) => m.id === requested.menuItemId)) {
        return c.json(
          { success: false, error: { code: "ITEM_UNAVAILABLE", message: "Um ou mais itens não estão disponíveis" } },
          400,
        );
      }
    }

    let addedSubtotal = 0;
    for (const requested of newItems) {
      const menuItem = menuItems.find((m) => m.id === requested.menuItemId)!;
      const itemTotal = menuItem.price * requested.quantity;
      addedSubtotal += itemTotal;

      await db.insert(schema.orderItems).values({
        order_id: orderId,
        menu_item_id: menuItem.id,
        name: menuItem.name,
        unit_price: menuItem.price,
        quantity: requested.quantity,
        total: itemTotal,
      });
    }

    const newSubtotal = order.subtotal + addedSubtotal;
    const taxRate = branch.tax_rate ?? 0;
    const newTax = Math.round(newSubtotal * taxRate / 10000);
    const newTotal = Math.max(0, newSubtotal + order.delivery_fee - order.discount + newTax);

    const [updatedOrder] = await db
      .update(schema.orders)
      .set({ subtotal: newSubtotal, tax: newTax, total: newTotal, updated_at: new Date() })
      .where(eq(schema.orders.id, orderId))
      .returning();

    const allItems = await db
      .select({ id: schema.orderItems.id, name: schema.orderItems.name, quantity: schema.orderItems.quantity, total: schema.orderItems.total })
      .from(schema.orderItems)
      .where(eq(schema.orderItems.order_id, orderId));

    return c.json({ success: true, data: { ...updatedOrder, items: allItems } });
  },
);

export { delivery };
