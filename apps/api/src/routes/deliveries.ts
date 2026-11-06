import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq, gte, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { db, schema } from "@restai/db";
import {
  PERMISSIONS,
  DEFAULT_DELIVERY_WAIT_LIMIT_MINUTES,
  describeStopReason,
  evaluateDeliveryRoute,
  hasDeliveryDispatch,
  planDeliveryRoute,
  type RoutePoint,
  type RouteStopInput,
} from "@restai/config";
import {
  deliveryDeliveredSchema,
  deliveryOrderIdsSchema,
  deliveryReorderSchema,
  deliveryReplanSchema,
  deliverySettingsSchema,
} from "@restai/validators";
import { authMiddleware } from "../middleware/auth.js";
import { tenantMiddleware, requireBranch } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/rbac.js";
import { requireActivePlan } from "../middleware/active-plan.js";
import { requireOrgUxFlag } from "../middleware/org-ux-flag.js";
import { geocodeAddress } from "../lib/geocode.js";
import { startOfDayInTimezone } from "../lib/timezone.js";
import { handleOrderCompletion } from "../services/order.service.js";
import { wsManager } from "../ws/manager.js";
import { logger } from "../lib/logger.js";

/**
 * "Entregas" (org flag `delivery_dispatch`, Açaí House): ready delivery orders wait in a
 * queue; drivers claim them, order their own route (the system suggests one that weighs
 * wait time + distance), and mark each stop delivered with cash received and tip.
 * Nothing here changes how orders are created, priced or paid.
 */
const deliveries = new Hono<AppEnv>();

deliveries.use("*", authMiddleware);
deliveries.use("*", tenantMiddleware);
deliveries.use("*", requireBranch);
deliveries.use("*", requireActivePlan);
deliveries.use("*", requireOrgUxFlag(hasDeliveryDispatch, "Entregas"));

/** Ready/pending orders older than this are not shown (stale leftovers). */
const QUEUE_WINDOW_HOURS = 18;
const TIP_METHODS = ["cash", "card", "zelle", "venmo", "cashapp"] as const;

const orderIdParam = z.object({ orderId: z.string().uuid() });

// ── helpers ───────────────────────────────────────────────────────

function userCan(user: any, permission: string): boolean {
  const perms = PERMISSIONS[user?.role as keyof typeof PERMISSIONS] as readonly string[] | undefined;
  if (!perms) return false;
  if (perms.includes("*")) return true;
  const [resource] = permission.split(":");
  return perms.some((p) => p === permission || p === `${resource}:*`);
}

function fail(c: any, status: 400 | 403 | 404, code: string, message: string) {
  return c.json({ success: false, error: { code, message } }, status);
}

async function loadBranch(branchId: string) {
  const [branch] = await db
    .select()
    .from(schema.branches)
    .where(eq(schema.branches.id, branchId))
    .limit(1);
  return branch ?? null;
}

function waitLimitOf(branch: { settings: unknown } | null): number {
  const raw = Number((branch?.settings as Record<string, unknown> | undefined)?.delivery_wait_limit_minutes);
  return Number.isFinite(raw) && raw >= 10 && raw <= 180
    ? Math.round(raw)
    : DEFAULT_DELIVERY_WAIT_LIMIT_MINUTES;
}

const ORIGIN_TTL_MS = 6 * 60 * 60 * 1000;
const originCache = new Map<string, { at: number; point: RoutePoint | null }>();

/** Branch address on the map (cached). Null when the branch has no usable address. */
async function branchOrigin(branch: { id: string; address: string | null } | null): Promise<RoutePoint | null> {
  if (!branch) return null;
  const hit = originCache.get(branch.id);
  if (hit && Date.now() - hit.at < ORIGIN_TTL_MS) return hit.point;
  let point: RoutePoint | null = null;
  const address = branch.address?.trim();
  if (address) {
    try {
      const g = await geocodeAddress(address);
      if (g) point = { lat: g.lat, lng: g.lng };
    } catch (err) {
      logger.warn("deliveries: branch geocode failed", { branchId: branch.id, error: (err as Error).message });
    }
  }
  originCache.set(branch.id, { at: Date.now(), point });
  return point;
}

