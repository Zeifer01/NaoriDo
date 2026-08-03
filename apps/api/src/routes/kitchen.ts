import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { zValidator } from "@hono/zod-validator";
import { eq, and, inArray, asc, sql } from "drizzle-orm";
import { db, schema } from "@restai/db";
import { updateOrderItemStatusSchema, idParamSchema, kitchenQuerySchema } from "@restai/validators";
import { ORDER_ITEM_STATUS_TRANSITIONS } from "@restai/config";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.js";
import { tenantMiddleware, requireBranch } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/rbac.js";
import { requireActivePlan } from "../middleware/active-plan.js";
import { requireFeature } from "../middleware/feature.js";
import { wsManager } from "../ws/manager.js";
import { sendManualOrderNotify } from "../services/whatsapp.service.js";
import { WhatsAppError } from "../lib/whatsapp.js";

const kitchen = new Hono<AppEnv>();

kitchen.use("*", authMiddleware);
kitchen.use("*", tenantMiddleware);
kitchen.use("*", requireBranch);
kitchen.use("*", requireActivePlan);

// GET /orders - Active kitchen orders (FIFO, with table/customer names, no N+1)
kitchen.get("/orders", requirePermission("orders:read"), zValidator("query", kitchenQuerySchema), async (c) => {
  const tenant = c.get("tenant") as any;
  const { status } = c.req.valid("query");

  const statusList = status ? [status] : ["pending", "confirmed", "preparing", "ready"];

  const activeOrders = await db
    .select({
      id: schema.orders.id,
      organization_id: schema.orders.organization_id,
      branch_id: schema.orders.branch_id,
      table_session_id: schema.orders.table_session_id,
      customer_id: schema.orders.customer_id,
      order_number: schema.orders.order_number,
      type: schema.orders.type,
      status: schema.orders.status,
      customer_name: schema.orders.customer_name,
      delivery_phone: schema.orders.delivery_phone,
      delivery_address: schema.orders.delivery_address,
      delivery_reference: schema.orders.delivery_reference,
      delivery_fee: schema.orders.delivery_fee,
      delivery_fee_status: schema.orders.delivery_fee_status,
      delivery_city: schema.orders.delivery_city,
      payment_method: schema.orders.payment_method,
      total: schema.orders.total,
      notes: schema.orders.notes,
      created_at: schema.orders.created_at,
      updated_at: schema.orders.updated_at,
      table_name: sql<string | null>`COALESCE(
        'Mesa ' || ${schema.tables.number}::text,
        NULL
      )`,
      table_number: schema.tables.number,
    })
    .from(schema.orders)
    .leftJoin(
      schema.tableSessions,
      eq(schema.orders.table_session_id, schema.tableSessions.id),
    )
    .leftJoin(schema.tables, eq(schema.tableSessions.table_id, schema.tables.id))
    .where(
      and(
        eq(schema.orders.branch_id, tenant.branchId),
        inArray(schema.orders.status, statusList as any),
      ),
    )
    .orderBy(asc(schema.orders.created_at));

  if (activeOrders.length === 0) {
    return c.json({ success: true, data: [] });
  }

  const orderIds = activeOrders.map((o) => o.id);
  const allItems = await db
    .select()
    .from(schema.orderItems)
    .where(inArray(schema.orderItems.order_id, orderIds))
    .orderBy(asc(schema.orderItems.name));

  const itemIds = allItems.map((i) => i.id);
  const allMods =
    itemIds.length > 0
      ? await db
          .select()
          .from(schema.orderItemModifiers)
          .where(inArray(schema.orderItemModifiers.order_item_id, itemIds))
      : [];

  const modsByItem = new Map<string, typeof allMods>();
  for (const mod of allMods) {
    const list = modsByItem.get(mod.order_item_id) ?? [];
    list.push(mod);
    modsByItem.set(mod.order_item_id, list);
  }

  const itemsByOrder = new Map<string, Array<(typeof allItems)[number] & { modifiers: typeof allMods }>>();
  for (const item of allItems) {
    const list = itemsByOrder.get(item.order_id) ?? [];
    list.push({
      ...item,
      modifiers: modsByItem.get(item.id) ?? [],
    });
    itemsByOrder.set(item.order_id, list);
  }

  const ordersWithItems = activeOrders.map((order) => ({
    ...order,
    table_name: order.table_name,
    tableName: order.table_name,
    customerName: order.customer_name,
    deliveryAddress: order.delivery_address,
    deliveryReference: order.delivery_reference,
    paymentMethod: order.payment_method,
    items: itemsByOrder.get(order.id) ?? [],
  }));

  return c.json({ success: true, data: ordersWithItems });
});

