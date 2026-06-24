import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { zValidator } from "@hono/zod-validator";
import { eq, and, desc, sql, getTableColumns } from "drizzle-orm";
import { db, schema } from "@restai/db";
import {
  createOrderSchema,
  updateOrderStatusSchema,
  updateOrderItemStatusSchema,
  addOrderItemSchema,
  updateOrderItemSchema,
  idParamSchema,
  orderQuerySchema,
} from "@restai/validators";
import { ORDER_STATUS_TRANSITIONS, ORDER_ITEM_STATUS_TRANSITIONS } from "@restai/config";
import { authMiddleware } from "../middleware/auth.js";
import { tenantMiddleware, requireBranch } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/rbac.js";
import { requireActivePlan } from "../middleware/active-plan.js";
import { wsManager } from "../ws/manager.js";
import { z } from "zod";
import {
  createOrder,
  deleteOrder,
  handleOrderCompletion,
  OrderNotFoundError,
  OrderValidationError,
  resetBranchOrders,
  addItemToOrder,
  updateOrderItem,
  removeOrderItem,
} from "../services/order.service.js";
import { notifyDeliveryOrderStatusUpdated } from "../services/whatsapp.service.js";
import { restoreForOrder } from "../services/inventory.service.js";
import { logger } from "../lib/logger.js";

const orders = new Hono<AppEnv>();

orders.use("*", authMiddleware);
orders.use("*", tenantMiddleware);
orders.use("*", requireBranch);
orders.use("*", requireActivePlan);