async function locate(address: string | null): Promise<RoutePoint | null> {
  const text = address?.trim();
  if (!text) return null;
  try {
    const g = await geocodeAddress(text);
    return g ? { lat: g.lat, lng: g.lng } : null;
  } catch (err) {
    logger.warn("deliveries: geocode failed", { error: (err as Error).message });
    return null;
  }
}

const orderCols = {
  id: schema.orders.id,
  order_number: schema.orders.order_number,
  status: schema.orders.status,
  customer_name: schema.orders.customer_name,
  delivery_phone: schema.orders.delivery_phone,
  delivery_address: schema.orders.delivery_address,
  delivery_reference: schema.orders.delivery_reference,
  delivery_city: schema.orders.delivery_city,
  payment_method: schema.orders.payment_method,
  total: schema.orders.total,
  notes: schema.orders.notes,
  created_at: schema.orders.created_at,
};

type OrderRow = {
  id: string;
  order_number: string;
  status: string;
  customer_name: string | null;
  delivery_phone: string | null;
  delivery_address: string | null;
  delivery_reference: string | null;
  delivery_city: string | null;
  payment_method: string | null;
  total: number;
  notes: string | null;
  created_at: Date;
};

function stopDto(o: OrderRow, now: number) {
  const cash = o.payment_method === "cash";
  return {
    orderId: o.id,
    orderNumber: o.order_number,
    status: o.status,
    customerName: o.customer_name,
    phone: o.delivery_phone,
    address: o.delivery_address,
    reference: o.delivery_reference,
    city: o.delivery_city,
    notes: o.notes,
    paymentMethod: o.payment_method,
    totalCents: o.total,
    /** What the driver must collect at the door (cash orders only). */
    collectCents: cash ? o.total : 0,
    createdAt: o.created_at.toISOString(),
    waitMinutes: Math.max(0, Math.round((now - o.created_at.getTime()) / 60000)),
  };
}

type Assignment = typeof schema.deliveryAssignments.$inferSelect;

/** Undelivered assignments of one driver on this branch, in route order, with their order. */
async function activeAssignments(branchId: string, driverId: string | null) {
  const conditions = [
    eq(schema.deliveryAssignments.branch_id, branchId),
    isNull(schema.deliveryAssignments.delivered_at),
    notInArray(schema.orders.status, ["completed", "cancelled"]),
  ];
  if (driverId) conditions.push(eq(schema.deliveryAssignments.driver_user_id, driverId));
  return db
    .select({
      a: schema.deliveryAssignments,
      o: orderCols,
      driverName: schema.users.name,
    })
    .from(schema.deliveryAssignments)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.deliveryAssignments.order_id))
    .innerJoin(schema.users, eq(schema.users.id, schema.deliveryAssignments.driver_user_id))
    .where(and(...conditions))
    .orderBy(schema.deliveryAssignments.position, schema.deliveryAssignments.claimed_at);
}

function toRouteStops(rows: { a: Assignment; o: { id: string; created_at: Date } }[]): RouteStopInput[] {
  return rows.map((r) => ({ id: r.o.id, lat: r.a.lat, lng: r.a.lng, createdAt: r.o.created_at }));
}

async function publishOrderUpdated(branchId: string, order: { id: string; order_number: string }, status: string) {
  const payload = {
    type: "order:updated",
    payload: { orderId: order.id, orderNumber: order.order_number, status },
    timestamp: Date.now(),
  };
  try {
    await wsManager.publish(`branch:${branchId}`, payload);
    await wsManager.publish(`branch:${branchId}:kitchen`, payload);
  } catch (err) {
    logger.warn("deliveries: ws publish failed", { error: (err as Error).message });
  }
}

// ── GET / — board ─────────────────────────────────────────────────

