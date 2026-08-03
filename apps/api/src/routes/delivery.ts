import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, inArray, or, isNotNull, sql, ne } from "drizzle-orm";
import { db, schema } from "@restai/db";
import {
  getDeliveryFeeCents,
  parseDeliveryPaymentMethods,
  parseDeliveryPricing,
} from "@restai/config";
import {
  createDeliveryOrderSchema,
  deliveryOrderStatusQuerySchema,
  quoteDeliveryFeeSchema,
} from "@restai/validators";
import { createOrder, OrderValidationError } from "../services/order.service.js";
import { findOrCreateByPhone } from "../services/customer.service.js";
import {
  notifyDeliveryOrderCreated,
} from "../services/whatsapp.service.js";
import { quoteDeliveryFeeForAddress } from "../services/delivery-fee.service.js";
import { isLegacyOutsideCupGroupName } from "@restai/config";
import { wsManager } from "../ws/manager.js";
import { orgHasFeature } from "../lib/features.js";
import { resolveHost } from "../lib/tenant-host.js";
import type { Context } from "hono";

const delivery = new Hono<AppEnv>();

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Resolve organization from Host / X-Organization-Id when present (multi-tenant isolation). */
async function resolveOrganizationId(c: Context): Promise<string | null> {
  const headerOrg = c.req.header("x-organization-id")?.trim();
  if (headerOrg) return headerOrg;

  const host =
    c.req.header("x-forwarded-host") ||
    c.req.header("host") ||
    "";
  const resolved = await resolveHost(host);
  return resolved?.organizationId ?? null;
}

async function findBranchBySlug(branchSlug: string, organizationId: string | null) {
  const [branch] = await db
    .select()
    .from(schema.branches)
    .where(
      organizationId
        ? and(
            eq(schema.branches.slug, branchSlug),
            eq(schema.branches.organization_id, organizationId),
          )
        : eq(schema.branches.slug, branchSlug),
    )
    .limit(1);
  return branch ?? null;
}

async function getActiveBranch(branchSlug: string, organizationId: string | null = null) {
  const branch = await findBranchBySlug(branchSlug, organizationId);
  if (!branch || !branch.is_active) return null;

  const settings = (branch.settings || {}) as Record<string, unknown>;
  const deliveryEnabled = settings.delivery_enabled !== false;
  if (!deliveryEnabled) return null;

  // Plan must include the delivery feature.
  const planAllows = await orgHasFeature(branch.organization_id, "delivery");
  if (!planAllows) return null;

  return branch;
}

// Like getActiveBranch but returns even when delivery is disabled (for showing the offline message).
async function getBranchForMenu(
  branchSlug: string,
  organizationId: string | null = null,
): Promise<
  | { branch: typeof schema.branches.$inferSelect; disabled: false }
  | { branch: typeof schema.branches.$inferSelect; disabled: true; offlineMessage: string }
  | null
> {
  const branch = await findBranchBySlug(branchSlug, organizationId);
  if (!branch || !branch.is_active) return null;

  const settings = (branch.settings || {}) as Record<string, unknown>;
  const deliveryEnabled = settings.delivery_enabled !== false;

  if (!deliveryEnabled) {
    const offlineMessage =
      (settings.delivery_offline_message as string | undefined) ||
      "No momento não estamos aceitando pedidos. Em breve voltamos!";
    return { branch, disabled: true, offlineMessage };
  }

  const planAllows = await orgHasFeature(branch.organization_id, "delivery");
  if (!planAllows) return null;

  return { branch, disabled: false };
}