// GET / - List orders
orders.get("/", requirePermission("orders:read"), zValidator("query", orderQuerySchema), async (c) => {
  const tenant = c.get("tenant") as any;
  const { status, page, limit } = c.req.valid("query");
  const offset = (page - 1) * limit;

  const conditions = [
    eq(schema.orders.branch_id, tenant.branchId),
    eq(schema.orders.organization_id, tenant.organizationId),
  ];

  if (status) {
    conditions.push(eq(schema.orders.status, status as any));
  }

  const whereClause = and(...conditions);

  const [result, countResult] = await Promise.all([
    db
      .select({
        ...getTableColumns(schema.orders),
        item_count: sql<number>`(SELECT COUNT(*)::int FROM order_items WHERE order_items.order_id = ${schema.orders.id})`,
        total_paid: sql<number>`COALESCE((SELECT SUM(amount)::int FROM payments WHERE payments.order_id = ${schema.orders.id} AND payments.status = 'completed'), 0)`,
        table_number: schema.tables.number,
      })
      .from(schema.orders)
      .leftJoin(schema.tableSessions, eq(schema.orders.table_session_id, schema.tableSessions.id))
      .leftJoin(schema.tables, eq(schema.tableSessions.table_id, schema.tables.id))
      .where(whereClause)
      .orderBy(desc(schema.orders.created_at))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(schema.orders)
      .where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;

  const enriched = result.map((order) => {
    const paid = order.total_paid ?? 0;
    const orderTotal = order.total ?? 0;
    const paymentStatus = paid >= orderTotal && orderTotal > 0
      ? "paid"
      : paid > 0
        ? "partial"
        : "unpaid";
    return { ...order, payment_status: paymentStatus };
  });

  return c.json({
    success: true,
    data: enriched,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// POST / - Create order
orders.post(
  "/",
  requirePermission("orders:create"),
  zValidator("json", createOrderSchema),
  async (c) => {
    const body = c.req.valid("json");
    const tenant = c.get("tenant") as any;
    const user = c.get("user") as any;

    // Determine table_session_id for customer
    let tableSessionId: string | null = null;
    if (user.role === "customer") {
      const [session] = await db
        .select({ id: schema.tableSessions.id })
        .from(schema.tableSessions)
        .where(
          and(
            eq(schema.tableSessions.table_id, user.table),
            eq(schema.tableSessions.status, "active"),
          ),
        )
        .limit(1);
      tableSessionId = session?.id || null;
    }

    let result;
    try {
      result = await createOrder({
        organizationId: tenant.organizationId,
        branchId: tenant.branchId,
        items: body.items,
        type: body.type,
        customerName: body.customerName,
        notes: body.notes,
        tableSessionId,
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

    // Broadcast new order to branch and kitchen
    const orderPayload = {
      type: "order:new",
      payload: {
        orderId: order.id,
        orderNumber: order.order_number,
        status: order.status,
        items: createdItems.map((i) => ({
          id: i.id,
          name: i.name,
          quantity: i.quantity,
          status: i.status,
          notes: i.notes,
        })),
      },
      timestamp: Date.now(),
    };
    await wsManager.publish(`branch:${tenant.branchId}`, orderPayload);
    await wsManager.publish(`branch:${tenant.branchId}:kitchen`, orderPayload);

    return c.json({ success: true, data: { ...order, items: createdItems } }, 201);
  },
);

// POST /reset-sequence - Delete all branch orders and restart numbering at 1
orders.post("/reset-sequence", requirePermission("orders:delete"), async (c) => {
  const tenant = c.get("tenant") as any;

  try {
    const result = await resetBranchOrders({
      branchId: tenant.branchId,
      organizationId: tenant.organizationId,
    });

    return c.json({
      success: true,
      data: {
        deletedCount: result.deletedCount,
        nextOrderNumber: 1,
      },
    });
  } catch (err) {
    logger.error("Failed to reset order sequence", { error: (err as Error).message });
    return c.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Erro ao reiniciar sequência de pedidos" } },
      500,
    );
  }
});

// GET /:id - Get order with items
orders.get(
  "/:id",
  requirePermission("orders:read"),
  zValidator("param", idParamSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const tenant = c.get("tenant") as any;

    const [order] = await db
      .select()
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.id, id),
          eq(schema.orders.branch_id, tenant.branchId),
        ),
      )
      .limit(1);

    if (!order) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Pedido não encontrado" } },
        404,
      );
    }

    const items = await db
      .select()
      .from(schema.orderItems)
      .where(eq(schema.orderItems.order_id, order.id));

    return c.json({ success: true, data: { ...order, items } });
  },
);

// PATCH /:id/status
orders.patch(
  "/:id/status",
  requirePermission("orders:update"),
  zValidator("param", idParamSchema),
  zValidator("json", updateOrderStatusSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const { status } = c.req.valid("json");
    const tenant = c.get("tenant") as any;

    const [order] = await db
      .select()
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.id, id),
          eq(schema.orders.branch_id, tenant.branchId),
        ),
      )
      .limit(1);

    if (!order) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Pedido não encontrado" } },
        404,
      );
    }

    const allowed = ORDER_STATUS_TRANSITIONS[order.status];
    if (!allowed?.includes(status)) {
      return c.json(
        {
          success: false,
          error: { code: "BAD_REQUEST", message: `Não é possível alterar de "${order.status}" para "${status}"` },
        },
        400,
      );
    }

    const [updated] = await db
      .update(schema.orders)
      .set({ status, updated_at: new Date() })
      .where(eq(schema.orders.id, id))
      .returning();

    const updatePayload = {
      type: "order:updated",
      payload: { orderId: updated.id, orderNumber: updated.order_number, status: updated.status },
      timestamp: Date.now(),
    };
    await wsManager.publish(`branch:${tenant.branchId}`, updatePayload);
    await wsManager.publish(`branch:${tenant.branchId}:kitchen`, updatePayload);

    // If order has a session, notify the customer too
    if (order.table_session_id) {
      await wsManager.publish(`session:${order.table_session_id}`, updatePayload);
    }

    if (updated.type === "delivery") {
      const [branch] = await db
        .select()
        .from(schema.branches)
        .where(eq(schema.branches.id, tenant.branchId))
        .limit(1);
      if (branch) {
        void notifyDeliveryOrderStatusUpdated(branch, updated, status);
      }
    }

    // Handle side effects when order is completed (loyalty points + inventory deduction)
    if (status === "completed") {
      await handleOrderCompletion({
        orderId: order.id,
        orderNumber: order.order_number,
        orderTotal: order.total,
        customerId: order.customer_id,
        organizationId: tenant.organizationId,
        branchId: tenant.branchId,
        inventoryDeducted: order.inventory_deducted,
      });
    }

    if (status === "cancelled") {
      try {
        await restoreForOrder({
          orderId: order.id,
          orderNumber: order.order_number,
          branchId: tenant.branchId,
        });
      } catch (err) {
        logger.error("Inventory restore error on cancellation", {
          orderId: order.id,
          error: (err as Error).message,
        });
      }
    }

    return c.json({ success: true, data: updated });
  },
);