deliveries.get("/", requirePermission("deliveries:view"), async (c) => {
  const user = c.get("user") as any;
  const tenant = c.get("tenant") as any;
  const now = Date.now();
  const since = new Date(now - QUEUE_WINDOW_HOURS * 3600 * 1000);

  const canManage = userCan(user, "deliveries:manage");
  const canDrive = userCan(user, "deliveries:drive");

  const branch = await loadBranch(tenant.branchId);
  const limit = waitLimitOf(branch);
  const origin = await branchOrigin(branch);

  const queueRows = (await db
    .select(orderCols)
    .from(schema.orders)
    .leftJoin(schema.deliveryAssignments, eq(schema.deliveryAssignments.order_id, schema.orders.id))
    .where(
      and(
        eq(schema.orders.branch_id, tenant.branchId),
        eq(schema.orders.type, "delivery"),
        eq(schema.orders.status, "ready"),
        gte(schema.orders.created_at, since),
        isNull(schema.deliveryAssignments.id),
      ),
    )
    .orderBy(schema.orders.created_at)) as OrderRow[];

  const waitingRows = canManage
    ? ((await db
        .select(orderCols)
        .from(schema.orders)
        .where(
          and(
            eq(schema.orders.branch_id, tenant.branchId),
            eq(schema.orders.type, "delivery"),
            inArray(schema.orders.status, ["pending", "confirmed", "preparing"]),
            gte(schema.orders.created_at, since),
          ),
        )
        .orderBy(schema.orders.created_at)) as OrderRow[])
    : [];

  const active = await activeAssignments(tenant.branchId, null);
  const mineRows = active.filter((r) => r.a.driver_user_id === user.sub);
  const otherRows = active.filter((r) => r.a.driver_user_id !== user.sub);

  const stops = toRouteStops(mineRows);
  const evaluated = evaluateDeliveryRoute(stops, origin, { now, limitMinutes: limit });
  const suggested = planDeliveryRoute(stops, origin, { now, limitMinutes: limit });
  const suggestionDiffers = suggested.some((s, i) => s.id !== stops[i]?.id);

  const mine = mineRows.map((r, i) => {
    const ev = evaluated[i]!;
    return {
      ...stopDto(r.o as OrderRow, now),
      position: i,
      located: r.a.lat != null && r.a.lng != null,
      etaMinutes: ev.etaMinutes,
      waitAtArrival: ev.waitAtArrival,
      reason: ev.reason,
      reasonText: describeStopReason(ev, limit),
    };
  });

  const others = otherRows.map((r) => ({
    orderId: r.o.id,
    orderNumber: r.o.order_number,
    city: r.o.delivery_city,
    address: canManage ? r.o.delivery_address : null,
    waitMinutes: Math.max(0, Math.round((now - r.o.created_at.getTime()) / 60000)),
    driverId: r.a.driver_user_id,
    driverName: r.driverName,
    position: r.a.position,
  }));

  // Today's numbers (branch timezone): a driver sees his own, managers see everyone.
  const dayStart = startOfDayInTimezone(branch?.timezone || "America/New_York");
  const deliveredConditions = [
    eq(schema.deliveryAssignments.branch_id, tenant.branchId),
    gte(schema.deliveryAssignments.delivered_at, dayStart),
  ];
  if (!canManage) deliveredConditions.push(eq(schema.deliveryAssignments.driver_user_id, user.sub));
  const deliveredToday = await db
    .select({
      driverId: schema.deliveryAssignments.driver_user_id,
      driverName: schema.users.name,
      cash: schema.deliveryAssignments.cash_collected,
      tip: schema.deliveryAssignments.tip_cents,
      tipMethod: schema.deliveryAssignments.tip_method,
    })
    .from(schema.deliveryAssignments)
    .innerJoin(schema.users, eq(schema.users.id, schema.deliveryAssignments.driver_user_id))
    .where(and(...deliveredConditions));

  const byDriver = new Map<
    string,
    {
      driverId: string;
      driverName: string;
      deliveries: number;
      cashCollectedCents: number;
      tips: Record<string, number>;
      tipsTotalCents: number;
    }
  >();
  for (const r of deliveredToday) {
    const row =
      byDriver.get(r.driverId) ??
      {
        driverId: r.driverId,
        driverName: r.driverName,
        deliveries: 0,
        cashCollectedCents: 0,
        tips: Object.fromEntries(TIP_METHODS.map((m) => [m, 0])) as Record<string, number>,
        tipsTotalCents: 0,
      };
    row.deliveries += 1;
    row.cashCollectedCents += r.cash;
    if (r.tip > 0) {
      const m = r.tipMethod && (TIP_METHODS as readonly string[]).includes(r.tipMethod) ? r.tipMethod : "cash";
      row.tips[m] = (row.tips[m] ?? 0) + r.tip;
      row.tipsTotalCents += r.tip;
    }
    byDriver.set(r.driverId, row);
  }

  return c.json({
    success: true,
    data: {
      settings: { waitLimitMinutes: limit },
      me: { id: user.sub, canDrive, canManage },
      queue: queueRows.map((o) => stopDto(o, now)),
      waiting: waitingRows.map((o) => stopDto(o, now)),
      mine,
      suggestionDiffers,
      others,
      today: [...byDriver.values()],
      hasOrigin: origin != null,
    },
  });
});