delivery.get("/:branchSlug/zones", async (c) => {
  const branchSlug = c.req.param("branchSlug");
  const organizationId = await resolveOrganizationId(c);
  const branch = await getActiveBranch(branchSlug, organizationId);
  if (!branch) {
    return c.json({ success: true, data: [] });
  }
  const zones = await db
    .select()
    .from(schema.deliveryZones)
    .where(and(eq(schema.deliveryZones.branch_id, branch.id), eq(schema.deliveryZones.is_active, true)))
    .orderBy(schema.deliveryZones.sort_order, schema.deliveryZones.name);

  const settings = (branch.settings || {}) as Record<string, unknown>;
  const paymentMethods = parseDeliveryPaymentMethods(settings.payment_methods);
  const pricing = parseDeliveryPricing(settings);
  return c.json({
    success: true,
    data: pricing.mode === "zones" ? zones : [],
    meta: {
      pickup_enabled: settings.pickup_enabled !== false,
      pickup_address:
        (settings.pickup_address as string) || branch.address || null,
      pickup_hint: (settings.pickup_hint as string) || null,
      pickup_unavailable_message:
        (settings.pickup_unavailable_message as string) || null,
      delivery_label: (settings.delivery_label as string) || null,
      pickup_label: (settings.pickup_label as string) || null,
      payment_methods: paymentMethods,
      currency: branch.currency,
      delivery_pricing_mode: pricing.mode,
      delivery_fee_from_cents:
        pricing.mode === "radius" && pricing.tiers.length > 0
          ? Math.min(...pricing.tiers.map((t) => t.fee_cents))
          : pricing.mode === "cities" && pricing.cities.length > 0
            ? Math.min(...pricing.cities.map((t) => t.fee_cents))
            : null,
      // Bias/filter autocomplete near the store (US branches → MA by currency for now)
      autocomplete_country: branch.currency === "USD" ? "us" : null,
      autocomplete_state_code: null,
      store_lat: pricing.store?.lat ?? null,
      store_lng: pricing.store?.lng ?? null,
      delivery_cities:
        pricing.mode === "cities"
          ? pricing.cities.map((c) => ({ name: c.name, fee_cents: c.fee_cents }))
          : [],
    },
  });
});

delivery.post(
  "/:branchSlug/quote-fee",
  zValidator("json", quoteDeliveryFeeSchema),
  async (c) => {
    const branchSlug = c.req.param("branchSlug");
    const organizationId = await resolveOrganizationId(c);
    const branch = await getActiveBranch(branchSlug, organizationId);
    if (!branch) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Filial não encontrada" } },
        404,
      );
    }

    const body = c.req.valid("json");
    const quote = await quoteDeliveryFeeForAddress(
      branch.settings,
      body.address,
      body.city,
    );

    if (!quote.ok) {
      const status =
        quote.code === "geocode_unavailable"
          ? 503
          : quote.code === "not_auto"
            ? 400
            : 422;
      return c.json(
        {
          success: false,
          error: {
            code: quote.code.toUpperCase(),
            message: quote.message,
            distance_miles: quote.distance_miles,
            city: quote.city,
          },
        },
        status,
      );
    }

    return c.json({
      success: true,
      data: {
        fee_cents: quote.fee_cents,
        fee_status: quote.fee_status,
        distance_miles: quote.distance_miles,
        tier_label: quote.tier_label,
        max_miles: quote.max_miles,
        city: quote.city,
        formatted_address: quote.formatted_address,
        message: quote.message ?? null,
      },
    });
  },
);

delivery.get("/:branchSlug/menu", async (c) => {
  const branchSlug = c.req.param("branchSlug");
  const organizationId = await resolveOrganizationId(c);
  const result = await getBranchForMenu(branchSlug, organizationId);

  if (!result) {
    return c.json(
      { success: false, error: { code: "NOT_FOUND", message: "Filial não encontrada" } },
      404,
    );
  }

  if (result.disabled) {
    return c.json(
      { success: false, error: { code: "DELIVERY_DISABLED", message: result.offlineMessage } },
      503,
    );
  }

  const branch = result.branch;
  const settings = (branch.settings || {}) as Record<string, unknown>;

  const [org] = await db
    .select({
      name: schema.organizations.name,
      logo_url: schema.organizations.logo_url,
      settings: schema.organizations.settings,
    })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, branch.organization_id))
    .limit(1);

  const orgSettings = (org?.settings || {}) as Record<string, unknown>;
  const menuTheme =
    (typeof settings.menu_theme === "string" && settings.menu_theme) ||
    (typeof orgSettings.menu_theme === "string" && orgSettings.menu_theme) ||
    "organic";

  const categories = await db
    .select()
    .from(schema.menuCategories)
    .where(
      and(
        eq(schema.menuCategories.branch_id, branch.id),
        eq(schema.menuCategories.is_active, true),
      ),
    );

  const [items, salesRows, modifierLinks] = await Promise.all([
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
    db
      .select({ item_id: schema.menuItemModifierGroups.item_id })
      .from(schema.menuItemModifierGroups)
      .innerJoin(
        schema.menuItems,
        eq(schema.menuItems.id, schema.menuItemModifierGroups.item_id),
      )
      .where(eq(schema.menuItems.branch_id, branch.id)),
  ]);

  const salesMap = new Map(salesRows.map((r) => [r.menu_item_id, r.total_sold]));
  const itemsWithModifiers = new Set(modifierLinks.map((r) => r.item_id));
  const itemsWithSales = items.map((item) => ({
    ...item,
    total_sold: salesMap.get(item.id) ?? 0,
    has_modifiers: itemsWithModifiers.has(item.id),
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
        phone: branch.phone || null,
        menu_display_name: (settings.menu_display_name as string) || null,
        menu_subtitle: (settings.menu_subtitle as string) || null,
        menu_delivery_text: (settings.menu_delivery_text as string) || null,
        all_products_tab_sort_order: typeof settings.all_products_tab_sort_order === "number" ? settings.all_products_tab_sort_order : null,
        menu_theme: menuTheme,
        pickup_enabled: settings.pickup_enabled !== false,
        pickup_address: (settings.pickup_address as string) || null,
        pickup_hint: (settings.pickup_hint as string) || null,
        pickup_unavailable_message:
          (settings.pickup_unavailable_message as string) || null,
        delivery_label: (settings.delivery_label as string) || null,
        pickup_label: (settings.pickup_label as string) || null,
        branch_address: branch.address || null,
      },
      landing: {
        enabled: settings.landing_enabled === true,
        title: (settings.landing_title as string) || null,
        description: (settings.landing_description as string) || null,
        button_text: (settings.landing_button_text as string) || null,
        button_url: (settings.landing_button_url as string) || null,
        social_instagram: (settings.social_instagram as string) || null,
        social_tiktok: (settings.social_tiktok as string) || null,
        social_whatsapp: (settings.social_whatsapp as string) || null,
      },
      categories,
      items: itemsWithSales,
    },
  });
});

