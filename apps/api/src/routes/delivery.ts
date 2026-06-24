import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { zValidator } from "@hono/zod-validator";
import { eq, and, inArray, or } from "drizzle-orm";
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

  const items = await db
    .select()
    .from(schema.menuItems)
    .where(
      and(
        eq(schema.menuItems.branch_id, branch.id),
        eq(schema.menuItems.is_available, true),
      ),
    );

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
      },
      categories,
      items,
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
        total: schema.orders.total,
        delivery_phone: schema.orders.delivery_phone,
        delivery_fee: schema.orders.delivery_fee,
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

    return c.json({ success: true, data: order });
  },
);

export { delivery };