// ── POST /claim — take (or assign) ready orders ───────────────────

deliveries.post(
  "/claim",
  requirePermission("deliveries:view"),
  zValidator("json", deliveryOrderIdsSchema),
  async (c) => {
    const user = c.get("user") as any;
    const tenant = c.get("tenant") as any;
    const body = c.req.valid("json");

    let driverId: string = user.sub;
    if (body.driverUserId && body.driverUserId !== user.sub) {
      if (!userCan(user, "deliveries:manage")) {
        return fail(c, 403, "FORBIDDEN", "Sem permissão para atribuir a outro entregador");
      }
      const [driver] = await db
        .select({ id: schema.users.id, role: schema.users.role })
        .from(schema.users)
        .where(
          and(
            eq(schema.users.id, body.driverUserId),
            eq(schema.users.organization_id, tenant.organizationId),
            eq(schema.users.is_active, true),
          ),
        )
        .limit(1);
      if (!driver) return fail(c, 400, "BAD_REQUEST", "Entregador não encontrado");
      if (driver.role !== "org_admin" && driver.role !== "super_admin") {
        const [link] = await db
          .select({ u: schema.userBranches.user_id })
          .from(schema.userBranches)
          .where(
            and(
              eq(schema.userBranches.user_id, driver.id),
              eq(schema.userBranches.branch_id, tenant.branchId),
            ),
          )
          .limit(1);
        if (!link) return fail(c, 400, "BAD_REQUEST", "Esse entregador não atende esta filial");
      }
      driverId = driver.id;
    } else if (!userCan(user, "deliveries:drive")) {
      return fail(c, 403, "FORBIDDEN", "Sem permissão para pegar entregas");
    }

    const now = Date.now();
    const branch = await loadBranch(tenant.branchId);
    const limit = waitLimitOf(branch);

    const orders = (await db
      .select(orderCols)
      .from(schema.orders)
      .where(
        and(
          inArray(schema.orders.id, body.orderIds),
          eq(schema.orders.branch_id, tenant.branchId),
          eq(schema.orders.type, "delivery"),
          eq(schema.orders.status, "ready"),
        ),
      )) as OrderRow[];

    const existing = await activeAssignments(tenant.branchId, driverId);
    const lastExisting = existing[existing.length - 1];
    const startPosition = existing.length > 0 ? Math.max(...existing.map((e) => e.a.position)) + 1 : 0;

    // Where the new stops start from: end of the current route, else the driver's GPS, else the branch.
    let origin: RoutePoint | null = null;
    if (lastExisting && lastExisting.a.lat != null && lastExisting.a.lng != null) {
      origin = { lat: lastExisting.a.lat, lng: lastExisting.a.lng };
    } else if (body.lat != null && body.lng != null) {
      origin = { lat: body.lat, lng: body.lng };
    } else {
      origin = await branchOrigin(branch);
    }

    const located = await Promise.all(orders.map((o) => locate(o.delivery_address)));
    const stops: RouteStopInput[] = orders.map((o, i) => ({
      id: o.id,
      lat: located[i]?.lat ?? null,
      lng: located[i]?.lng ?? null,
      createdAt: o.created_at,
    }));
    const plan = planDeliveryRoute(stops, origin, { now, limitMinutes: limit });
    const coordsById = new Map(stops.map((s) => [s.id, s]));

    let claimed = 0;
    await db.transaction(async (tx) => {
      for (const step of plan) {
        const s = coordsById.get(step.id)!;
        const inserted = await tx
          .insert(schema.deliveryAssignments)
          .values({
            organization_id: tenant.organizationId,
            branch_id: tenant.branchId,
            order_id: step.id,
            driver_user_id: driverId,
            position: startPosition + claimed,
            lat: s.lat,
            lng: s.lng,
          })
          .onConflictDoNothing({ target: schema.deliveryAssignments.order_id })
          .returning({ id: schema.deliveryAssignments.id });
        if (inserted.length > 0) claimed += 1;
      }
    });

    const takenIds = body.orderIds.filter((id) => !orders.some((o) => o.id === id));
    return c.json({
      success: true,
      data: {
        claimed,
        // not ready anymore, not in this branch, or taken by someone else a moment ago
        unavailable: takenIds.length + (orders.length - claimed),
      },
    });
  },
);