// PATCH /items/:id/status - Update kitchen item status
kitchen.patch(
  "/items/:id/status",
  requirePermission("orders:update_item_status"),
  zValidator("param", idParamSchema),
  zValidator("json", updateOrderItemStatusSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const { status } = c.req.valid("json");
    const tenant = c.get("tenant") as any;

    const [item] = await db
      .select()
      .from(schema.orderItems)
      .where(eq(schema.orderItems.id, id))
      .limit(1);

    if (!item) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Item não encontrado" } },
        404,
      );
    }

    const [order] = await db
      .select({
        id: schema.orders.id,
        branch_id: schema.orders.branch_id,
        order_number: schema.orders.order_number,
        table_session_id: schema.orders.table_session_id,
      })
      .from(schema.orders)
      .where(eq(schema.orders.id, item.order_id))
      .limit(1);

    if (!order || order.branch_id !== tenant.branchId) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Pedido não encontrado" } },
        404,
      );
    }

    const allowed = ORDER_ITEM_STATUS_TRANSITIONS[item.status];
    if (!allowed?.includes(status)) {
      return c.json(
        {
          success: false,
          error: {
            code: "BAD_REQUEST",
            message: `Não é possível mudar de "${item.status}" para "${status}"`,
          },
        },
        400,
      );
    }

    const [updated] = await db
      .update(schema.orderItems)
      .set({ status })
      .where(eq(schema.orderItems.id, id))
      .returning();

    const itemPayload = {
      type: "order:item_status",
      payload: {
        orderId: order.id,
        orderNumber: order.order_number,
        item: {
          id: updated.id,
          name: updated.name,
          quantity: updated.quantity,
          status: updated.status,
        },
      },
      timestamp: Date.now(),
    };
    await wsManager.publish(`branch:${tenant.branchId}`, itemPayload);
    await wsManager.publish(`branch:${tenant.branchId}:kitchen`, itemPayload);
    if (order.table_session_id) {
      await wsManager.publish(`session:${order.table_session_id}`, itemPayload);
    }

    return c.json({ success: true, data: updated });
  },
);

// POST /orders/:id/notify — manual WhatsApp notify (kitchen group or customer)
kitchen.post(
  "/orders/:id/notify",
  requirePermission("orders:update"),
  requireFeature("whatsapp"),
  zValidator("param", idParamSchema),
  zValidator(
    "json",
    z.object({
      target: z.enum(["kitchen", "customer"]),
      etaMinutes: z.number().int().min(1).max(180).optional(),
      templateKey: z
        .enum([
          "status_confirmed",
          "status_preparing",
          "status_ready",
          "delivery_fee_updated",
          "order_edited",
        ])
        .optional(),
    }),
  ),
  async (c) => {
    const { id } = c.req.valid("param");
    const { target, etaMinutes, templateKey } = c.req.valid("json");
    const tenant = c.get("tenant") as any;

    const [order] = await db
      .select({
        id: schema.orders.id,
        order_number: schema.orders.order_number,
        status: schema.orders.status,
        type: schema.orders.type,
        total: schema.orders.total,
        delivery_fee: schema.orders.delivery_fee,
        delivery_fee_status: schema.orders.delivery_fee_status,
        delivery_phone: schema.orders.delivery_phone,
        delivery_address: schema.orders.delivery_address,
        delivery_reference: schema.orders.delivery_reference,
        payment_method: schema.orders.payment_method,
        customer_name: schema.orders.customer_name,
        notes: schema.orders.notes,
        created_at: schema.orders.created_at,
        branch_id: schema.orders.branch_id,
      })
      .from(schema.orders)
      .where(eq(schema.orders.id, id))
      .limit(1);

    if (!order || order.branch_id !== tenant.branchId) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Pedido não encontrado" } },
        404,
      );
    }

    const [branch] = await db
      .select()
      .from(schema.branches)
      .where(eq(schema.branches.id, tenant.branchId))
      .limit(1);

    if (!branch) {
      return c.json(
        { success: false, error: { code: "BAD_REQUEST", message: "Filial não encontrada" } },
        400,
      );
    }

    try {
      const result = await sendManualOrderNotify(
        { ...branch, organization_id: tenant.organizationId },
        {
          id: order.id,
          order_number: order.order_number,
          status: order.status,
          type: order.type,
          total: order.total,
          delivery_fee: order.delivery_fee,
          delivery_fee_status: order.delivery_fee_status,
          delivery_phone: order.delivery_phone,
          delivery_address: order.delivery_address,
          delivery_reference: order.delivery_reference,
          payment_method: order.payment_method,
          customer_name: order.customer_name,
          notes: order.notes,
          created_at: order.created_at,
        },
        target,
        { etaMinutes, templateKey },
      );
      return c.json({ success: true, data: result });
    } catch (err) {
      if (err instanceof WhatsAppError) {
        const code = err.statusCode === 503 ? 503 : 400;
        return c.json(
          { success: false, error: { code: "WHATSAPP_ERROR", message: err.message } },
          code,
        );
      }
      const message = err instanceof Error ? err.message : "Erro ao notificar";
      return c.json(
        { success: false, error: { code: "WHATSAPP_ERROR", message } },
        502,
      );
    }
  },
);

export { kitchen };