delivery.get("/:branchSlug/menu/items/:itemId/modifiers", async (c) => {
  const branchSlug = c.req.param("branchSlug");
  const itemId = c.req.param("itemId");
  const organizationId = await resolveOrganizationId(c);
  const branch = await getActiveBranch(branchSlug, organizationId);

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

  const result = groups
    .filter((g) => !isLegacyOutsideCupGroupName(g.name))
    .map((g) => ({
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
    const organizationId = await resolveOrganizationId(c);
    const branch = await getActiveBranch(branchSlug, organizationId);

    if (!branch) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Filial não encontrada ou delivery indisponível" } },
        404,
      );
    }

    const branchSettings = (branch.settings || {}) as Record<string, unknown>;
    if (body.fulfillment === "pickup" && branchSettings.pickup_enabled === false) {
      return c.json(
        {
          success: false,
          error: {
            code: "PICKUP_DISABLED",
            message:
              (branchSettings.pickup_unavailable_message as string) ||
              "No momento não estamos aceitando retirada",
          },
        },
        403,
      );
    }

    if (body.paymentMethod) {
      const allowed = parseDeliveryPaymentMethods(branchSettings.payment_methods);
      if (!allowed.includes(body.paymentMethod as (typeof allowed)[number])) {
        return c.json(
          {
            success: false,
            error: {
              code: "BAD_REQUEST",
              message: "Forma de pagamento não disponível nesta loja",
            },
          },
          400,
        );
      }
    }

    const orderType = body.fulfillment === "pickup" ? "takeout" : "delivery";
    const pricing = parseDeliveryPricing(branchSettings);

    // Resolve delivery fee (cities: soft; radius: hard; zones: named zone)
    let deliveryFeeOverrideCents: number | null = null;
    let deliveryFeeStatus: "confirmed" | "pending" = "confirmed";
    let deliveryCity: string | null = body.deliveryCity?.trim() || null;

    if (orderType === "delivery") {
      if (pricing.mode === "cities") {
        if (!deliveryCity) {
          return c.json(
            {
              success: false,
              error: {
                code: "BAD_REQUEST",
                message: "Selecione sua cidade de entrega",
              },
            },
            400,
          );
        }
        const address = body.deliveryAddress?.trim();
        if (!address) {
          return c.json(
            {
              success: false,
              error: { code: "BAD_REQUEST", message: "Endereço de entrega é obrigatório" },
            },
            400,
          );
        }
        const quote = await quoteDeliveryFeeForAddress(
          branchSettings,
          address,
          deliveryCity,
        );
        if (!quote.ok) {
          return c.json(
            {
              success: false,
              error: {
                code: quote.code.toUpperCase(),
                message: quote.message,
              },
            },
            422,
          );
        }
        deliveryFeeOverrideCents = quote.fee_cents;
        deliveryFeeStatus = quote.fee_status;
        deliveryCity = quote.city || deliveryCity;
      } else if (pricing.mode === "radius") {
        const address = body.deliveryAddress?.trim();
        if (!address) {
          return c.json(
            {
              success: false,
              error: { code: "BAD_REQUEST", message: "Endereço de entrega é obrigatório" },
            },
            400,
          );
        }
        const quote = await quoteDeliveryFeeForAddress(branchSettings, address);
        if (!quote.ok) {
          const status = quote.code === "geocode_unavailable" ? 503 : 422;
          return c.json(
            {
              success: false,
              error: {
                code: quote.code.toUpperCase(),
                message: quote.message,
              },
            },
            status,
          );
        }
        deliveryFeeOverrideCents = quote.fee_cents;
        deliveryFeeStatus = "confirmed";
      } else if (body.deliveryZoneId) {
        const [zone] = await db
          .select({ fee_cents: schema.deliveryZones.fee_cents })
          .from(schema.deliveryZones)
          .where(
            and(
              eq(schema.deliveryZones.id, body.deliveryZoneId),
              eq(schema.deliveryZones.branch_id, branch.id),
              eq(schema.deliveryZones.is_active, true),
            ),
          )
          .limit(1);
        if (zone) deliveryFeeOverrideCents = zone.fee_cents;
      }
    }

    let customerId: string | null = null;
    if (body.deliveryPhone?.trim()) {
      try {
        const linked = await findOrCreateByPhone({
          organizationId: branch.organization_id,
          phone: normalizePhone(body.deliveryPhone) || body.deliveryPhone.trim(),
          name: body.customerName?.trim() || "Cliente",
          address:
            orderType === "delivery" ? body.deliveryAddress?.trim() : undefined,
          city: orderType === "delivery" ? deliveryCity || undefined : undefined,
          reference:
            orderType === "delivery"
              ? body.deliveryReference?.trim() || undefined
              : undefined,
        });
        customerId = linked.customer.id;
      } catch {
        // Non-blocking: order still proceeds without CRM link
        customerId = null;
      }
    }

    let result;
    try {
      result = await createOrder({
        organizationId: branch.organization_id,
        branchId: branch.id,
        items: body.items,
        type: orderType,
        customerName: body.customerName,
        customerId,
        notes: body.notes,
        deliveryPhone: body.deliveryPhone,
        deliveryAddress: orderType === "delivery" ? body.deliveryAddress : null,
        deliveryReference: orderType === "delivery" ? body.deliveryReference : null,
        couponCode: body.couponCode || null,
        redemptionId: body.redemptionId || null,
        paymentMethod: body.paymentMethod || null,
        deliveryFeeOverrideCents,
        deliveryFeeStatus: orderType === "delivery" ? deliveryFeeStatus : "confirmed",
        deliveryCity: orderType === "delivery" ? deliveryCity : null,
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
    const organizationId = await resolveOrganizationId(c);
    const branch = await getActiveBranch(branchSlug, organizationId);

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
        notes: schema.orderItems.notes,
      })
      .from(schema.orderItems)
      .where(eq(schema.orderItems.order_id, orderId));

    const itemIds = items.map((i) => i.id);
    const modifierRows =
      itemIds.length === 0
        ? []
        : await db
            .select({
              order_item_id: schema.orderItemModifiers.order_item_id,
              name: schema.orderItemModifiers.name,
              price: schema.orderItemModifiers.price,
              is_outside_cup: schema.orderItemModifiers.is_outside_cup,
            })
            .from(schema.orderItemModifiers)
            .where(
              itemIds.length === 1
                ? eq(schema.orderItemModifiers.order_item_id, itemIds[0]!)
                : inArray(schema.orderItemModifiers.order_item_id, itemIds),
            );

    const modsByItem = new Map<
      string,
      Array<{ name: string; price: number; is_outside_cup: boolean }>
    >();
    for (const m of modifierRows) {
      const list = modsByItem.get(m.order_item_id) ?? [];
      list.push({
        name: m.name,
        price: m.price,
        is_outside_cup: m.is_outside_cup,
      });
      modsByItem.set(m.order_item_id, list);
    }

    const itemsWithModifiers = items.map((item) => ({
      ...item,
      modifiers: modsByItem.get(item.id) ?? [],
    }));

    return c.json({ success: true, data: { ...order, items: itemsWithModifiers } });
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
    const organizationId = await resolveOrganizationId(c);
    const branch = await getActiveBranch(branchSlug, organizationId);

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
    const organizationId = await resolveOrganizationId(c);
    const branch = await getActiveBranch(branchSlug, organizationId);

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