// ── POST /reorder — driver's own order ────────────────────────────

deliveries.post(
  "/reorder",
  requirePermission("deliveries:drive"),
  zValidator("json", deliveryReorderSchema),
  async (c) => {
    const user = c.get("user") as any;
    const tenant = c.get("tenant") as any;
    const { orderIds } = c.req.valid("json");

    const mine = await activeAssignments(tenant.branchId, user.sub);
    const mineIds = new Set(mine.map((m) => m.o.id));
    if (orderIds.some((id) => !mineIds.has(id))) {
      return fail(c, 400, "BAD_REQUEST", "A lista tem pedidos que não estão na sua rota");
    }
    const ordered = [...orderIds, ...mine.map((m) => m.o.id).filter((id) => !orderIds.includes(id))];

    await db.transaction(async (tx) => {
      for (let i = 0; i < ordered.length; i++) {
        await tx
          .update(schema.deliveryAssignments)
          .set({ position: i })
          .where(eq(schema.deliveryAssignments.order_id, ordered[i]!));
      }
    });
    return c.json({ success: true, data: { ok: true } });
  },
);

// ── POST /replan — apply the system's suggested order ─────────────

deliveries.post(
  "/replan",
  requirePermission("deliveries:drive"),
  zValidator("json", deliveryReplanSchema),
  async (c) => {
    const user = c.get("user") as any;
    const tenant = c.get("tenant") as any;
    const body = c.req.valid("json");
    const now = Date.now();

    const branch = await loadBranch(tenant.branchId);
    const limit = waitLimitOf(branch);
    const mine = await activeAssignments(tenant.branchId, user.sub);
    if (mine.length === 0) return c.json({ success: true, data: { ok: true } });

    // Retry geocoding for stops that could not be located before.
    const coords = new Map<string, RoutePoint | null>();
    await Promise.all(
      mine.map(async (m) => {
        if (m.a.lat != null && m.a.lng != null) {
          coords.set(m.o.id, { lat: m.a.lat, lng: m.a.lng });
        } else {
          coords.set(m.o.id, await locate(m.o.delivery_address));
        }
      }),
    );

    const origin: RoutePoint | null =
      body.lat != null && body.lng != null ? { lat: body.lat, lng: body.lng } : await branchOrigin(branch);

    const stops: RouteStopInput[] = mine.map((m) => ({
      id: m.o.id,
      lat: coords.get(m.o.id)?.lat ?? null,
      lng: coords.get(m.o.id)?.lng ?? null,
      createdAt: m.o.created_at,
    }));
    const plan = planDeliveryRoute(stops, origin, { now, limitMinutes: limit });

    await db.transaction(async (tx) => {
      for (const step of plan) {
        const p = coords.get(step.id);
        await tx
          .update(schema.deliveryAssignments)
          .set({ position: step.position, lat: p?.lat ?? null, lng: p?.lng ?? null })
          .where(eq(schema.deliveryAssignments.order_id, step.id));
      }
    });
    return c.json({ success: true, data: { ok: true } });
  },
);