// PATCH /:id/items/:itemId/status
orders.patch(
  "/:id/items/:itemId/status",
  requirePermission("orders:update"),
  zValidator("param", z.object({ id: z.string().uuid(), itemId: z.string().uuid() })),
  zValidator("json", updateOrderItemStatusSchema),
  async (c) => {
    const { id, itemId } = c.req.valid("param");
    const { status } = c.req.valid("json");
    const tenant = c.get("tenant") as any;

    // Verify order belongs to branch
    const [order] = await db
      .select({
        id: schema.orders.id,
        order_number: schema.orders.order_number,
        table_session_id: schema.orders.table_session_id,
      })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.id, id),
          eq(schema.orders.branch_id, tenant.branchId),
        ),
      )
      .limit(1);

    if (!order) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Pedido não encontrado" } },
        404,
      );
    }

    const [item] = await db
      .select()
      .from(schema.orderItems)
      .where(
        and(
          eq(schema.orderItems.id, itemId),
          eq(schema.orderItems.order_id, id),
        ),
      )
      .limit(1);

    if (!item) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Item não encontrado" } },
        404,
      );
    }

    const allowed = ORDER_ITEM_STATUS_TRANSITIONS[item.status];
    if (!allowed?.includes(status)) {
      return c.json(
        {
          success: false,
          error: { code: "BAD_REQUEST", message: `Não é possível alterar de "${item.status}" para "${status}"` },
        },
        400,
      );
    }

    const [updated] = await db
      .update(schema.orderItems)
      .set({ status })
      .where(eq(schema.orderItems.id, itemId))
      .returning();

    const itemPayload = {
      type: "order:item_status",
      payload: {
        orderId: id,
        orderNumber: order.order_number,
        item: { id: updated.id, name: updated.name, quantity: updated.quantity, status: updated.status },
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

// ---------------------------------------------------------------------------
// EDIÇÃO DE ITENS DE PEDIDOS EXISTENTES (Fase B)
// ---------------------------------------------------------------------------

const orderItemParam = z.object({
  id: z.string().uuid(),
  itemId: z.string().uuid(),
});

async function broadcastOrderUpdated(branchId: string, order: { id: string; order_number: string; status: string; table_session_id?: string | null }) {
  const payload = {
    type: "order:updated",
    payload: { orderId: order.id, orderNumber: order.order_number, status: order.status },
    timestamp: Date.now(),
  };
  await wsManager.publish(`branch:${branchId}`, payload);
  await wsManager.publish(`branch:${branchId}:kitchen`, payload);
  if (order.table_session_id) {
    await wsManager.publish(`session:${order.table_session_id}`, payload);
  }
}

// POST /:id/items - add new item to existing order
orders.post(
  "/:id/items",
  requirePermission("orders:update"),
  zValidator("param", idParamSchema),
  zValidator("json", addOrderItemSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const tenant = c.get("tenant") as any;

    try {
      const result = await addItemToOrder({
        orderId: id,
        branchId: tenant.branchId,
        menuItemId: body.menuItemId,
        quantity: body.quantity,
        notes: body.notes ?? null,
        modifiers: body.modifiers,
      });

      await broadcastOrderUpdated(tenant.branchId, {
        id: result.order.id,
        order_number: result.order.order_number,
        status: result.order.status,
        table_session_id: result.order.table_session_id,
      });

      return c.json({ success: true, data: { ...result.order, items: result.items, payment_status: result.paymentStatus, total_paid: result.totalPaid } });
    } catch (err) {
      if (err instanceof OrderNotFoundError) {
        return c.json({ success: false, error: { code: "NOT_FOUND", message: err.message } }, 404);
      }
      if (err instanceof OrderValidationError) {
        return c.json({ success: false, error: { code: "BAD_REQUEST", message: err.message } }, 400);
      }
      throw err;
    }
  },
);

// PATCH /:id/items/:itemId - update quantity / notes of an existing item
orders.patch(
  "/:id/items/:itemId",
  requirePermission("orders:update"),
  zValidator("param", orderItemParam),
  zValidator("json", updateOrderItemSchema),
  async (c) => {
    const { id, itemId } = c.req.valid("param");
    const body = c.req.valid("json");
    const tenant = c.get("tenant") as any;

    try {
      const result = await updateOrderItem({
        orderId: id,
        branchId: tenant.branchId,
        itemId,
        quantity: body.quantity,
        notes: body.notes,
      });

      await broadcastOrderUpdated(tenant.branchId, {
        id: result.order.id,
        order_number: result.order.order_number,
        status: result.order.status,
        table_session_id: result.order.table_session_id,
      });

      return c.json({ success: true, data: { ...result.order, items: result.items, payment_status: result.paymentStatus, total_paid: result.totalPaid } });
    } catch (err) {
      if (err instanceof OrderNotFoundError) {
        return c.json({ success: false, error: { code: "NOT_FOUND", message: err.message } }, 404);
      }
      if (err instanceof OrderValidationError) {
        return c.json({ success: false, error: { code: "BAD_REQUEST", message: err.message } }, 400);
      }
      throw err;
    }
  },
);

// DELETE /:id/items/:itemId - remove item from existing order
orders.delete(
  "/:id/items/:itemId",
  requirePermission("orders:update"),
  zValidator("param", orderItemParam),
  async (c) => {
    const { id, itemId } = c.req.valid("param");
    const tenant = c.get("tenant") as any;

    try {
      const result = await removeOrderItem({
        orderId: id,
        branchId: tenant.branchId,
        itemId,
      });

      await broadcastOrderUpdated(tenant.branchId, {
        id: result.order.id,
        order_number: result.order.order_number,
        status: result.order.status,
        table_session_id: result.order.table_session_id,
      });

      return c.json({ success: true, data: { ...result.order, items: result.items, payment_status: result.paymentStatus, total_paid: result.totalPaid } });
    } catch (err) {
      if (err instanceof OrderNotFoundError) {
        return c.json({ success: false, error: { code: "NOT_FOUND", message: err.message } }, 404);
      }
      if (err instanceof OrderValidationError) {
        return c.json({ success: false, error: { code: "BAD_REQUEST", message: err.message } }, 400);
      }
      throw err;
    }
  },
);

// DELETE /:id - Permanently delete an order
orders.delete(
  "/:id",
  requirePermission("orders:delete"),
  zValidator("param", idParamSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const tenant = c.get("tenant") as any;

    try {
      await deleteOrder({
        orderId: id,
        branchId: tenant.branchId,
        organizationId: tenant.organizationId,
      });
      return c.json({ success: true, data: { id } });
    } catch (err) {
      if (err instanceof OrderNotFoundError) {
        return c.json(
          { success: false, error: { code: "NOT_FOUND", message: err.message } },
          404,
        );
      }
      throw err;
    }
  },
);

export { orders };