// ── POST /:orderId/release — give an order back to the queue ──────

deliveries.post(
  "/:orderId/release",
  requirePermission("deliveries:view"),
  zValidator("param", orderIdParam),
  async (c) => {
    const user = c.get("user") as any;
    const tenant = c.get("tenant") as any;
    const { orderId } = c.req.valid("param");

    const [row] = await db
      .select()
      .from(schema.deliveryAssignments)
      .where(
        and(
          eq(schema.deliveryAssignments.order_id, orderId),
          eq(schema.deliveryAssignments.branch_id, tenant.branchId),
        ),
      )
      .limit(1);
    if (!row) return fail(c, 404, "NOT_FOUND", "Pedido não está em nenhuma rota");
    if (row.delivered_at) return fail(c, 400, "BAD_REQUEST", "Esse pedido já foi entregue");

    const isOwner = row.driver_user_id === user.sub && userCan(user, "deliveries:drive");
    if (!isOwner && !userCan(user, "deliveries:manage")) {
      return fail(c, 403, "FORBIDDEN", "Esse pedido está na rota de outro entregador");
    }

    await db
      .delete(schema.deliveryAssignments)
      .where(and(eq(schema.deliveryAssignments.id, row.id), isNull(schema.deliveryAssignments.delivered_at)));
    return c.json({ success: true, data: { ok: true } });
  },
);

// ── POST /:orderId/delivered — Entregue (+ cash received, + tip) ──

deliveries.post(
  "/:orderId/delivered",
  requirePermission("deliveries:view"),
  zValidator("param", orderIdParam),
  zValidator("json", deliveryDeliveredSchema),
  async (c) => {
    const user = c.get("user") as any;
    const tenant = c.get("tenant") as any;
    const { orderId } = c.req.valid("param");
    const body = c.req.valid("json");

    const [row] = await db
      .select({ a: schema.deliveryAssignments, o: schema.orders })
      .from(schema.deliveryAssignments)
      .innerJoin(schema.orders, eq(schema.orders.id, schema.deliveryAssignments.order_id))
      .where(
        and(
          eq(schema.deliveryAssignments.order_id, orderId),
          eq(schema.deliveryAssignments.branch_id, tenant.branchId),
        ),
      )
      .limit(1);
    if (!row) return fail(c, 404, "NOT_FOUND", "Pedido não está em nenhuma rota");

    const isOwner = row.a.driver_user_id === user.sub && userCan(user, "deliveries:drive");
    if (!isOwner && !userCan(user, "deliveries:manage")) {
      return fail(c, 403, "FORBIDDEN", "Esse pedido está na rota de outro entregador");
    }
    if (row.a.delivered_at) {
      return c.json({ success: true, data: { alreadyDelivered: true } });
    }
    if (row.o.status === "cancelled") {
      return fail(c, 400, "BAD_REQUEST", "Esse pedido foi cancelado");
    }

    const cashCollected = body.cashCollected && row.o.payment_method === "cash" ? row.o.total : 0;
    const tipCents = body.tipCents;
    const tipMethod = tipCents > 0 ? (body.tipMethod ?? "cash") : null;
    const wasCompleted = row.o.status === "completed";

    const marked = await db.transaction(async (tx) => {
      const [done] = await tx
        .update(schema.deliveryAssignments)
        .set({
          delivered_at: new Date(),
          cash_collected: cashCollected,
          tip_cents: tipCents,
          tip_method: tipMethod,
        })
        .where(
          and(eq(schema.deliveryAssignments.id, row.a.id), isNull(schema.deliveryAssignments.delivered_at)),
        )
        .returning({ id: schema.deliveryAssignments.id });
      if (!done) return false; // double tap: someone already marked it

      if (!wasCompleted) {
        await tx
          .update(schema.orders)
          .set({ status: "completed", updated_at: new Date() })
          .where(eq(schema.orders.id, row.o.id));
      }

      if (tipCents > 0 && tipMethod) {
        // Tips live on the payment row so the Financeiro report counts them by method.
        const [payment] = await tx
          .select({ id: schema.payments.id, tip: schema.payments.tip })
          .from(schema.payments)
          .where(
            and(
              eq(schema.payments.order_id, row.o.id),
              eq(schema.payments.method, tipMethod),
              eq(schema.payments.status, "completed"),
            ),
          )
          .orderBy(desc(schema.payments.created_at))
          .limit(1);
        if (payment) {
          await tx
            .update(schema.payments)
            .set({ tip: payment.tip + tipCents })
            .where(eq(schema.payments.id, payment.id));
        } else {
          await tx.insert(schema.payments).values({
            order_id: row.o.id,
            organization_id: tenant.organizationId,
            branch_id: tenant.branchId,
            method: tipMethod,
            amount: 0,
            tip: tipCents,
            reference: "Gorjeta do entregador",
            status: "completed",
          });
        }
      }
      return true;
    });

    if (!marked) return c.json({ success: true, data: { alreadyDelivered: true } });

    if (!wasCompleted) {
      await publishOrderUpdated(tenant.branchId, row.o, "completed");
      try {
        await handleOrderCompletion({
          orderId: row.o.id,
          orderNumber: row.o.order_number,
          orderTotal: row.o.total,
          customerId: row.o.customer_id,
          organizationId: tenant.organizationId,
          branchId: tenant.branchId,
          inventoryDeducted: row.o.inventory_deducted,
        });
      } catch (err) {
        logger.error("deliveries: order completion side effects failed", {
          orderId: row.o.id,
          error: (err as Error).message,
        });
      }
    }

    return c.json({ success: true, data: { delivered: true, cashCollectedCents: cashCollected, tipCents } });
  },
);

// ── GET /drivers — who can receive an assignment ──────────────────

deliveries.get("/drivers", requirePermission("deliveries:manage"), async (c) => {
  const tenant = c.get("tenant") as any;
  const recentSince = new Date(Date.now() - 60 * 24 * 3600 * 1000);

  const dedicated = await db
    .select({ id: schema.users.id, name: schema.users.name, role: schema.users.role })
    .from(schema.users)
    .innerJoin(schema.userBranches, eq(schema.userBranches.user_id, schema.users.id))
    .where(
      and(
        eq(schema.users.organization_id, tenant.organizationId),
        eq(schema.users.is_active, true),
        eq(schema.users.role, "driver"),
        eq(schema.userBranches.branch_id, tenant.branchId),
      ),
    );

  const recent = await db
    .selectDistinct({ id: schema.users.id, name: schema.users.name, role: schema.users.role })
    .from(schema.deliveryAssignments)
    .innerJoin(schema.users, eq(schema.users.id, schema.deliveryAssignments.driver_user_id))
    .where(
      and(
        eq(schema.deliveryAssignments.branch_id, tenant.branchId),
        gte(schema.deliveryAssignments.claimed_at, recentSince),
        eq(schema.users.is_active, true),
      ),
    );

  const seen = new Set<string>();
  const drivers = [...dedicated, ...recent].filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)));
  return c.json({ success: true, data: drivers });
});

// ── PATCH /settings — wait limit ──────────────────────────────────

deliveries.patch(
  "/settings",
  requirePermission("deliveries:manage"),
  zValidator("json", deliverySettingsSchema),
  async (c) => {
    const tenant = c.get("tenant") as any;
    const { waitLimitMinutes } = c.req.valid("json");
    await db
      .update(schema.branches)
      .set({
        settings: sql`COALESCE(${schema.branches.settings}, '{}'::jsonb) || ${JSON.stringify({
          delivery_wait_limit_minutes: waitLimitMinutes,
        })}::jsonb`,
      })
      .where(eq(schema.branches.id, tenant.branchId));
    return c.json({ success: true, data: { waitLimitMinutes } });
  },
);

export { deliveries };
